import { createDirectus, rest, authentication } from '@directus/sdk';
import { login, logout, refresh, registerUser, readMe } from '@directus/sdk';

const DIRECTUS_URL = process.env.EXPO_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';

export const directus = createDirectus(DIRECTUS_URL)
  .with(rest())
  .with(authentication('json', { autoRefresh: true, storage: undefined }));

/**
 * Login con email y password
 */
export async function loginUser(email: string, password: string) {
  try {
    await directus.request(login({ email, password }));
    const user = await directus.request(readMe());
    return { user, error: null };
  } catch (e: any) {
    return { user: null, error: e.errors?.[0]?.message || 'Error al iniciar sesión' };
  }
}

/**
 * Registro de usuario nuevo
 */
export async function registerUserDirectus(email: string, password: string) {
  try {
    await directus.request(registerUser(email, password));
    // After registration, login to get auth
    await directus.request(login({ email, password }));
    const user = await directus.request(readMe());
    return { user, error: null };
  } catch (e: any) {
    return { user: null, error: e.errors?.[0]?.message || 'Error al registrar' };
  }
}

/**
 * Logout
 */
export async function logoutUser() {
  await directus.request(logout());
}

/**
 * Obtener usuario actual
 */
export async function getCurrentUser() {
  try {
    const user = await directus.request(readMe());
    return { user, error: null };
  } catch {
    return { user: null, error: 'No autenticado' };
  }
}

/**
 * Refrescar token manualmente
 */
export async function refreshToken() {
  try {
    await directus.request(refresh());
    return { success: true };
  } catch {
    return { success: false };
  }
}

export default directus;