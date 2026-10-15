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

export async function vaultSave<T extends { userId: string }>(
  namespace: string,
  storeKey: string,
  data: T,
): Promise<void> {
  if (!IS_WEB) {
    try {
      await SecureStore.setItemAsync(storeKey, JSON.stringify(data));
    } catch {
      /* sin storage seguro */
    }
    return;
  }
  try {
    const envelope = await encryptSession(namespace, data.userId, data as unknown as Record<string, unknown>);
    setCookie(cookieName(namespace), envelope, COOKIE_DAYS);
  } catch {
    /* sin cripto web (navegador viejo): no persiste */
  }
}

export async function vaultLoad<T>(namespace: string, storeKey: string): Promise<T | null> {
  if (!IS_WEB) {
    try {
      const raw = await SecureStore.getItemAsync(storeKey);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      /* noop */
    }
    return null;
  }
  const envelope = getCookie(cookieName(namespace));
  if (!envelope) return null;
  const opened = await decryptSession<T>(namespace, envelope);
  // Si no abre (navegador actualizado = huella distinta), se descarta.
  if (!opened) deleteCookie(cookieName(namespace));
  return opened?.data ?? null;
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
}
