import { Router, type Response } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { resolveOwnProfessionalId } from '../auth.js';
import { withTransaction } from '../db.js';
import {
  avanzarAhora,
  avanzarSiTodosRechazaron,
  findCandidates,
  offerToCandidates,
  MATCH_RADIUS_M,
  MATCH_OFFER_TTL_MS,
} from '../matching.js';
import { asyncHandler, HttpError, rateLimit, requireAuth, type AuthedRequest } from './http.js';
import { readLastPosition, trackingKey, type TrackingRedis } from '../tracking.js';

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
  // El motor de matching expira las reservas que se quedan sin candidatos.
  'expired',
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

// Eventos que la app puede registrar (notas de seguimiento). Se excluyen los
// estados del ciclo de vida (se escriben solo por las transiciones del router).
const EVENT_STATUSES = [
  'llegada',
  'iniciado',
  'finalizado',
  'cancelado_por_profesional',
  'nota',
] as const;

// Estados de evento que solo escribe el servidor (en las transiciones).
const SERVER_ONLY_EVENT_STATUSES = [
  'iniciado',
  'finalizado',
  'cancelado_por_profesional',
] as const;
const EventBody = z.object({
  status: z.enum(EVENT_STATUSES),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().trim().max(500).optional(),
});

// Reseña del cliente: rating entero 1..5, comentario acotado.
const ReviewBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
  })
  .strict();

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
  match_round: number | null;
  expires_at: Date | null;
};

const BOOKING_FIELDS =
  'id, client, professional, service, status, price_snapshot, address_text, lat, lng, scheduled_at, created_at, match_round, expires_at';

// Fila de reserva con servicio embebido y nombre del cliente (rutas del pro).
type ProBookingRow = BookingRow & {
  completed_at: Date | null;
  rating: number | null;
  payment_method: string | null;
  cancel_reason: string | null;
  s_id: number | null;
  s_name: string | null;
  s_price: string | null;
  s_duration: number | null;
  client_first_name: string | null;
  pro_name: string | null;
  pro_avatar: string | null;
  pro_rating: number | null;
};

type BookingEventRow = {
  id: number;
  booking: number;
  status: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  created_at: Date | null;
};

// Oferta vigente vista por el profesional antes de aceptar (claim).
type AvailableRow = {
  id: number;
  service: number | null;
  price_snapshot: string | null;
  lat: number | null;
  lng: number | null;
  created_at: Date | null;
  expires_at: Date | null;
  distance_m: number;
  s_id: number | null;
  s_name: string | null;
  s_duration: number | null;
  client_first_name: string | null;
};

// Redondea a ~500 m (0.005°) para no revelar el punto exacto antes de aceptar.
function round5(v: number | null): number | null {
  return v === null ? null : Math.round(v * 200) / 200;
}

// Distancia en la vista reducida: múltiplos de 100 m (no revela la posición
// exacta del cliente).
function round100(v: number | null): number {
  if (v === null) return 0;
  return Math.round(Number(v) / 100) * 100;
}

function primerNombre(v?: string | null): string {
  const s = (v ?? '').trim();
  return s ? s.split(/\s+/)[0] : 'Cliente';
}

// Estados en los que la reserva ya tiene profesional y el cliente puede ver su
// ficha pública (nombre, foto, calificación). Nunca teléfono ni documentos.
const PUBLIC_PRO_STATUSES = ['accepted', 'in_progress', 'completed'];

// Forma compatible con DBooking del frontend (snake_case, service embebido),
// para que el mapeo existente siga funcionando sin tocar la app.
function toProBookingDto(row: ProBookingRow) {
  return {
    id: row.id,
    client: row.client,
    professional: row.professional,
    service:
      row.s_id === null
        ? row.service
        : {
            id: row.s_id,
            name: row.s_name,
            price_base: row.s_price === null ? null : Number(row.s_price),
            duration_min: row.s_duration,
          },
    status: row.status,
    price_snapshot: row.price_snapshot === null ? null : Number(row.price_snapshot),
    address_text: row.address_text,
    lat: row.lat,
    lng: row.lng,
    scheduled_at: row.scheduled_at,
    created_at: row.created_at,
    completed_at: row.completed_at,
    rating: row.rating,
    payment_method: row.payment_method,
    cancel_reason: row.cancel_reason,
    clientFirstName: row.client_first_name,
    // Rondas de matching y vencimiento de la oferta (4A-bis).
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    matchRound: Number(row.match_round ?? 0),
    // Ficha pública del profesional (solo una vez aceptada).
    professionalPublic: toProfessionalPublic(row),
  };
}

