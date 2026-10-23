// src/lib/backend/bff.ts
// Cliente mínimo contra el BFF de Lookify (apps/realtime-server, /api/*).
// El BFF es el proxy de datos sensibles: valida reglas de negocio y deriva la
// identidad del token de sesión (nunca del body).

import { BACKEND } from './config';
import { toServiceError } from './directus';

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
    throw toServiceError(0, null, notFoundCode);
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
