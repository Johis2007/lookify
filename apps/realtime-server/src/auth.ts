import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';

// Auth del realtime-server (Fase 7): verifica el JWT de Directus en el
// handshake del socket y ata cada evento sensible al usuario del token.
// - El access token de Directus es un JWT HS256 firmado con SECRET.
//   Payload: { id: <user uuid>, role: <role uuid>, admin_access, ... }.
// - Los eventos de profesional IGNORAN el professional_id que manda el
//   cliente: se resuelve el perfil propio (beauty_professionals.user).
//   Así ni con un token válido se puede suplantar a otro profesional.
// - Las rooms booking:{id} exigen pertenencia (cliente, pro asignado o admin).

export type AuthedUser = {
  userId: string;
  role: string | null;
  isAdmin: boolean;
};

type DirectusJwt = {
  id?: unknown;
  role?: unknown;
  admin_access?: unknown;
};

export class AuthError extends Error {
  code: 'UNAUTHORIZED' | 'TOKEN_EXPIRED';
  constructor(code: 'UNAUTHORIZED' | 'TOKEN_EXPIRED', msg?: string) {
    super(msg || code);
    this.code = code;
  }
}

export function verifyAccessToken(token: string, secret: string): AuthedUser {
  let decoded: DirectusJwt;
  try {
    decoded = jwt.verify(token, secret) as DirectusJwt;
  } catch (e: unknown) {
    if (e && typeof e === 'object' && (e as { name?: string }).name === 'TokenExpiredError') {
      throw new AuthError('TOKEN_EXPIRED', 'access token expirado: refresca y reconecta');
    }
    throw new AuthError('UNAUTHORIZED', 'token inválido');
  }
  const userId = typeof decoded.id === 'string' && decoded.id ? decoded.id : null;
  if (!userId) throw new AuthError('UNAUTHORIZED', 'token sin user id');
  const role = typeof decoded.role === 'string' ? decoded.role : null;
  return { userId, role, isAdmin: decoded.admin_access === true };
}

// Perfil profesional propio del usuario (un usuario = un perfil).
export async function resolveOwnProfessionalId(pool: Pool, userId: string): Promise<number | null> {
  const { rows } = await pool.query(
    'SELECT id FROM beauty_professionals WHERE "user" = $1 LIMIT 1',
    [userId]
  );
  const id = rows[0]?.id;
  return typeof id === 'number' ? id : null;
}

// Acceso a una reserva: el cliente dueño, el pro asignado, o un admin.
// Devuelve el id numérico si hay acceso, null si no (inexistente o ajena).
export async function resolveBookingAccess(
  pool: Pool,
  user: AuthedUser,
  bookingIdRaw: unknown
): Promise<number | null> {
  const bookingId = Number(bookingIdRaw);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return null;
  const { rows } = await pool.query(
    'SELECT id, client, professional FROM bookings WHERE id = $1',
    [bookingId]
  );
  const b = rows[0] as { id: number; client: string | null; professional: number | null } | undefined;
  if (!b) return null;
  if (user.isAdmin) return b.id;
  if (b.client && b.client === user.userId) return b.id;
  if (b.professional !== null && b.professional !== undefined) {
    const ownPro = await resolveOwnProfessionalId(pool, user.userId);
    if (ownPro !== null && ownPro === b.professional) return b.id;
  }
  return null;
}

// Existe el perfil profesional (para ramas admin que reciben el id por payload).
export async function professionalExists(pool: Pool, professionalId: unknown): Promise<number | null> {
  const id = Number(professionalId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { rows } = await pool.query('SELECT id FROM beauty_professionals WHERE id = $1', [id]);
  return rows[0] ? id : null;
}

// Para booking:attach (el pro acepta): exige reserva existente y que esté
// sin asignar (claim) o asignada al propio profesional.
export async function resolveAttachableBooking(
  pool: Pool,
  user: AuthedUser,
  bookingIdRaw: unknown
): Promise<number | null> {
  const bookingId = Number(bookingIdRaw);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return null;
  if (user.isAdmin) {
    const { rows } = await pool.query('SELECT id FROM bookings WHERE id = $1', [bookingId]);
    return rows[0] ? bookingId : null;
  }
  const ownPro = await resolveOwnProfessionalId(pool, user.userId);
  if (ownPro === null) return null;
  const { rows } = await pool.query('SELECT id, professional FROM bookings WHERE id = $1', [bookingId]);
  const b = rows[0] as { id: number; professional: number | null } | undefined;
  if (!b) return null;
  if (b.professional === null || b.professional === undefined) return b.id; // claim
  return b.professional === ownPro ? b.id : null;
}

// Para booking:new (el cliente anuncia su reserva recién creada en Directus):
// debe existir y pertenecerle.
export async function resolveOwnNewBooking(
  pool: Pool,
  user: AuthedUser,
  bookingIdRaw: unknown
): Promise<{ id: number; professional: number | null } | null> {
  const bookingId = Number(bookingIdRaw);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return null;
  const { rows } = await pool.query('SELECT id, client, professional FROM bookings WHERE id = $1', [bookingId]);
  const b = rows[0] as { id: number; client: string | null; professional: number | null } | undefined;
  if (!b) return null;
  if (user.isAdmin) return { id: b.id, professional: b.professional };
  if (b.client && b.client === user.userId) return { id: b.id, professional: b.professional };
  return null;
}
