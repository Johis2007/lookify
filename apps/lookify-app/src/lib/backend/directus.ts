// src/lib/backend/directus.ts
// Cliente REST mínimo contra Directus (mismo estilo que mobile-web: fetch
// directo, sin SDK). Mapea errores HTTP a ServiceError del frontend.

import { BACKEND } from './config';
import { ServiceError, ServiceErrorCode } from '../../services/errors';

export type DirectusFile = { id: string };

async function readJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toServiceError(status: number, body: any, fallback: ServiceErrorCode): ServiceError {
  const raw = JSON.stringify(body ?? '');
  if (status === 401) return new ServiceError('INVALID_CREDENTIALS');
  if (status === 403) return new ServiceError('PROFESIONAL_NO_HABILITADO');
  if (status === 404) return new ServiceError(fallback);
  if (status === 409) return new ServiceError('SOLICITUD_NO_VIGENTE');
  if (status === 400) {
    if (raw.includes('LIMIT_EXCEEDED') || raw.includes('seats limit')) {
      return new ServiceError('UNKNOWN', 'Cupo de usuarios lleno por el momento.');
    }
    if (/unique|RECORD_NOT_UNIQUE|already exists/i.test(raw)) {
      return new ServiceError('EMAIL_DUPLICATE');
    }
    return new ServiceError('VALIDATION');
  }
  if (status === 429) return new ServiceError('BLOQUEO_TEMPORAL');
  if (status >= 500) return new ServiceError('NETWORK', 'Error del servidor. Intenta más tarde.');
  return new ServiceError('VALIDATION', body?.errors?.[0]?.message);
}

export async function loginDirectus(email: string, password: string): Promise<{ accessToken: string; refreshToken?: string }> {  let res: Response;
  try {
    res = await fetch(`${BACKEND.directusUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, mode: 'json' }),
    });
  } catch {
    throw new ServiceError('NETWORK', 'Sin conexión con el backend.');
  }
  const body = await readJsonSafe(res);
  if (!res.ok || !body?.data?.access_token) {
    throw toServiceError(res.status, body, 'INVALID_CREDENTIALS');
  }
  return { accessToken: body.data.access_token, refreshToken: body.data?.refresh_token };
}

/** Revoca un refresh token en el servidor (un solo login válido). Best-effort. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await fetch(`${BACKEND.directusUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken, mode: 'json' }),
    });
  } catch {
    /* si no hay red, el token viejo expira solo */
  }
}
/** Renueva el access token con el refresh token (sesiones largas en panel). */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND.directusUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken, mode: 'json' }),
    });
  } catch {
    throw new ServiceError('NETWORK', 'Sin conexión con el backend.');
  }
  const body = await readJsonSafe(res);
  if (!res.ok || !body?.data?.access_token) {
    throw new ServiceError('INVALID_CREDENTIALS', 'Sesión vencida.');
  }
  return { accessToken: body.data.access_token, refreshToken: body.data?.refresh_token };
}

export async function api<T = any>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  token: string | null,
  body?: unknown,
  notFoundCode: ServiceErrorCode = 'VALIDATION',
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BACKEND.directusUrl + path, {
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
  if (res.status === 204) return undefined as T;
  const data = await readJsonSafe(res);
  if (!res.ok) throw toServiceError(res.status, data, notFoundCode);
  return (data?.data ?? data) as T;
}

/** Sube un archivo local (picker) a /files de Directus. Devuelve el file id. */
export async function uploadFile(
  token: string,
  uri: string,
  name: string,
  mimeType: string,
): Promise<string> {
  const form = new FormData();
  form.append('file', { uri, name, type: mimeType } as any);
  let res: Response;
  try {
    res = await fetch(`${BACKEND.directusUrl}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new ServiceError('NETWORK', 'Sin conexión con el backend.');
  }
  const data = await readJsonSafe(res);
  if (!res.ok || !data?.data?.id) {
    if (res.status === 413) throw new ServiceError('ARCHIVO_MUY_GRANDE');
    throw toServiceError(res.status, data, 'VALIDATION');
  }
  return String(data.data.id);
}

export const assetUrl = (fileId?: string | null): string | undefined =>
  fileId ? `${BACKEND.directusUrl}/assets/${fileId}` : undefined;
