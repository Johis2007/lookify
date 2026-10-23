// src/lib/backend/adminAuth.ts
// Auth de administrador contra Directus. Solo entra el rol "Administrator"
// (verificado por nombre de rol: el rol App también lista usuarios).
// Sesión propia en la bóveda, separada de cliente/profesional.

import { vaultClear, vaultLoad, vaultSave } from './secureSession';
import { ServiceError } from '../../services/errors';
import { api, loginDirectus, refreshAccessToken, revokeRefreshToken } from './directus';

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

let memory: AdminSession | null = null;

export async function saveAdminSession(s: AdminSession): Promise<void> {
  // Un solo login válido: revoca la sesión anterior si traía otro refresh.
  const prev = memory ?? (await vaultLoad<AdminSession>('admin', KEY));
  memory = s;
  await vaultSave('admin', KEY, s);
  if (prev?.refreshToken && prev.refreshToken !== s.refreshToken) {
    await revokeRefreshToken(prev.refreshToken);
  }
}

export async function loadAdminSession(): Promise<AdminSession | null> {
  if (memory) return memory;
  memory = await vaultLoad<AdminSession>('admin', KEY);
  return memory;
}

export async function clearAdminSession(): Promise<void> {
  memory = null;
  await vaultClear('admin', KEY);
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
