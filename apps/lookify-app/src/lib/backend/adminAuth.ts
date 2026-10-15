// src/lib/backend/adminAuth.ts
// Auth de administrador contra Directus. La capacidad admin se verifica por
// acceso real (GET /users): solo administradores pueden listar usuarios.
// Sesión propia en SecureStore, separada de cliente/profesional.

import * as SecureStore from 'expo-secure-store';
import { ServiceError } from '../../services/errors';
import { BACKEND } from './config';
import { api, loginDirectus } from './directus';

export type AdminSession = {
  token: string;
  userId: string;
  email: string;
  nombre: string;
};

const KEY = 'lookify_admin_session_v1';

let memory: AdminSession | null = null;

export async function saveAdminSession(s: AdminSession): Promise<void> {
  memory = s;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  } catch {
    /* solo memoria */
  }
}

export async function loadAdminSession(): Promise<AdminSession | null> {
  if (memory) return memory;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) memory = JSON.parse(raw) as AdminSession;
  } catch {
    memory = null;
  }
  return memory;
}

export async function clearAdminSession(): Promise<void> {
  memory = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* noop */
  }
}

/** Login admin: credenciales + verificación de capacidad administradora. */
export async function loginAdmin(email: string, password: string): Promise<AdminSession> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) throw new ServiceError('VALIDATION');
  const { accessToken } = await loginDirectus(cleanEmail, password);
  // Solo admin puede listar usuarios: 403 = no es administrador.
  try {
    await api<unknown[]>('GET', '/users?limit=1&fields=id', accessToken);
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'PROFESIONAL_NO_HABILITADO') {
      throw new ServiceError('VALIDATION', 'Esta cuenta no es administradora.');
    }
    throw e;
  }
  const me = await api<{ id: string; first_name?: string; last_name?: string; email?: string }>(
    'GET',
    '/users/me?fields=id,first_name,last_name,email',
    accessToken,
  );
  const nombre =
    [me.first_name, me.last_name].filter(Boolean).join(' ').trim() || me.email || 'Admin';
  const session: AdminSession = { token: accessToken, userId: me.id, email: cleanEmail, nombre };
  await saveAdminSession(session);
  return session;
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
    if (e instanceof ServiceError && e.code === 'INVALID_CREDENTIALS') {
      await clearAdminSession();
    }
    throw e;
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