// Ficha pública del profesional: nombre, foto y calificación. Sin teléfono,
// sin documentos y sin datos de verificación.
function toProfessionalPublic(row: ProBookingRow) {
  if (row.professional === null) return null;
  if (!row.status || !PUBLIC_PRO_STATUSES.includes(row.status)) return null;
  return {
    id: row.professional,
    displayName: row.pro_name ?? 'Profesional',
    avatar: row.pro_avatar ?? null,
    rating: row.pro_rating === null ? null : Number(row.pro_rating),
  };
}

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
    // Rondas de matching y vencimiento de la oferta (4A-bis).
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    matchRound: Number(row.match_round ?? 0),
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
  // Modelo "claim": oferta difundida a cada candidato y aviso de que otro la tomó.
  emitOffer?: (bookingId: number, professionalId: number, clientId: string) => void;
  emitTaken?: (bookingId: number, professionalId: number) => void;
  // Aviso de expiración (sin candidatos o sin aceptación).
  emitExpired?: (bookingId: number, clientId: string) => void;
  // 4C-2: tracking por reserva. `redis` guarda la última posición (TTL 120 s)
  // y `emitEvent` avisa al cliente en la sala booking:{id}.
  redis?: TrackingRedis;
  emitEvent?: (bookingId: number, event: { status: string; ts: number }) => void;
};

