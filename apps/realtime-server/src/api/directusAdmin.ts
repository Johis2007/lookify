import { HttpError } from './http.js';

// Credencial de servicio del BFF para hablar con Directus. El App User pierde
// create/read/delete sobre directus_files, así que el BFF usa un token de
// servicio con MÍNIMO PRIVILEGIO (solo directus_files). Nunca se expone al cliente
// ni se acepta del body. SIN fallback a ADMIN_EMAIL/ADMIN_PASSWORD.

function directusUrl(): string {
  return (
    process.env.DIRECTUS_URL ||
    process.env.PUBLIC_URL ||
    'http://localhost:8055'
  ).replace(/\/$/, '');
}

const STATIC_TOKEN = process.env.DIRECTUS_TOKEN?.trim();

if (!STATIC_TOKEN) {
  throw new Error(
    'Falta DIRECTUS_TOKEN en el entorno del realtime-server. Usa un token estático de mínimo privilegio (solo directus_files) generado por directus/setup-permissions.mjs. El fallback a ADMIN_EMAIL/ADMIN_PASSWORD ha sido eliminado por seguridad.',
  );
}

export async function adminToken(_force = false): Promise<string> {
  return STATIC_TOKEN as string;
}

/** fetch a Directus con token de servicio de mínimo privilegio. */
export async function adminFetch(
  path: string,
  init: RequestInit = {},
  _retry = true,
): Promise<Response> {
  const token = await adminToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return fetch(`${directusUrl()}${path}`, { ...init, headers });
}

export { directusUrl };
