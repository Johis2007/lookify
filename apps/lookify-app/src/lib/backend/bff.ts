// src/lib/backend/bff.ts
// Cliente mínimo contra el BFF de Lookify (apps/realtime-server, /api/*).
// El BFF es el proxy de datos sensibles: valida reglas de negocio y deriva la
// identidad del token de sesión (nunca del body).

import { BACKEND } from './config';
import { toServiceError, refreshAccessToken } from './directus';
import { ServiceError } from '../../services/errors';
import { loadBackendSession, saveBackendSession } from './session';

export async function bffApi<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  token: string | null,
  body?: unknown,
  notFoundCode: Parameters<typeof toServiceError>[2] = 'VALIDATION',
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BACKEND.bffUrl + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ServiceError('NETWORK', 'Sin conexión con el backend.');
  }
  if (res.status === 401 && token) {
    const newToken = await refreshTokenIfNeeded(token);
    if (newToken) {
      try {
        res = await fetch(BACKEND.bffUrl + path, {
          method,
          headers: {
            ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        throw new ServiceError('NETWORK', 'Sin conexión con el backend.');
      }
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) throw toServiceError(res.status, data, notFoundCode);
      return (data?.data ?? data) as T;
    }
    throw new ServiceError('INVALID_CREDENTIALS', 'Sesión vencida. Inicia sesión de nuevo.');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw toServiceError(res.status, data, notFoundCode);
  return (data?.data ?? data) as T;
}

async function refreshTokenIfNeeded(token: string): Promise<string | null> {
  const session = await loadBackendSession();
  if (!session?.refreshToken) return null;
  try {
    const refreshed = await refreshAccessToken(session.refreshToken);
    await saveBackendSession({
      ...session,
      token: refreshed.accessToken,
      ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
    });
    return refreshed.accessToken;
  } catch {
    return null;
  }
}
