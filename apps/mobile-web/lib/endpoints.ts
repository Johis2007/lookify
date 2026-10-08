// Endpoints multi-red con fallback automático (tarea 1: entornos y red).
//
// Contexto: el equipo se mueve entre la red local (ej. 192.168.1.8) y la red
// de la universidad (ej. 10.157.39.169). Las EXPO_PUBLIC_* quedan compiladas
// en el bundle, así que si el Wi-Fi cambia, la URL primaria deja de responder.
// Este módulo:
//  1. Construye la lista de candidatos desde las env vars (primaria + lista
//     separada por comas) + fallback a localhost.
//  2. Hace health-check con timeout y memoriza la primera URL que responde.
//  3. Expone fetch con reintento en la siguiente candidata ante fallo de red.
//
// Env vars soportadas (ver .env.example):
//   EXPO_PUBLIC_DIRECTUS_URL / EXPO_PUBLIC_DIRECTUS_URLS (coma-separadas)
//   EXPO_PUBLIC_SOCKET_URL   / EXPO_PUBLIC_SOCKET_URLS   (coma-separadas)
function splitList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((u) => {
    const k = u.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function envAt(buildKey: string, runtimeKey: string): string | undefined {
  // EXPO_PUBLIC_* se inyectan en build; en web también pueden venir por window.
  const fromProcess =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>)[buildKey]
      : undefined;
  if (fromProcess) return fromProcess;
  try {
    const w = (globalThis as any)?.window;
    const v = w?.__LOOKIFY_ENV__?.[runtimeKey];
    if (typeof v === 'string' && v) return v;
  } catch {
    /* noop */
  }
  return undefined;
}

// --- Candidatas ---------------------------------------------------------------

export function directusCandidates(): string[] {
  const primary = envAt('EXPO_PUBLIC_DIRECTUS_URL', 'DIRECTUS_URL');
  const extra = splitList(envAt('EXPO_PUBLIC_DIRECTUS_URLS', 'DIRECTUS_URLS'));
  return dedupe([...(primary ? [primary.replace(/\/+$/, '')] : []), ...extra, 'http://localhost:8055']);
}

export function socketCandidates(): string[] {
  const primary = envAt('EXPO_PUBLIC_SOCKET_URL', 'SOCKET_URL');
  const extra = splitList(envAt('EXPO_PUBLIC_SOCKET_URLS', 'SOCKET_URLS'));
  return dedupe([...(primary ? [primary.replace(/\/+$/, '')] : []), ...extra, 'http://localhost:4001']);
}

// --- Health-check con timeout --------------------------------------------------

async function ping(url: string, path: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}${path}`, { signal: ctrl.signal });
    // Directus /server/ping responde 200 (o 204 sin auth según versión);
    // el realtime /health responde 200/503 con JSON. Basta con que responda.
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

let directusOk: string | null = null;
let socketOk: string | null = null;
let directusInflight: Promise<string> | null = null;
let socketInflight: Promise<string> | null = null;

/** Primera URL de Directus que responde (memorizada). */
export function resolveDirectusUrl(timeoutMs = 3500): Promise<string> {
  if (directusOk) return Promise.resolve(directusOk);
  if (directusInflight) return directusInflight;
  directusInflight = (async () => {
    for (const url of directusCandidates()) {
      if (await ping(url, '/server/ping', timeoutMs)) {
        directusOk = url;
        return url;
      }
    }
    // Sin red: devuelve la primaria para que el error sea el habitual.
    const [first] = directusCandidates();
    directusOk = first;
    return first;
  })().finally(() => {
    directusInflight = null;
  });
  return directusInflight;
}

/** Primera URL del realtime-server que responde (memorizada). */
export function resolveSocketUrl(timeoutMs = 3500): Promise<string> {
  if (socketOk) return Promise.resolve(socketOk);
  if (socketInflight) return socketInflight;
  socketInflight = (async () => {
    for (const url of socketCandidates()) {
      if (await ping(url, '/health', timeoutMs)) {
        socketOk = url;
        return url;
      }
    }
    const [first] = socketCandidates();
    socketOk = first;
    return first;
  })().finally(() => {
    socketInflight = null;
  });
  return socketInflight;
}

/** Olvida la URL memorizada (ej. tras cambiar de Wi-Fi) y re-resuelve. */
export function resetEndpointCache() {
  directusOk = null;
  socketOk = null;
}

/** Marca la URL actual como caída para forzar fallback en la próxima llamada. */
export function markDirectusBroken(url: string) {
  if (directusOk === url) directusOk = null;
}

export function markSocketBroken(url: string) {
  if (socketOk === url) socketOk = null;
}

/** Fetch contra Directus con fallback entre candidatas ante fallo de red. */
export async function directusFetch(path: string, init?: RequestInit): Promise<Response> {
  const tried = new Set<string>();
  let lastErr: unknown = null;
  // 1. La URL que ya sabemos que funciona.
  const preferred = await resolveDirectusUrl().catch(() => directusCandidates()[0]);
  const ordered = dedupe([preferred, ...directusCandidates()]);
  for (const base of ordered) {
    if (tried.has(base)) continue;
    tried.add(base);
    try {
      return await fetch(`${base}${path}`, init);
    } catch (e) {
      lastErr = e;
      markDirectusBroken(base);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Sin conexión con el servidor.');
}

/** Estado de conectividad para mostrar en UI ("Conectado a 192.168.1.8…"). */
export async function endpointStatus(): Promise<{
  directus: string;
  socket: string;
  directusCandidates: string[];
  socketCandidates: string[];
}> {
  const [directus, socket] = await Promise.all([
    resolveDirectusUrl(2500).catch(() => directusCandidates()[0]),
    resolveSocketUrl(2500).catch(() => socketCandidates()[0]),
  ]);
  return { directus, socket, directusCandidates: directusCandidates(), socketCandidates: socketCandidates() };
}
