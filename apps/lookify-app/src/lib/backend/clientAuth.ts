// src/lib/backend/clientAuth.ts
// Auth de cliente contra Directus: login + registro público (igual que
// mobile-web) + perfil client_profiles. Sesión propia en SecureStore.

import { revokeRefreshToken } from './directus';
import { vaultClear, vaultLoad, vaultSave } from './secureSession';
import { ServiceError } from '../../services/errors';
import { BACKEND } from './config';
import { api, loginDirectus } from './directus';
import { bffApi } from './bff';
import { findMockUser } from '../../data/mockUsers';

export type ClientSession = {
  token: string;
  refreshToken?: string;
  userId: string;
  email: string;
  nombre: string;
  /** true cuando se entró sin conexión (caché o demo). */
  offline?: boolean;
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

type BffMe = { id: string; firstName?: string | null; lastName?: string | null };

function toDisplayName(me: BffMe, fallback: string): string {
  const full = [me.firstName, me.lastName].filter(Boolean).join(' ').trim();
  return full || fallback || 'Cliente';
}

export async function ensureClientProfile(token: string, _userId: string, nombre: string, phone?: string): Promise<void> {
  // Ola 2a: el perfil se crea/actualiza solo por el BFF; el user sale del JWT.
  await bffApi(
    'POST',
    '/api/clients/me',
    token,
    {
      displayName: nombre,
      ...(phone?.trim() ? { phone: phone.trim() } : {}),
    },
    'VALIDATION',
  ).catch(() => undefined);
}

/** Login cliente: Directus + perfil (se crea si falta). Sin red → offline. */
export async function loginClient(email: string, password: string): Promise<ClientSession> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) throw new ServiceError('VALIDATION');
  try {
    const { accessToken, refreshToken } = await loginDirectus(cleanEmail, password);
    const me = await bffApi<BffMe>('GET', '/api/users/me', accessToken);
    const nombre = toDisplayName(me, cleanEmail);
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
  } catch (e) {
    if (!(e instanceof ServiceError) || e.code !== 'NETWORK') throw e;
    // Offline: sesión guardada del mismo correo, mock local o demo genérico.
    const cached = (memory ?? (await vaultLoad<ClientSession>('client', KEY).catch(() => null))) as ClientSession | null;
    if (cached && cached.email.trim().toLowerCase() === cleanEmail.toLowerCase()) {
      return { ...cached, email: cleanEmail, offline: true };
    }
    const mock = findMockUser(cleanEmail, password);
    const nombre = mock?.nombre || cleanEmail.split('@')[0]?.trim() || 'Usuario offline';
    const session: ClientSession = {
      token: 'offline-local',
      userId: `offline-${cleanEmail.toLowerCase()}`,
      email: cleanEmail,
      nombre,
      offline: true,
    };
    await saveClientSession(session).catch(() => undefined);
    return session;
  }
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
  const me = await bffApi<{ id: string }>('GET', '/api/users/me', accessToken);
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
