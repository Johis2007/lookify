import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const ACTIVATION_CODE_LENGTH = 6;
export const ACTIVATION_VIGENCIA_MS = 10 * 60 * 1000;
export const ACTIVATION_MAX_INTENTOS_FALLIDOS = 5;
export const ACTIVATION_BLOQUEO_MS = 15 * 60 * 1000;
export const ACTIVATION_REENVIO_COOLDOWN_MS = 60 * 1000;
export const ACTIVATION_MAX_REENVIOS = 3;

export type ActivationCodeRow = {
  professional: number;
  code_hash: string | null;
  code_expires_at: Date | null;
  failed_attempts: number;
  locked_until: Date | null;
  resends_used: number;
  last_sent_at: Date | null;
};

export type ActivationStateDto = {
  codigoExpirado: boolean;
  bloqueadoHastaMs: number | null;
  reenvioDisponibleEnMs: number | null;
  reenviosRestantes: number;
  sinSalidaActivacion: boolean;
};

export function generateActivationCode(): string {
  return randomInt(0, 10 ** ACTIVATION_CODE_LENGTH)
    .toString()
    .padStart(ACTIVATION_CODE_LENGTH, '0');
}

export function hashActivationCode(secret: string, professionalId: number, code: string): string {
  return createHmac('sha256', secret)
    .update(`${professionalId}:${code}`)
    .digest('hex');
}

export function activationCodeMatches(
  secret: string,
  professionalId: number,
  code: string,
  storedHash: string | null,
): boolean {
  if (!storedHash) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashActivationCode(secret, professionalId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function codeExpired(row: ActivationCodeRow | null, now = Date.now()): boolean {
  if (!row?.code_expires_at) return true;
  return row.code_expires_at.getTime() <= now;
}

export function activationState(
  row: ActivationCodeRow | null,
  now = Date.now(),
): ActivationStateDto {
  const resendsUsed = row?.resends_used ?? 0;
  const resendsRestantes = Math.max(0, ACTIVATION_MAX_REENVIOS - resendsUsed);
  const expired = codeExpired(row, now);
  const lockedUntil = row?.locked_until ? row.locked_until.getTime() : null;
  const blocked = lockedUntil !== null && lockedUntil > now;
  const lastSent = row?.last_sent_at ? row.last_sent_at.getTime() : null;
  const resendAt = lastSent === null ? null : lastSent + ACTIVATION_REENVIO_COOLDOWN_MS;
  return {
    codigoExpirado: expired,
    bloqueadoHastaMs: blocked ? lockedUntil : null,
    reenvioDisponibleEnMs: resendAt !== null && resendAt > now ? resendAt : null,
    reenviosRestantes: resendsRestantes,
    sinSalidaActivacion: expired && resendsRestantes === 0,
  };
}
