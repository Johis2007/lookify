import { Router, type Response } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { resolveOwnProfessionalId } from '../auth.js';
import { asyncHandler, HttpError, rateLimit, requireAuth, type AuthedRequest } from './http.js';

// BFF del perfil profesional (Paso 2B-bis). El objetivo es cerrar la
// auto-verificación: el App User pierde create/update directo sobre
// beauty_professionals (2B-bis.6) y todo pasa por aquí.
//
// Reglas:
// - `user` SIEMPRE sale del token; nunca del body.
// - POST fuerza `verification_status='pending'`, `rating_avg=0`, `is_online=false`.
// - PATCH aplica lista blanca; cualquier campo prohibido (verification_status,
//   rating_avg, user, ...) => 400. `verification_status` solo admite 'pending'
//   (reenvío de solicitud), nunca 'verified'/'rejected' (eso es del admin).

// ---------------------------------------------------------------------------
// Lista blanca de campos editables por el propio profesional.
// Revisada contra lo que hoy edita la app: display_name, phone, bio, avatar,
// is_online (disponibilidad), years_exp, specialties.
// ---------------------------------------------------------------------------
export const PROFILE_EDITABLE_FIELDS = [
  'display_name',
  'phone',
  'bio',
  'avatar',
  'is_online',
  'years_exp',
  'specialties',
] as const;

// Campos que el profesional NUNCA puede tocar desde el BFF. Incluye variantes
// en snake_case (columnas Directus) para no colar el campo por su nombre real.
export const PROFILE_FORBIDDEN_FIELDS = [
  'id',
  'user',
  'rating_avg',
  'ratingAvg',
  'verification_note',
  'verificationNote',
  'verification_status',
  'geohash',
  'current_lat',
  'current_lng',
] as const;

// Teléfono: dígitos, espacios, + - ( ). Longitud 7..20.
const PhoneField = z
  .string()
  .trim()
  .regex(/^[+()\-\s\d]{7,20}$/, 'invalid_phone')
  .max(24);

const CreateProfileBody = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    phone: PhoneField.optional(),
    bio: z.string().trim().max(2000).optional(),
  })
  .strict();

// PATCH: al menos un campo, todos de la lista blanca (nombres en camelCase).
const PatchProfileBody = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    phone: PhoneField.nullable().optional(),
    bio: z.string().trim().max(2000).nullable().optional(),
    avatar: z.string().uuid().nullable().optional(),
    isOnline: z.boolean().optional(),
    yearsExp: z.number().int().min(0).max(80).nullable().optional(),
    // specialties es text en la base: se maneja como string libre acotado.
    specialties: z.string().trim().max(500).nullable().optional(),
    // Solo se acepta 'pending' (reenviar a revisión tras un rechazo);
    // verified/rejected es del admin.
    verificationStatus: z.literal('pending').optional(),
  })
  .strict();

// Traduce camelCase del body a columnas reales de beauty_professionals.
const FIELD_MAP: Record<string, string> = {
  displayName: 'display_name',
  phone: 'phone',
  bio: 'bio',
  avatar: 'avatar',
  isOnline: 'is_online',
  yearsExp: 'years_exp',
  specialties: 'specialties',
  verificationStatus: 'verification_status',
};

const PROFILE_FIELDS =
  'id, user, display_name, bio, avatar, is_online, rating_avg, verification_status, verification_note, years_exp, specialties, phone';

export type ProfessionalRow = {
  id: number;
  user: string;
  display_name: string;
  bio: string | null;
  avatar: string | null;
  is_online: boolean | null;
  rating_avg: number | null;
  verification_status: string | null;
  verification_note: string | null;
  years_exp: number | null;
  specialties: unknown;
  phone: string | null;
};

function toProfileDto(row: ProfessionalRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    bio: row.bio,
    avatar: row.avatar,
    isOnline: row.is_online,
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note,
    yearsExp: row.years_exp,
    specialties: row.specialties,
    phone: row.phone,
  };
}

function toReviewDto(row: {
  id: number;
  rating: number;
  comment: string | null;
  created_at: Date | null;
  author: string;
}) {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    author: row.author,
    createdAt: row.created_at,
  };
}

// Reseñas de un profesional con SOLO el primer nombre del cliente (nada de
// email, id de usuario ni apellidos).
async function listReviews(pool: pg.Pool, professionalId: number, limit = 20) {
  const { rows } = await pool.query<{
    id: number;
    rating: number;
    comment: string | null;
    created_at: Date | null;
    author: string;
  }>(
    `SELECT r.id, r.rating, r.comment, r.created_at,
            COALESCE(NULLIF(btrim(split_part(u.first_name, ' ', 1)), ''), 'Cliente') AS author
       FROM reviews r
       LEFT JOIN directus_users u ON u.id = r.client
      WHERE r.professional = $1
      ORDER BY r.created_at DESC
      LIMIT $2`,
    [professionalId, limit],
  );
  const total = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM reviews WHERE professional = $1',
    [professionalId],
  );
  return { reviews: rows.map(toReviewDto), total: Number(total.rows[0]?.count ?? 0) };
}

