// src/lib/backend/session.ts
// Sesión del backend (Directus): token + ids en memoria, persistidos en
// SecureStore para sobrevivir reinicios. Las pantallas siguen pasando
// profesionalId/solicitudId por params; los servicios backend resuelven el
// numérico desde esos strings o desde esta sesión.

import * as SecureStore from 'expo-secure-store';

export type BackendSession = {
  token: string;
  refreshToken?: string;
  userId: string;
  professionalId: number;
  email: string;
  nombre: string;
};

const KEY = 'lookify_backend_session_v1';

let memory: BackendSession | null = null;

export async function saveBackendSession(s: BackendSession): Promise<void> {
  memory = s;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  } catch {
    /* sin storage seguro: queda solo en memoria */
  }
}

export async function loadBackendSession(): Promise<BackendSession | null> {
  if (memory) return memory;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) memory = JSON.parse(raw) as BackendSession;
  } catch {
    memory = null;
  }
  return memory;
}

export async function clearBackendSession(): Promise<void> {
  memory = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* noop */
  }
}

/** professionalId numérico desde un string de ruta ("3", "bk-3") o sesión. */
export async function resolveProfessionalId(
  profesionalId?: string,
  solicitudId?: string,
): Promise<number> {
  const fromParam = parseProId(profesionalId) ?? parseProId(solicitudId);
  if (fromParam !== null) return fromParam;
  const s = await loadBackendSession();
  if (s) return s.professionalId;
  throw new Error('Sin sesión de profesional');
}

function parseProId(v?: string): number | null {
  if (!v) return null;
  const m = /(\d+)\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** solicitudId sintética estable para el modo backend ("bk-<proId>"). */
export function backendSolicitudId(professionalId: number): string {
  return `bk-${professionalId}`;
}
