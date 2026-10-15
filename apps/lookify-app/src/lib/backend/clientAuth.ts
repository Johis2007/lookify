// src/lib/backend/clientAuth.ts
// Auth de cliente contra Directus: login + registro público (igual que
// mobile-web) + perfil client_profiles. Sesión propia en SecureStore.

import { revokeRefreshToken } from './directus';
import { vaultClear, vaultLoad, vaultSave } from './secureSession';
import { ServiceError } from '../../services/errors';
import { BACKEND } from './config';
import { api, loginDirectus } from './directus';

export type ClientSession = {
  token: string;
  refreshToken?: string;
  userId: string;
  email: string;
  nombre: string;
};

const KEY = 'lookify_client_session_v1';

let memory: ClientSession | null = null;

export function isBackendEnabled(): boolean {
  return BACKEND.enabled;
}

export async function saveClientSession(s: ClientSession): Promise<void> {
  // Un solo login válido: revoca la sesión anterior si traía otro refresh.
  const prev = memory ?? (await vaultLoad<ClientSession>('client', KEY));
  memory = s;
  await vaultSave('client', KEY, s);
  if (prev?.refreshToken && prev.refreshToken !== s.refreshToken) {
    await revokeRefreshToken(prev.refreshToken);
  }
}

export async function loadClientSession(): Promise<ClientSession | null> {
  if (memory) return memory;
  memory = await vaultLoad<ClientSession>('client', KEY);
  return memory;
}

export async function clearClientSession(): Promise<void> {
  memory = null;
  await vaultClear('client', KEY);
}

/** Cierre de sesión cliente: olvida el token local. Sin backend es noop. */
export async function logoutClient(): Promise<void> {
  await clearClientSession();
}

function toDisplayName(me: { first_name?: string; last_name?: string; email?: string }): string {
  const full = [me.first_name, me.last_name].filter(Boolean).join(' ').trim();
  return full || me.email || 'Cliente';
}

async function ensureClientProfile(token: string, userId: string, nombre: string, phone?: string): Promise<void> {
  const rows = await api<{ id: number }[]>(
    'GET',
    `/items/client_profiles?filter[user][_eq]=${userId}&fields=id&limit=1`,
    token,
  ).catch(() => []);
  if (rows.length > 0) return;
  await api('POST', '/items/client_profiles', token, {
    user: userId,
    display_name: nombre,
    ...(phone?.trim() ? { phone: phone.trim() } : {}),
  }).catch(() => undefined);
}

/** Login cliente: Directus + perfil (se crea si falta). */
export async function loginClient(email: string, password: string): Promise<ClientSession> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) throw new ServiceError('VALIDATION');
  const { accessToken, refreshToken } = await loginDirectus(cleanEmail, password);
  const me = await api<{ id: string; first_name?: string; last_name?: string; email?: string }>(
    'GET',
    '/users/me?fields=id,first_name,last_name,email',
    accessToken,
  );
  const nombre = toDisplayName(me);
  await ensureClientProfile(accessToken, me.id, nombre);
  const session: ClientSession = {
    token: accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    userId: me.id,
    email: cleanEmail,
    nombre,
  };
  await saveClientSession(session);
  return session;
}

/** Registro cliente: usuario público + login + perfil. El correo queda en DB. */
export async function registerClient(input: {
  nombre: string;
  email: string;
  password: string;
  telefono?: string;
}): Promise<ClientSession> {
  const nombre = input.nombre.trim();
  const cleanEmail = input.email.trim();
  if (!nombre || !cleanEmail || !input.password) throw new ServiceError('VALIDATION');
  await api('POST', '/users', null, {
    email: cleanEmail,
    password: input.password,
    first_name: nombre,
    // Rol directo: el flow de asignación no se ejecuta en esta instancia.
    role: BACKEND.appRoleId,
  });
  const { accessToken, refreshToken } = await loginDirectus(cleanEmail, input.password);
  const me = await api<{ id: string }>('GET', '/users/me?fields=id', accessToken);
  await ensureClientProfile(accessToken, me.id, nombre, input.telefono);
  const session: ClientSession = {
    token: accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    userId: me.id,
    email: cleanEmail,
    nombre,
  };
  await saveClientSession(session);
  return session;
}

export function clientErrorMessage(error: unknown): string {
  if (error instanceof ServiceError) {
    if (error.code === 'INVALID_CREDENTIALS') return 'Correo o contraseña incorrectos';
    if (error.code === 'EMAIL_DUPLICATE') return 'Este correo ya está registrado';
    if (error.code === 'NETWORK') return 'Sin conexión con el servidor. Revisa tu internet.';
    return error.message || 'No se pudo completar. Intenta de nuevo.';
  }
  return 'No se pudo completar. Intenta de nuevo.';
}
