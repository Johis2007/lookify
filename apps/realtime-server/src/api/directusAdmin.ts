import { HttpError } from './http.js';

// Credencial de servicio del BFF para hablar con Directus. El App User pierde
// create/read/delete sobre directus_files y read sobre directus_users, así que
// el BFF usa un token de servicio (DIRECTUS_TOKEN o login ADMIN_EMAIL/PASSWORD).
// Nunca se expone al cliente ni se acepta del body.

function directusUrl(): string {
  return (
    process.env.DIRECTUS_URL ||
    process.env.PUBLIC_URL ||
    'http://localhost:8055'
  ).replace(/\/$/, '');
}

type Cached = { token: string; expiresAt: number };
let cached: Cached | null = null;

async function loginAdmin(): Promise<Cached> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new HttpError(500, 'directus_credentials_missing');
  }
  const res = await fetch(`${directusUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: { access_token?: string; expires?: number } }
    | null;
  const token = json?.data?.access_token;
  if (!res.ok || !token) throw new HttpError(502, 'directus_auth_failed');
  const ttlMs = Number(json?.data?.expires || 900_000);
  return { token, expiresAt: Date.now() + Math.max(30_000, ttlMs - 60_000) };
}

export async function adminToken(force = false): Promise<string> {
  const staticToken = process.env.DIRECTUS_TOKEN?.trim();
  if (staticToken) return staticToken;
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  cached = await loginAdmin();
  return cached.token;
}

/** fetch a Directus con token de servicio; reintenta una vez si expiró. */
export async function adminFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = await adminToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(`${directusUrl()}${path}`, { ...init, headers });
  if (res.status === 401 && retry && !process.env.DIRECTUS_TOKEN) {
    await adminToken(true);
    return adminFetch(path, init, false);
  }
  return res;
}

export { directusUrl };
