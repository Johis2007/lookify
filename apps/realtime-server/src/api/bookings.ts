import { Router, type Response } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { resolveOwnProfessionalId } from '../auth.js';
import { withTransaction } from '../db.js';
import { asyncHandler, HttpError, requireAuth, type AuthedRequest } from './http.js';

// BFF de reservas (Paso 2B). Todo el acceso a bookings/booking_events pasa por
// aquí; el App User deja de tener permisos directos en 2D. El servidor valida
// reglas de negocio, calcula el precio y deriva la identidad del JWT.

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------
export const BOOKING_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Transición que habilita cada acción del profesional, y estado previo requerido.
type ProAction = 'accept' | 'reject' | 'start' | 'complete' | 'cancel';
const PRO_TRANSITIONS: Record<ProAction, { from: BookingStatus[]; to: BookingStatus }> = {
  accept: { from: ['pending'], to: 'accepted' },
  reject: { from: ['pending'], to: 'rejected' },
  start: { from: ['accepted'], to: 'in_progress' },
  complete: { from: ['in_progress'], to: 'completed' },
  cancel: { from: ['pending', 'accepted', 'in_progress'], to: 'cancelled' },
};

// Cancelación por el cliente: mismo estado previo que el pro (cancel).
type ClientAction = 'cancel';

// ---------------------------------------------------------------------------
// Schemas (zod) — solo lo que el cliente legítimamente puede enviar.
// ---------------------------------------------------------------------------
const CreateBookingBody = z.object({
  serviceId: z.number().int().positive(),
  addressText: z.string().trim().min(1).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  scheduledAt: z.string().datetime().optional(),
  paymentMethod: z.string().trim().max(60).optional(),
});

const StatusEventBody = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    note: z.string().trim().max(500).optional(),
    etaMin: z.number().int().min(0).max(600).optional(),
  })
  .optional()
  .default({});

// ---------------------------------------------------------------------------
// Tipos de fila
// ---------------------------------------------------------------------------
type BookingRow = {
  id: number;
  client: string | null;
  professional: number | null;
  service: number | null;
  status: string | null;
  price_snapshot: string | null;
  address_text: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_at: Date | null;
  created_at: Date | null;
};

const BOOKING_FIELDS =
  'id, client, professional, service, status, price_snapshot, address_text, lat, lng, scheduled_at, created_at';

// Convierte una fila a la forma que consume la app (camelCase, precio numérico).
function toBookingDto(row: BookingRow) {
  return {
    id: row.id,
    clientId: row.client,
    professionalId: row.professional,
    serviceId: row.service,
    status: row.status,
    price: row.price_snapshot === null ? null : Number(row.price_snapshot),
    addressText: row.address_text,
    lat: row.lat,
    lng: row.lng,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export type BookingsDeps = {
  pool: pg.Pool;
  // Emisor de eventos socket: se llama tras confirmar la transacción.
  emitNew: (bookingId: number, professionalId: number | null, clientId: string) => void;
  emitStatus: (bookingId: number, status: string) => void;
};

export function createBookingsRouter(deps: BookingsDeps): Router {
  const { pool, emitNew, emitStatus } = deps;
  const router = Router();

  router.use(requireAuth);

  // POST /api/bookings — crea una reserva para el cliente del token.
  // - Valida que el servicio exista y esté activo.
  // - Calcula el precio BASE en el servidor; ignora cualquier precio del body.
  // - Fuerza status='pending'. El professional (si viene) se toma del servicio
  //   del body solo si es un pro válido; si no, queda sin asignar.
  router.post(
    '/',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const parsed = CreateBookingBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data;

      const svc = await pool.query<{ price_base: string | null; is_active: boolean | null }>(
        'SELECT price_base, is_active FROM beauty_services WHERE id = $1',
        [body.serviceId],
      );
      const service = svc.rows[0];
      if (!service || service.is_active !== true) {
        throw new HttpError(400, 'service_unavailable');
      }
      // Precio SIEMPRE del servidor. Nunca del payload.
      const price = service.price_base === null ? 0 : Number(service.price_base);

      const professional = await resolveRequestedProfessional(pool, req.body?.professionalId);

      const inserted = await withTransaction(pool, async (client) => {
        const { rows } = await client.query<BookingRow>(
          `INSERT INTO bookings
             (client, professional, service, status, price_snapshot,
              address_text, lat, lng, scheduled_at, payment_method, created_at)
           VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,NOW())
           RETURNING ${BOOKING_FIELDS}`,
          [
            user.userId,
            professional,
            body.serviceId,
            price,
            body.addressText,
            body.lat,
            body.lng,
            body.scheduledAt ?? null,
            body.paymentMethod ?? null,
          ],
        );
        const booking = rows[0];
        await insertEvent(client, booking.id, 'pending', body.lat, body.lng, 'created');
        return booking;
      });

      emitNew(inserted.id, inserted.professional, user.userId);
      res.status(201).json({ data: toBookingDto(inserted) });
    }),
  );

  // GET /api/bookings/mine — reservas del cliente del token.
  router.get(
    '/mine',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const { rows } = await pool.query<BookingRow>(
        `SELECT ${BOOKING_FIELDS} FROM bookings WHERE client = $1 ORDER BY created_at DESC LIMIT 200`,
        [user.userId],
      );
      res.json({ data: rows.map(toBookingDto) });
    }),
  );

  // GET /api/bookings/:id — solo participantes (cliente/pro/admin); si no, 404.
  router.get(
    '/:id',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const booking = await loadBooking(pool, req.params.id);
      if (!booking) throw new HttpError(404, 'not_found');
      const allowed = await canAccess(pool, req.user!, booking);
      if (!allowed) throw new HttpError(404, 'not_found');
      res.json({ data: toBookingDto(booking) });
    }),
  );

  // POST /api/bookings/:id/{accept|reject|start|complete|cancel} (profesional)
  // POST /api/bookings/:id/cancel (cliente)
  for (const action of ['accept', 'reject', 'start', 'complete', 'cancel'] as const) {
    router.post(
      `/:id/${action}`,
      asyncHandler(async (req: AuthedRequest, res: Response) => {
        await handleTransition(pool, req, res, action, emitStatus);
      }),
    );
  }

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// El professional declarado en el body solo se acepta si existe; si no, null.
async function resolveRequestedProfessional(pool: pg.Pool, raw: unknown): Promise<number | null> {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { rows } = await pool.query('SELECT id FROM beauty_professionals WHERE id = $1', [id]);
  return rows[0] ? id : null;
}