export function createBookingsRouter(deps: BookingsDeps): Router {
  const { pool, emitNew, emitStatus, emitOffer, emitTaken, emitExpired, redis, emitEvent } = deps;
  const router = Router();

  router.use(requireAuth);
  router.use(rateLimit());

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

      // El profesional declarado, si viene, debe existir, estar verificado y
      // ofrecer el servicio solicitado. Si no cumple -> 400 (no se crea).
      const professional = await resolveRequestedProfessional(pool, req.body?.professionalId, body.serviceId);

      // Sin professionalId: modelo "claim". Se crea 'pending' sin asignar y se
      // difunde a candidatos cercanos (ronda 1 = 3 km) con vencimiento a 60 s.
      const isClaim = professional === null;

      const inserted = await withTransaction(pool, async (client) => {
        const { rows } = await client.query<BookingRow>(
          `INSERT INTO bookings
             (client, professional, service, status, price_snapshot,
              address_text, lat, lng, scheduled_at, payment_method,
              match_round, expires_at, created_at)
           VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,
             CASE WHEN $11 THEN NOW() + ($12::int * interval '1 millisecond') ELSE NULL END,
             NOW())
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
            isClaim ? 1 : 0,
            isClaim,
            MATCH_OFFER_TTL_MS,
          ],
        );
        const booking = rows[0];
        await insertEvent(client, booking.id, 'pending', body.lat, body.lng, 'created');
        return booking;
      });

      emitNew(inserted.id, inserted.professional, user.userId);

      // Difusión a candidatos SOLO a la sala de cada uno (nunca broadcast).
      if (isClaim) {
        const candidates = await findCandidates(pool, body.serviceId, body.lat, body.lng, MATCH_RADIUS_M[0]);
        if (candidates.length > 0) {
          const ids = await offerToCandidates(pool, inserted.id, 1, candidates);
          for (const pid of ids) emitOffer?.(inserted.id, pid, user.userId);
        } else {
          // Sin candidatos en la ronda 1: se pasa de inmediato a la ronda 2 y,
          // si tampoco hay, la reserva expira sin esperar (4A-bis).
          await avanzarAhora({ pool, emitOffer, emitExpired }, inserted.id);
        }
      }

      // La respuesta refleja el estado real tras el avance (puede ser
      // 'expired' si no hay nadie a quien ofrecerle).
      const final = (await loadBooking(pool, String(inserted.id))) ?? inserted;
      res.status(201).json({ data: toBookingDto(final) });
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

  // GET /api/bookings/pro/mine — reservas del profesional del token.
  // Query: ?status=pending  o  ?status=accepted,in_progress (coma). Opcional.
  // Devuelve filas con el servicio embebido y el primer nombre del cliente,
  // para que la app no necesite leer bookings directo en Directus.
  router.get(
    '/pro/mine',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const ownPro = await resolveOwnProfessionalId(pool, user.userId);
      if (ownPro === null) throw new HttpError(404, 'not_found');

      const allowed = BOOKING_STATUSES as readonly string[];
      const raw = typeof req.query.status === 'string' ? req.query.status : '';
      const statuses = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => allowed.includes(s));
      if (raw && statuses.length === 0) throw new HttpError(400, 'invalid_status');

      const params: unknown[] = [ownPro];
      let where = 'b.professional = $1';
      if (statuses.length > 0) {
        params.push(statuses);
        where += ` AND b.status = ANY($${params.length}::text[])`;
      }

      const { rows } = await pool.query<ProBookingRow>(
        `${PRO_BOOKING_SELECT} WHERE ${where} ORDER BY b.created_at DESC LIMIT 200`,
        params,
      );
      res.json({ data: rows.map(toProBookingDto) });
    }),
  );

  // GET /api/bookings/pro/available — ofertas vigentes (claim) para el pro del
  // token. Vista REDUCIDA antes de aceptar: servicio, precio, distancia, zona
  // aproximada (coords redondeadas ~500 m) y nombre de pila. La dirección
  // exacta y el teléfono solo se exponen tras aceptar (GET /:id).
  router.get(
    '/pro/available',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const ownPro = await resolveOwnProfessionalId(pool, user.userId);
      if (ownPro === null) throw new HttpError(404, 'not_found');
      const { rows } = await pool.query<AvailableRow>(
        `SELECT b.id, b.service, b.price_snapshot, b.lat, b.lng, b.created_at, b.expires_at,
                bc.distance_m,
                s.id AS s_id, s.name AS s_name, s.duration_min AS s_duration,
                u.first_name AS client_first_name
           FROM booking_candidates bc
           JOIN bookings b ON b.id = bc.booking_id
           LEFT JOIN beauty_services s ON s.id = b.service
           LEFT JOIN directus_users u ON u.id = b.client
          WHERE bc.professional_id = $1
            AND bc.status = 'offered'
            AND b.status = 'pending'
            AND b.professional IS NULL
          ORDER BY b.created_at ASC
          LIMIT 50`,
        [ownPro],
      );
      res.json({
        data: rows.map((r) => ({
          id: String(r.id),
          servicioId: r.s_id === null ? null : String(r.s_id),
          servicioNombre: r.s_name ?? 'Servicio',
          duracionMin: r.s_duration ?? 60,
          precio: r.price_snapshot === null ? 0 : Number(r.price_snapshot),
          distanciaM: round100(r.distance_m),
          // Zona aproximada: ~500 m (0.005°). Nunca la dirección exacta.
          zona: { lat: round5(r.lat), lng: round5(r.lng) },
          clientePrimerNombre: primerNombre(r.client_first_name),
          expiraEn: r.expires_at ? r.expires_at.toISOString() : null,
          creadaEn: r.created_at ? r.created_at.toISOString() : null,
        })),
      });
    }),
  );

  // GET /api/bookings/:id — solo participantes (cliente/pro/admin); si no, 404.
  // Devuelve la forma enriquecida (servicio embebido + primer nombre cliente).
  router.get(
    '/:id',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const booking = await loadBooking(pool, req.params.id);
      if (!booking) throw new HttpError(404, 'not_found');
      const allowed = await canAccess(pool, req.user!, booking);
      if (!allowed) throw new HttpError(404, 'not_found');
      const full = await loadBookingFull(pool, booking.id);
      res.json({ data: full ? toProBookingDto(full) : toBookingDto(booking) });
    }),
  );

  // GET /api/bookings/:id/events — eventos de la reserva (solo participantes).
  // Reemplaza la lectura directa de booking_events en Directus.
  router.get(
    '/:id/events',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const booking = await loadBooking(pool, req.params.id);
      if (!booking) throw new HttpError(404, 'not_found');
      if (!(await canAccess(pool, req.user!, booking))) throw new HttpError(404, 'not_found');
      const { rows } = await pool.query<BookingEventRow>(
        `SELECT id, booking, status, lat, lng, note, created_at
           FROM booking_events WHERE booking = $1 ORDER BY created_at ASC LIMIT 500`,
        [booking.id],
      );
      res.json({ data: rows });
    }),
  );

  // GET /api/bookings/:id/tracking — última posición conocida del pro (4C-2).
  // Respaldo del socket: la app lo consulta cada 10 s mientras la reserva está
  // en 'accepted'. Solo participantes (cliente dueño/pro asignado/admin) → 404.
  router.get(
    '/:id/tracking',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const booking = await loadBooking(pool, req.params.id);
      if (!booking) throw new HttpError(404, 'not_found');
      if (!(await canAccess(pool, req.user!, booking))) throw new HttpError(404, 'not_found');
      if (booking.professional === null) throw new HttpError(404, 'not_found');
      const location = redis ? await readLastPosition(redis, booking.id) : null;
      const { rows } = await pool.query<{ created_at: Date | null }>(
        `SELECT created_at FROM booking_events
          WHERE booking = $1 AND status = 'llegada'
          ORDER BY created_at DESC LIMIT 1`,
        [booking.id],
      );
      res.json({
        data: {
          bookingId: booking.id,
          status: booking.status,
          professionalId: booking.professional,
          location,
          arrivedAt: rows[0]?.created_at ?? null,
          client: { lat: booking.lat, lng: booking.lng },
        },
      });
    }),
  );

  // POST /api/bookings/:id/events — registra un evento (nota) en la reserva.
  // Solo participantes. El status se acota por rol y estado:
  //  - cliente: solo 'nota'
  //  - profesional: 'llegada' (solo si status='accepted') y 'nota'
  //  - 'iniciado'/'finalizado'/'cancelado_por_profesional': solo el servidor
  //    (dentro de las transiciones), nunca por HTTP.
  router.post(
    '/:id/events',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const booking = await loadBooking(pool, req.params.id);
      if (!booking) throw new HttpError(404, 'not_found');
      if (!(await canAccess(pool, user, booking))) throw new HttpError(404, 'not_found');
      const parsed = EventBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const e = parsed.data;
      if (SERVER_ONLY_EVENT_STATUSES.includes(e.status as never)) {
        // 'iniciado'/'finalizado'/'cancelado_por_profesional' los escribe el
        // servidor dentro de las transiciones; nunca por HTTP.
        throw new HttpError(403, 'forbidden_event');
      }
      if (!user.isAdmin) {
        const ownPro = await resolveOwnProfessionalId(pool, user.userId);
        const isPro = ownPro !== null && ownPro === booking.professional;
        const permitido =
          e.status === 'nota' ||
          (e.status === 'llegada' && isPro && booking.status === 'accepted');
        if (!permitido) throw new HttpError(403, 'forbidden_event');
      }
      const { rows } = await pool.query<BookingEventRow>(
        `INSERT INTO booking_events (booking, status, lat, lng, note, created_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         RETURNING id, booking, status, lat, lng, note, created_at`,
        [booking.id, e.status, e.lat ?? null, e.lng ?? null, e.note ?? null],
      );
      // 4C-2: 'llegada' se anuncia en vivo al cliente en su sala de reserva.
      if (e.status === 'llegada') {
        emitEvent?.(booking.id, { status: 'llegada', ts: Date.now() });
      }
      res.status(201).json({ data: rows[0] });
    }),
  );

  // POST /api/bookings/:id/review — el cliente dueño califica una reserva
  // completada. Una sola reseña por reserva (índice único en la migración 005)
  // y recálculo transaccional de rating_avg del profesional.
  router.post(
    '/:id/review',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const bookingId = Number(req.params.id);
      if (!Number.isInteger(bookingId) || bookingId <= 0) {
        throw new HttpError(404, 'not_found');
      }
      const parsed = ReviewBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data;

      try {
        const review = await withTransaction(pool, async (client) => {
          // FOR UPDATE evita dos reseñas simultáneas de la misma reserva.
          const b = await client.query<{
            id: number;
            client: string | null;
            professional: number | null;
            status: string;
          }>('SELECT id, client, professional, status FROM bookings WHERE id = $1 FOR UPDATE', [
            bookingId,
          ]);
          const booking = b.rows[0];
          if (!booking || booking.client !== user.userId) throw new HttpError(404, 'not_found');
          if (booking.status !== 'completed') throw new HttpError(403, 'booking_not_completed');
          if (booking.professional === null) throw new HttpError(409, 'booking_without_professional');

          const inserted = await client.query<{
            id: number;
            booking: number;
            professional: number;
            rating: number;
            comment: string | null;
            created_at: Date;
          }>(
            `INSERT INTO reviews (booking, client, professional, rating, comment, created_at)
             VALUES ($1,$2,$3,$4,$5,NOW())
             RETURNING id, booking, professional, rating, comment, created_at`,
            [booking.id, user.userId, booking.professional, body.rating, body.comment ?? null],
          );

          await client.query(
            `UPDATE beauty_professionals
                SET rating_avg = (
                  SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE professional = $1
                )
              WHERE id = $1`,
            [booking.professional],
          );

          return inserted.rows[0];
        });

        res.status(201).json({
          data: {
            id: review.id,
            bookingId: review.booking,
            professionalId: review.professional,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.created_at,
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'review_exists');
        throw e;
      }
    }),
  );

  // POST /api/bookings/:id/{accept|reject|start|complete|cancel} (profesional)
  // POST /api/bookings/:id/cancel (cliente)
  for (const action of ['accept', 'reject', 'start', 'complete', 'cancel'] as const) {
    router.post(
      `/:id/${action}`,
      asyncHandler(async (req: AuthedRequest, res: Response) => {
        await handleTransition(pool, req, res, action, {
          emitStatus,
          emitTaken,
          emitOffer,
          emitExpired,
          redis,
        });
      }),
    );
  }

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// El professional declarado en el body, si viene, debe existir, estar
// verificado y ofrecer el servicio. Si no cumple, 400 (no se crea la reserva).
// Si no viene profesional, se permite (reserva sin asignar).
async function resolveRequestedProfessional(
  pool: pg.Pool,
  raw: unknown,
  serviceId: number,
): Promise<number | null> {
  if (raw === undefined || raw === null) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'invalid_professional');
  const { rows } = await pool.query<{ verification_status: string | null }>(
    'SELECT verification_status FROM beauty_professionals WHERE id = $1',
    [id],
  );
  const pro = rows[0];
  if (!pro) throw new HttpError(400, 'invalid_professional');
  if (pro.verification_status !== 'verified') throw new HttpError(400, 'professional_not_verified');
  const offers = await pool.query(
    'SELECT 1 FROM professional_services WHERE professional_id = $1 AND service_id = $2 LIMIT 1',
    [id, serviceId],
  );
  if (offers.rowCount === 0) throw new HttpError(400, 'professional_does_not_offer_service');
  return id;
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

// Reserva con servicio embebido + primer nombre del cliente (para el pro).
const PRO_BOOKING_SELECT = `
  SELECT b.id, b.client, b.professional, b.service, b.status, b.price_snapshot,
         b.address_text, b.lat, b.lng, b.scheduled_at, b.created_at, b.completed_at,
         b.rating, b.payment_method, b.cancel_reason, b.match_round, b.expires_at,
         s.id AS s_id, s.name AS s_name, s.price_base AS s_price, s.duration_min AS s_duration,
         u.first_name AS client_first_name,
         bp.display_name AS pro_name, bp.avatar AS pro_avatar, bp.rating_avg AS pro_rating
    FROM bookings b
    LEFT JOIN beauty_services s ON s.id = b.service
    LEFT JOIN directus_users u ON u.id = b.client
    LEFT JOIN beauty_professionals bp ON bp.id = b.professional`;

async function loadBookingFull(pool: pg.Pool, id: number): Promise<ProBookingRow | null> {
  const { rows } = await pool.query<ProBookingRow>(`${PRO_BOOKING_SELECT} WHERE b.id = $1`, [id]);
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

// Claim: el primer profesional elegible que acepta se queda con la reserva.
// Es un UPDATE atómico: WHERE status='pending' AND professional IS NULL.
async function claimBooking(
  pool: pg.Pool,
  req: AuthedRequest,
  res: Response,
  booking: BookingRow,
  ownPro: number | null,
  isAdmin: boolean,
  emitStatus: (bookingId: number, status: string) => void,
  emitTaken?: (bookingId: number, professionalId: number) => void,
): Promise<void> {
  void req;
  if (ownPro === null) throw new HttpError(404, 'not_found');
  // Debe ser elegible: verificado y ofrecer el servicio.
  const elig = await pool.query<{ ok: boolean }>(
    `SELECT (bp.verification_status = 'verified'
             AND EXISTS (SELECT 1 FROM professional_services ps
                          WHERE ps.professional_id = bp.id AND ps.service_id = $2)) AS ok
       FROM beauty_professionals bp WHERE bp.id = $1`,
    [ownPro, booking.service],
  );
  if (!elig.rows[0]?.ok) throw new HttpError(403, 'professional_not_verified');
  // Y debe tener una oferta vigente para esta reserva (o ser admin probando).
  const offered = await pool.query(
    `SELECT 1 FROM booking_candidates
      WHERE booking_id = $1 AND professional_id = $2 AND status = 'offered' LIMIT 1`,
    [booking.id, ownPro],
  );
  if (offered.rowCount === 0 && !isAdmin) throw new HttpError(409, 'not_offered');

  const claimed = await withTransaction(pool, async (client) => {
    const { rows } = await client.query<BookingRow>(
      `UPDATE bookings
          SET status = 'accepted', professional = $2, expires_at = NULL
        WHERE id = $1 AND status = 'pending' AND professional IS NULL
      RETURNING ${BOOKING_FIELDS}`,
      [booking.id, ownPro],
    );
    if (rows.length === 0) return null;
    await client.query(
      `UPDATE booking_candidates SET status = 'taken'
        WHERE booking_id = $1 AND professional_id = $2`,
      [booking.id, ownPro],
    );
    await client.query(
      `UPDATE booking_candidates SET status = 'declined'
        WHERE booking_id = $1 AND professional_id <> $2 AND status = 'offered'`,
      [booking.id, ownPro],
    );
    await client.query(
      `INSERT INTO booking_events (booking, status, lat, lng, note, created_at)
       VALUES ($1,'accepted',NULL,NULL,'professional',NOW())`,
      [booking.id],
    );
    return rows[0];
  });

  if (!claimed) throw new HttpError(409, 'conflict');

  // Los demás candidatos dejan de ver la oferta.
  const others = await pool.query<{ professional_id: number }>(
    `SELECT professional_id FROM booking_candidates
      WHERE booking_id = $1 AND professional_id <> $2 AND status = 'declined'`,
    [booking.id, ownPro],
  );
  for (const o of others.rows) emitTaken?.(booking.id, Number(o.professional_id));

  emitStatus(claimed.id, 'accepted');
  res.json({ data: toBookingDto(claimed) });
}

// Rechazar (claim): solo saca la oferta de ESTE profesional; no cancela.
// Si con este rechazo se queda sin ofertas vivas en la ronda, se avanza de
// inmediato a la ronda siguiente (o expira) sin esperar al vencimiento.
async function declineOffer(
  pool: pg.Pool,
  res: Response,
  booking: BookingRow,
  ownPro: number | null,
  isAdmin: boolean,
  emit: {
    emitOffer?: (bookingId: number, professionalId: number, clientId: string) => void;
    emitExpired?: (bookingId: number, clientId: string) => void;
  },
): Promise<void> {
  if (ownPro === null || isAdmin) throw new HttpError(404, 'not_found');
  const { rowCount } = await pool.query(
    `UPDATE booking_candidates SET status = 'declined'
      WHERE booking_id = $1 AND professional_id = $2 AND status = 'offered'`,
    [booking.id, ownPro],
  );
  if (rowCount === 0) throw new HttpError(409, 'not_offered');

  // Avance temprano por rechazo (atómico: si otro proceso ya avanzó, no pasa nada).
  const res2 = await avanzarSiTodosRechazaron({ pool, ...emit }, booking.id);
  const status = res2.tipo === 'expirada' ? 'expired' : 'pending';
  res.json({ data: { id: booking.id, status } });
}

// El cliente cancela una reserva aún SIN asignar (modelo claim): la reserva
// pasa a 'cancelled', se cierran las ofertas vigentes y los candidatos
// desaparece de su lista (booking:taken).
async function cancelUnassignedBooking(
  pool: pg.Pool,
  res: Response,
  booking: BookingRow,
  emitStatus: (bookingId: number, status: string) => void,
  emitTaken?: (bookingId: number, professionalId: number) => void,
): Promise<void> {
  const result = await withTransaction(pool, async (client) => {
    // UPDATE condicional atómico: solo se cancela si sigue 'pending' y sin pro.
    const { rows } = await client.query<BookingRow>(
      `UPDATE bookings
          SET status = 'cancelled', expires_at = NULL
        WHERE id = $1 AND status = 'pending' AND professional IS NULL
      RETURNING ${BOOKING_FIELDS}`,
      [booking.id],
    );
    if (rows.length === 0) return null;
    const { rows: candidates } = await client.query<{ professional_id: number }>(
      `UPDATE booking_candidates SET status = 'declined'
        WHERE booking_id = $1 AND status = 'offered'
      RETURNING professional_id`,
      [booking.id],
    );
    await insertEvent(client, booking.id, 'cancelled', null, null, 'client');
    return { booking: rows[0], candidates };
  });

  if (!result) throw new HttpError(409, 'conflict');
  for (const c of result.candidates) emitTaken?.(booking.id, Number(c.professional_id));
  emitStatus(result.booking.id, 'cancelled');
  res.json({ data: toBookingDto(result.booking) });
}

async function handleTransition(
  pool: pg.Pool,
  req: AuthedRequest,
  res: Response,
  action: ProAction | ClientAction,
  emit: {
    emitStatus: (bookingId: number, status: string) => void;
    emitTaken?: (bookingId: number, professionalId: number) => void;
    emitOffer?: (bookingId: number, professionalId: number, clientId: string) => void;
    emitExpired?: (bookingId: number, clientId: string) => void;
    redis?: TrackingRedis;
  },
): Promise<void> {
  const { emitStatus, emitTaken, emitOffer, emitExpired, redis } = emit;
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

  // --- Modelo "claim": reserva sin profesional asignado ---
  if (booking.professional === null && booking.status === 'pending') {
    if (action === 'accept') {
      await claimBooking(pool, req, res, booking, ownPro, user.isAdmin, emitStatus, emitTaken);
      return;
    }
    if (action === 'reject') {
      await declineOffer(pool, res, booking, ownPro, user.isAdmin, {
        emitOffer,
        emitExpired,
      });
      return;
    }
    if (action === 'cancel' && isOwnerClient) {
      // El cliente cancela una reserva aún sin asignar: cierra las ofertas
      // vigentes y avisa a los candidatos.
      await cancelUnassignedBooking(pool, res, booking, emitStatus, emitTaken);
      return;
    }
    // start/complete/cancel(pro) no aplican sin profesional asignado.
    throw new HttpError(404, 'not_found');
  }

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

  // Estado semántico del evento (lo que la app lee para etapas del servicio).
  const eventStatus =
    to === 'in_progress'
      ? 'iniciado'
      : to === 'completed'
        ? 'finalizado'
        : to === 'cancelled' && actor === 'professional'
          ? 'cancelado_por_profesional'
          : to;

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
      [id, eventStatus, extra.lat ?? null, extra.lng ?? null, extra.note ?? actor],
    );
    return rows[0];
  });

  if (!updated) {
    // El estado ya no permite la transición (o la reserva no es de este pro).
    // Doble aceptación concurrente: solo una gana; la otra cae aquí.
    throw new HttpError(409, 'conflict');
  }

  emitStatus(updated.id, to);
  // 4C-2: el rastreo solo vive mientras la reserva está 'accepted'. Al pasar a
  // in_progress/completed/cancelled se descarta la última posición.
  if (to !== 'accepted') {
    await redis?.del(trackingKey(updated.id)).catch(() => undefined);
  }
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
