// src/lib/backend/sessionCrypto.ts
// Cripto pura (sin imports RN: testeable en node). Web: AES-GCM-256 sobre el
// JSON de sesión antes de guardarlo en cookie. La clave se deriva (PBKDF2)
// de la huella del navegador + usuario: no se almacena en ningún lado.
// Límite honesto: protege contra robo casual del storage, no contra XSS
// decidido (limitación estándar web). La protección real es el access token
// de 15 min + refresh rotado. En nativo no se usa (SecureStore ya cifra).

const ENC = 'lookify-enc:v1';
const ITERATIONS = 50_000;

function bytesToB64(bytes: Uint8Array<ArrayBufferLike>): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function utf8Bytes(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(text).buffer as ArrayBuffer);
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', utf8Bytes(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Huella del navegador (no secreta): solo material para derivar la clave. */
export async function browserFingerprint(): Promise<string> {
  const w = window as any;
  const parts = [
    navigator.userAgent,
    `${w.screen?.width ?? 0}x${w.screen?.height ?? 0}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    navigator.language ?? '',
  ].join('|');
  return sha256Hex(`lookify-device:v1|${parts}`);
}

async function deriveKey(fingerprint: string, userId: string, namespace: string): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    utf8Bytes(`${ENC}|${fingerprint}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: utf8Bytes(`${namespace}|${userId}`),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Cifra el objeto de sesión. Devuelve sobre `{u, iv, ct}` en base64. */
export async function encryptSession(
  namespace: string,
  userId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const key = await deriveKey(await browserFingerprint(), userId, namespace);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    utf8Bytes(JSON.stringify(data)),
  );
  return bytesToB64(
    utf8Bytes(JSON.stringify({ u: userId, iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) })),
  );
}

/** Descifra el sobre. null si cambió el navegador, el usuario o está corrupto. */
export async function decryptSession<T>(
  namespace: string,
  envelopeB64: string,
): Promise<{ userId: string; data: T } | null> {
  try {
    const env = JSON.parse(new TextDecoder().decode(b64ToBytes(envelopeB64))) as {
      u: string;
      iv: string;
      ct: string;
    };
    if (!env?.u || !env?.iv || !env?.ct) return null;
    const key = await deriveKey(await browserFingerprint(), env.u, namespace);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(env.iv) },
      key,
      b64ToBytes(env.ct),
    );
    return { userId: env.u, data: JSON.parse(new TextDecoder().decode(pt)) as T };
  } catch {
    return null;
  }
}

// ---------- Cookies (solo web) ----------

function canUseCookies(): boolean {
  return typeof document !== 'undefined' && typeof document.cookie === 'string';
}

export function setCookie(name: string, value: string, days: number): void {
  if (!canUseCookies()) return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? ';Secure' : '';
  document.cookie =
    `${name}=${encodeURIComponent(value)};Max-Age=${days * 86400};Path=/;SameSite=Lax${secure}`;
}

export function getCookie(name: string): string | null {
  if (!canUseCookies()) return null;
  const parts = document.cookie.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    if (p.slice(0, idx).trim() === name) return decodeURIComponent(p.slice(idx + 1));
  }
  return null;
}

export function deleteCookie(name: string): void {
  if (!canUseCookies()) return;
  document.cookie = `${name}=;Max-Age=0;Path=/;SameSite=Lax`;
}