async function loadBooking(pool: pg.Pool, rawId: string | undefined | string[]): Promise<BookingRow | null> {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { rows } = await pool.query<BookingRow>(
    `SELECT ${BOOKING_FIELDS} FROM bookings WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function canAccess(pool: pg.Pool, user: { userId: string; isAdmin: boolean }, booking: BookingRow): Promise<boolean> {
  if (user.isAdmin) return true;
  if (booking.client && booking.client === user.userId) return true;
  if (booking.professional !== null) {
    const ownPro = await resolveOwnProfessionalId(pool, user.userId);
    if (ownPro !== null && ownPro === booking.professional) return true;
  }
  return false;
}

async function insertEvent(
  client: pg.PoolClient,
  bookingId: number,
  status: string,
  lat: number | null,
  lng: number | null,
  note: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO booking_events (booking, status, lat, lng, note, created_at)
     VALUES ($1,$2,$3,$4,$5,NOW())`,
    [bookingId, status, lat, lng, note],
  );
}

async function handleTransition(
  pool: pg.Pool,
  req: AuthedRequest,
  res: Response,
  action: ProAction | ClientAction,
  emitStatus: (bookingId: number, status: string) => void,
): Promise<void> {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');

  const parsed = StatusEventBody.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, 'invalid_body');
  const extra = parsed.data;

  const booking = await loadBooking(pool, req.params.id);
  if (!booking) throw new HttpError(404, 'not_found');

  const ownPro = await resolveOwnProfessionalId(pool, user.userId);
  const isOwnerPro = ownPro !== null && ownPro === booking.professional;
  const isOwnerClient = booking.client !== null && booking.client === user.userId;

  let to: BookingStatus;
  let fromStatuses: BookingStatus[];
  let actor: 'professional' | 'client';

  if (action === 'cancel' && isOwnerClient && !isOwnerPro) {
    actor = 'client';
    to = 'cancelled';
    fromStatuses = ['pending', 'accepted', 'in_progress'];
  } else if (action !== 'cancel') {
    if (!isOwnerPro && !user.isAdmin) throw new HttpError(404, 'not_found');
    actor = 'professional';
    ({ from: fromStatuses, to } = PRO_TRANSITIONS[action]);
  } else {
    // 'cancel' por el pro (o cliente que además es pro asignado).
    if (!isOwnerPro && !user.isAdmin) throw new HttpError(404, 'not_found');
    actor = 'professional';
    ({ from: fromStatuses, to } = PRO_TRANSITIONS.cancel);
  }

  // Para aceptar, el profesional debe estar verificado.
  if (action === 'accept') {
    const verified = await isProfessionalVerified(pool, booking.professional);
    if (!verified) throw new HttpError(403, 'professional_not_verified');
  }

  // UPDATE condicional atómico: solo gana quien vea el estado previo esperado.
  const updated = await withTransaction(pool, async (client) => {
    const { rows } = await client.query<BookingRow>(
      `UPDATE bookings
          SET status = $1,
              completed_at = CASE WHEN $5 = 'completed' THEN NOW() ELSE completed_at END,
              eta_min = COALESCE($6, eta_min)
        WHERE id = $2 AND status = ANY($3::text[])
          AND professional = $4
      RETURNING ${BOOKING_FIELDS}`,
      [to, id, fromStatuses, booking.professional, to, extra.etaMin ?? null],
    );
    if (rows.length === 0) return null;
    await client.query(
      `INSERT INTO booking_events (booking, status, lat, lng, note, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [id, to, extra.lat ?? null, extra.lng ?? null, extra.note ?? actor],
    );
    return rows[0];
  });

  if (!updated) {
    // El estado ya no permite la transición (o la reserva no es de este pro).
    // Doble aceptación concurrente: solo una gana; la otra cae aquí.
    throw new HttpError(409, 'conflict');
  }

  emitStatus(updated.id, to);
  res.json({ data: toBookingDto(updated) });
}

async function isProfessionalVerified(pool: pg.Pool, professionalId: number | null): Promise<boolean> {
  if (professionalId === null) return false;
  const { rows } = await pool.query<{ verification_status: string | null }>(
    'SELECT verification_status FROM beauty_professionals WHERE id = $1',
    [professionalId],
  );
  return rows[0]?.verification_status === 'verified';
}
