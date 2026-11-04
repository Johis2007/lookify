// src/lib/backend/adminAuth.ts
// Auth de administrador contra Directus. Solo entra el rol "Administrator"
// (verificado por nombre de rol: el rol App también lista usuarios).
// Sesión propia en la bóveda, separada de cliente/profesional.

import { Platform } from 'react-native';
import { vaultClear, vaultLoad, vaultSave } from './secureSession';
import { ServiceError } from '../../services/errors';
import { api, loginDirectus, refreshAccessToken, revokeRefreshToken } from './directus';
import { bffApi } from './bff';

export type AdminSession = {
  token: string;
  refreshToken?: string;
  userId: string;
  email: string;
  nombre: string;
  /** true cuando se entró sin conexión. */
  offline?: boolean;
};

const KEY = 'lookify_admin_session_v1';

// Web: sesión solo en memoria + sessionStorage (sin refresh token). Así cerrar
// la pestaña cierra la sesión y no queda nada persistente 30 días.
const IS_WEB = Platform.OS === 'web';
const WEB_STORE_KEY = 'lookify_admin_session_web_v1';

export const WEB_ADMIN_ONLY_MESSAGE =
  'La versión web es solo para administradores. Usa la app móvil.';

let memory: AdminSession | null = null;

function webStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function loadWebSession(): AdminSession | null {
  const store = webStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(WEB_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed?.token || !parsed?.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveWebSession(s: AdminSession): void {
  const store = webStorage();
  if (!store) return;
  try {
    // El refresh token nunca sale de memoria.
    const { refreshToken: _refreshToken, ...persisted } = s;
    store.setItem(WEB_STORE_KEY, JSON.stringify(persisted));
  } catch {
    /* sin sessionStorage: la sesión vive solo en memoria */
  }
}

function clearWebSession(): void {
  const store = webStorage();
  try {
    store?.removeItem(WEB_STORE_KEY);
  } catch {
    /* noop */
  }
}

/** Lee el claim admin_access del JWT (solo web). undefined si no se puede leer. */
function adminAccessClaim(token: string): boolean | undefined {
  try {
    const part = token.split('.')[1];
    if (!part || typeof atob !== 'function') return undefined;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { admin_access?: unknown };
    return typeof payload.admin_access === 'boolean' ? payload.admin_access : undefined;
  } catch {
    return undefined;
  }
}

export async function saveAdminSession(s: AdminSession): Promise<void> {
  // Un solo login válido: revoca la sesión anterior si traía otro refresh.
  const prev = memory ?? (IS_WEB ? null : await vaultLoad<AdminSession>('admin', KEY));
  memory = s;
  if (IS_WEB) {
    saveWebSession(s);
  } else {
    await vaultSave('admin', KEY, s);
  }
  if (prev?.refreshToken && prev.refreshToken !== s.refreshToken) {
    await revokeRefreshToken(prev.refreshToken);
  }
}

export async function loadAdminSession(): Promise<AdminSession | null> {
  if (memory) return memory;
  if (IS_WEB) {
    memory = loadWebSession();
    return memory;
  }
  memory = await vaultLoad<AdminSession>('admin', KEY);
  return memory;
}

export async function clearAdminSession(): Promise<void> {
  memory = null;
  if (IS_WEB) {
    clearWebSession();
    // Limpia restos de versiones anteriores (cookie/localStorage cifrados).
    try {
      await vaultClear('admin', KEY);
    } catch {
      /* noop */
    }
    return;
  }
  await vaultClear('admin', KEY);
}

/** Logout explícito: revoca el refresh (si sigue en memoria) y borra la sesión. */
export async function logoutAdmin(): Promise<void> {
  const current = memory ?? (IS_WEB ? loadWebSession() : await vaultLoad<AdminSession>('admin', KEY).catch(() => null));
  const refresh = current?.refreshToken;
  await clearAdminSession();
  if (refresh) {
    try {
      await revokeRefreshToken(refresh);
    } catch {
      /* sin red: la sesión local ya quedó cerrada */
    }
  }
}

/** ¿El token es de un administrador? (rol "Administrator" real). */
export async function isAdminToken(token: string): Promise<boolean> {
  try {
    const me = await api<{ role?: string }>('GET', '/users/me?fields=role', token);
    if (!me?.role) return false;
    const role = await api<{ name?: string }>('GET', `/roles/${me.role}?fields=name`, token);
    return role?.name === 'Administrator';
  } catch {
    return false;
  }
}

/** Login admin: credenciales + verificación de capacidad administradora. Sin red → caché. */
export async function loginAdmin(email: string, password: string): Promise<AdminSession> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) throw new ServiceError('VALIDATION');
  try {
    const { accessToken, refreshToken } = await loginDirectus(cleanEmail, password);
    // Puerta UX: si el claim existe y es false, ni siquiera se consulta el rol.
    if (adminAccessClaim(accessToken) === false) {
      if (refreshToken) await revokeRefreshToken(refreshToken);
      throw new ServiceError('VALIDATION', 'Esta cuenta no es administradora.');
    }
    // El rol App también lista usuarios: solo el rol Administrator entra.
    if (!(await isAdminToken(accessToken))) {
      // No deja sesión colgada: revoca el refresh recién emitido.
      if (refreshToken) await revokeRefreshToken(refreshToken);
      throw new ServiceError('VALIDATION', 'Esta cuenta no es administradora.');
    }
    const me = await api<{ id: string; first_name?: string; last_name?: string; email?: string }>(
      'GET',
      '/users/me?fields=id,first_name,last_name,email',
      accessToken,
    );
    const nombre =
      [me.first_name, me.last_name].filter(Boolean).join(' ').trim() || me.email || 'Admin';
    const session: AdminSession = {
      token: accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      userId: me.id,
      email: cleanEmail,
      nombre,
    };
    await saveAdminSession(session);
    return session;
  } catch (e) {
    if (!(e instanceof ServiceError) || e.code !== 'NETWORK') throw e;
    // Web admin-only: sin reanudación offline.
    if (IS_WEB) throw new ServiceError('NETWORK', 'Sin conexión con el backend.');
    const cached = (memory ?? (await vaultLoad<AdminSession>('admin', KEY).catch(() => null))) as AdminSession | null;
    if (cached && cached.email.trim().toLowerCase() === cleanEmail.toLowerCase()) {
      return { ...cached, email: cleanEmail, offline: true };
    }
    throw new ServiceError('NETWORK', 'Sin conexión con el backend.');
  }
}

