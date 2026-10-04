import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// KV local por usuario (web: localStorage, nativo: SecureStore).
// Guarda preferencias del profesional: radio de cobertura y servicios
// en pausa. No es backend: si cambia de dispositivo, se reconfigura.
const prefix = (userId: string) => `lookify_${userId}_`;

export async function kvGet(userId: string, key: string): Promise<string | null> {
  const k = prefix(userId) + key;
  if (Platform.OS === 'web') return localStorage.getItem(k);
  return SecureStore.getItemAsync(k);
}

export async function kvSet(userId: string, key: string, value: string): Promise<void> {
  const k = prefix(userId) + key;
  if (Platform.OS === 'web') {
    localStorage.setItem(k, value);
    return;
  }
  await SecureStore.setItemAsync(k, value);
}

export async function kvGetJson<T>(userId: string, key: string, fallback: T): Promise<T> {
  try {
    const raw = await kvGet(userId, key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function kvSetJson(userId: string, key: string, value: unknown): Promise<void> {
  await kvSet(userId, key, JSON.stringify(value));
}