export function createProfessionalsRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(rateLimit());

  // GET /api/professionals/me/reviews — dashboard del pro del token.
  router.get(
    '/me/reviews',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      res.json({ data: await listReviews(pool, professionalId) });
    }),
  );

  // GET /api/professionals/:id/reviews — consulta autenticada (dato público).
  router.get(
    '/:id/reviews',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
      const exists = await pool.query('SELECT 1 FROM beauty_professionals WHERE id = $1', [id]);
      if (!exists.rows[0]) throw new HttpError(404, 'not_found');
      res.json({ data: await listReviews(pool, id) });
    }),
  );

  // GET /api/professionals/me — perfil del profesional del token.
  router.get(
    '/me',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const { rows } = await pool.query<ProfessionalRow>(
        `SELECT ${PROFILE_FIELDS} FROM beauty_professionals WHERE "user" = $1 LIMIT 1`,
        [user.userId],
      );
      if (!rows[0]) throw new HttpError(404, 'not_found');
      res.json({ data: toProfileDto(rows[0]) });
    }),
  );

  // POST /api/professionals/me — crea el perfil propio.
  router.post(
    '/me',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const parsed = CreateProfileBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data;
      if (body.displayName === undefined) throw new HttpError(400, 'invalid_body');

      const existing = await pool.query<{ id: number }>(
        'SELECT id FROM beauty_professionals WHERE "user" = $1 LIMIT 1',
        [user.userId],
      );
      if (existing.rows[0]) throw new HttpError(409, 'profile_exists');

      const { rows } = await pool.query<ProfessionalRow>(
        `INSERT INTO beauty_professionals
           ("user", display_name, phone, bio, is_online, rating_avg, verification_status)
         VALUES ($1, $2, $3, $4, false, 0, 'pending')
         RETURNING ${PROFILE_FIELDS}`,
        [user.userId, body.displayName, body.phone ?? null, body.bio ?? null],
      );
      res.status(201).json({ data: toProfileDto(rows[0]) });
    }),
  );

  // PATCH /api/professionals/me — edición con lista blanca.
  router.patch(
    '/me',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const user = req.user!;

      // Rechaza explícitamente campos prohibidos (aunque vengan con valor).
      if (req.body && typeof req.body === 'object') {
        for (const forbidden of PROFILE_FORBIDDEN_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(req.body, forbidden)) {
            throw new HttpError(400, 'forbidden_field');
          }
        }
      }

      const parsed = PatchProfileBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data as Record<string, unknown>;

      // Estado actual del perfil propio: necesario para aplicar los gates de
      // negocio (ponerse online / reenviar a revisión) ANTES de escribir.
      const current = await pool.query<{ verification_status: string | null }>(
        'SELECT verification_status FROM beauty_professionals WHERE "user" = $1 LIMIT 1',
        [user.userId],
      );
      if (!current.rows[0]) throw new HttpError(404, 'not_found');
      const currentStatus = current.rows[0].verification_status;

      // Gate servidor: solo un profesional verificado puede ponerse ONLINE.
      // El gate client-side (assertHabilitado) queda como UX, no como control.
      if (body.isOnline === true && currentStatus !== 'verified') {
        throw new HttpError(403, 'professional_not_verified');
      }

      // Reenviar a revisión ('pending') solo es válido desde 'rejected'. Evita
      // que un pro 'verified' se degrade o que dispare revisiones espurias.
      if (body.verificationStatus === 'pending' && currentStatus !== 'rejected') {
        throw new HttpError(409, 'invalid_transition');
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      for (const [key, value] of Object.entries(body)) {
        const column = FIELD_MAP[key];
        if (!column) throw new HttpError(400, 'forbidden_field');
        sets.push(`${column} = $${i}`);
        values.push(value);
        i += 1;
      }
      if (sets.length === 0) throw new HttpError(400, 'invalid_body');

      // El UPDATE solo afecta la fila del propio usuario (user del token).
      values.push(user.userId);
      const { rows } = await pool.query<ProfessionalRow>(
        `UPDATE beauty_professionals SET ${sets.join(', ')}
          WHERE "user" = $${i}
        RETURNING ${PROFILE_FIELDS}`,
        values,
      );
      if (!rows[0]) throw new HttpError(404, 'not_found');
      res.json({ data: toProfileDto(rows[0]) });
    }),
  );

  return router;
}

// Resuelve el id del perfil propio (reexport para reutilizar en el router).
export { resolveOwnProfessionalId };
