// src/lib/backend/secureSession.ts
// Bóveda única de sesiones por rol (cliente / profesional / admin):
// - Nativo: SecureStore (cifrado por Keychain/Keystore del SO).
// - Web: cookie persistente (30 días, SameSite=Lax) con el JSON de sesión
//   cifrado en AES-GCM-256. "Mantener sesión" siempre activo; el logout
//   borra la cookie. Ver sessionCrypto.ts para límites honestos.

import * as SecureStore from 'expo-secure-store';
import {
  decryptSession,
  deleteCookie,
  encryptSession,
  getCookie,
  setCookie,
} from './sessionCrypto';

const IS_WEB = typeof window !== 'undefined' && typeof document !== 'undefined';
const COOKIE_DAYS = 30;

function cookieName(namespace: string): string {
  return `lookify_${namespace}_v1`;
}

function lsKey(namespace: string): string {
  return `lookify_${namespace}_v1_enc`;
}

function lsSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsDel(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function devWarn(what: string, error: unknown): void {
  if (__DEV__) {
    console.warn(`[sesión] ${what}:`, error instanceof Error ? error.message : error);
  }
}

export async function vaultSave<T extends { userId: string }>(
  namespace: string,
  storeKey: string,
  data: T,
): Promise<void> {
  if (!IS_WEB) {
    try {
      await SecureStore.setItemAsync(storeKey, JSON.stringify(data));
    } catch (e) {
      devWarn(`no se pudo guardar sesión ${namespace} (nativo)`, e);
    }
    return;
  }
  // Web: cookie cifrada primero; si falla o no se lee de vuelta,
  // localStorage cifrado; último recurso, SecureStore (plano en web).
  try {
    const envelope = await encryptSession(namespace, data.userId, data as unknown as Record<string, unknown>);
    setCookie(cookieName(namespace), envelope, COOKIE_DAYS);
    if (getCookie(cookieName(namespace)) === envelope) {
      lsDel(lsKey(namespace));
      return;
    }
    devWarn(`cookie rechazada para ${namespace}, uso localStorage`, null);
  } catch (e) {
    devWarn(`cifrado de sesión ${namespace} falló`, e);
  }
  try {
    const envelope = await encryptSession(namespace, data.userId, data as unknown as Record<string, unknown>);
    if (!lsSet(lsKey(namespace), envelope)) throw new Error('localStorage no disponible');
  } catch (e) {
    devWarn(`respaldo localStorage de ${namespace} falló`, e);
    try {
      await SecureStore.setItemAsync(storeKey, JSON.stringify(data));
    } catch {
      /* sin persistencia */
    }
  }
}

export async function vaultLoad<T>(namespace: string, storeKey: string): Promise<T | null> {
  if (!IS_WEB) {
    try {
      const raw = await SecureStore.getItemAsync(storeKey);
      if (raw) return JSON.parse(raw) as T;
    } catch (e) {
      devWarn(`no se pudo leer sesión ${namespace} (nativo)`, e);
    }
    return null;
  }
  // 1. Cookie cifrada.
  const fromCookie = getCookie(cookieName(namespace));
  if (fromCookie) {
    const opened = await decryptSession<T>(namespace, fromCookie);
    if (opened) return opened.data;
    // Huella distinta o corrupta: se descarta y se sigue al respaldo.
    deleteCookie(cookieName(namespace));
  }
  // 2. Respaldo localStorage cifrado.
  const fromLs = lsGet(lsKey(namespace));
  if (fromLs) {
    const opened = await decryptSession<T>(namespace, fromLs);
    if (opened) return opened.data;
    lsDel(lsKey(namespace));
  }
  // 3. Legado: sesiones guardadas en plano por SecureStore-web. Se migran.
  try {
    const legacy = await SecureStore.getItemAsync(storeKey);
    if (legacy) {
      const data = JSON.parse(legacy) as T & { userId: string };
      if (data?.userId) {
        await vaultSave(namespace, storeKey, data);
        return data;
      }
    }
  } catch (e) {
    devWarn(`lectura legada de ${namespace} falló`, e);
  }
  return null;
}

export async function vaultClear(namespace: string, storeKey: string): Promise<void> {
  if (!IS_WEB) {
    try {
      await SecureStore.deleteItemAsync(storeKey);
    } catch {
      /* noop */
    }
    return;
  }
  deleteCookie(cookieName(namespace));
  lsDel(lsKey(namespace));
  try {
    await SecureStore.deleteItemAsync(storeKey);
  } catch {
    /* noop */
  }
}
