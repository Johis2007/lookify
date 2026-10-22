import type pg from 'pg';
import { resolveOwnProfessionalId, type AuthedUser } from './auth.js';

// 4C-2: rastreo en vivo por reserva.
// - La última posición vive en Redis con TTL corto (respaldo por polling).
// - El histórico en PostGIS se poda con scripts/gps-cleanup.mjs (30 días).

export const TRACKING_TTL_SECONDS = 120;
export const TRACKING_MIN_INTERVAL_MS = 2000;
export const GPS_RETENTION_DAYS = 30;

export type LastPosition = { lat: number; lng: number; ts: number };

export type TrackingRedis = {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

export function trackingKey(bookingId: number | string): string {
  return `tracking:${bookingId}`;
}

export async function readLastPosition(
  redis: TrackingRedis,
  bookingId: number | string,
): Promise<LastPosition | null> {
  const raw = await redis.get(trackingKey(bookingId));
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<LastPosition>;
    if (
      typeof p.lat !== 'number' ||
      typeof p.lng !== 'number' ||
      typeof p.ts !== 'number'
    ) {
      return null;
    }
    return { lat: p.lat, lng: p.lng, ts: p.ts };
  } catch {
    return null;
  }
}

export async function saveLastPosition(
  redis: TrackingRedis,
  bookingId: number | string,
  pos: LastPosition,
): Promise<void> {
  await redis.set(trackingKey(bookingId), JSON.stringify(pos), 'EX', TRACKING_TTL_SECONDS);
}

/**
 * Autoriza el relevo de GPS de una reserva: el emisor debe ser el profesional
 * ASIGNADO (derivado del token), estar verificado y la reserva debe seguir en
 * 'accepted'. Devuelve null si no cumple (no se releva nada).
 */
export async function resolveAssignedProfessionalForTracking(
  pool: pg.Pool,
  user: AuthedUser,
  bookingIdRaw: unknown,
): Promise<{ bookingId: number; professionalId: number; status: string } | null> {
  if (user.isAdmin) return null;
  const bookingId = Number(bookingIdRaw);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return null;
  const { rows } = await pool.query<{
    id: number;
    professional: number | null;
    status: string | null;
    pro_user: string | null;
    verification_status: string | null;
  }>(
    `SELECT b.id, b.professional, b.status,
            bp."user" AS pro_user, bp.verification_status
       FROM bookings b
       LEFT JOIN beauty_professionals bp ON bp.id = b.professional
      WHERE b.id = $1`,
    [bookingId],
  );
  const b = rows[0];
  if (!b || b.professional === null) return null;
  if (b.pro_user !== user.userId) return null;
  if (b.verification_status !== 'verified') return null;
  if (b.status !== 'accepted') return null;
  return { bookingId: b.id, professionalId: b.professional, status: b.status };
}

/**
 * Autoriza entrar a la sala booking:{id} para tracking: SOLO el cliente dueño
 * o el profesional asignado. Un admin u otro usuario reciben null.
 */
export async function resolveTrackingParticipant(
  pool: pg.Pool,
  user: AuthedUser,
  bookingIdRaw: unknown,
): Promise<number | null> {
  if (user.isAdmin) return null;
  const bookingId = Number(bookingIdRaw);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return null;
  const { rows } = await pool.query<{
    id: number;
    client: string | null;
    professional: number | null;
  }>('SELECT id, client, professional FROM bookings WHERE id = $1', [bookingId]);
  const b = rows[0];
  if (!b) return null;
  if (b.client && b.client === user.userId) return b.id;
  if (b.professional !== null) {
    const ownPro = await resolveOwnProfessionalId(pool, user.userId);
    if (ownPro !== null && ownPro === b.professional) return b.id;
  }
  return null;
}

/** Guarda una muestra del histórico GPS (PostGIS). No bloquea el relevo. */
export async function insertTrackingHistory(
  pool: pg.Pool,
  bookingId: number,
  professionalId: number,
  lat: number,
  lng: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO booking_location_history (booking_id, professional_id, geom, recorded_at)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), NOW())`,
    [bookingId, professionalId, lng, lat],
  );
}