/** Lanza INVALID_CREDENTIALS si no hay sesión (las pantallas redirigen). */
export async function requireAdminToken(): Promise<string> {
  const s = await loadAdminSession();
  if (!s) throw new ServiceError('INVALID_CREDENTIALS', 'Sesión de admin vencida.');
  return s.token;
}

export async function adminApi<T = any>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await requireAdminToken();
  try {
    return await api<T>(method, path, token, body);
  } catch (e) {
    // Token vencido (15 min): un intento de refresh antes de rendirse.
    if (e instanceof ServiceError && e.code === 'INVALID_CREDENTIALS') {
      const renewed = await tryRefreshAdminToken();
      if (renewed) return api<T>(method, path, renewed, body);
      await clearAdminSession();
    }
    throw e;
  }
}

/** Llamada admin al BFF con el token Directus y refresh ante 401. */
export async function adminBffApi<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await requireAdminToken();
  try {
    return await bffApi<T>(method, path, token, body);
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'INVALID_CREDENTIALS') {
      const renewed = await tryRefreshAdminToken();
      if (renewed) return bffApi<T>(method, path, renewed, body);
      await clearAdminSession();
    }
    throw e;
  }
}

/** Renueva el token admin guardado. null si no hay refresh posible. */
async function tryRefreshAdminToken(): Promise<string | null> {
  const s = await loadAdminSession();
  if (!s?.refreshToken) return null;
  try {
    const { accessToken, refreshToken } = await refreshAccessToken(s.refreshToken);
    await saveAdminSession({
      ...s,
      token: accessToken,
      refreshToken: refreshToken ?? s.refreshToken,
    });
    return accessToken;
  } catch {
    return null;
  }
}

export function adminErrorMessage(error: unknown): string {
  if (error instanceof ServiceError) {
    if (error.code === 'INVALID_CREDENTIALS') return 'Correo o contraseña incorrectos';
    if (error.code === 'NETWORK') return 'Sin conexión con el servidor. Revisa tu internet.';
    return error.message || 'No se pudo completar. Intenta de nuevo.';
  }
  return 'No se pudo completar. Intenta de nuevo.';
}
