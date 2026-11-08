import { Router, type Response } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { resolveOwnProfessionalId } from '../auth.js';
import { withTransaction } from '../db.js';
import {
  ACTIVATION_BLOQUEO_MS,
  ACTIVATION_MAX_INTENTOS_FALLIDOS,
  ACTIVATION_MAX_REENVIOS,
  activationCodeMatches,
  activationState,
  ACTIVATION_VIGENCIA_MS,
  codeExpired,
  generateActivationCode,
  hashActivationCode,
  type ActivationCodeRow,
} from '../activation.js';
import { buildActivationEmail, sendSmtpMail, type SendMail } from '../mailer.js';
import {
  asyncHandler,
  HttpError,
  rateLimit,
  requireAdmin,
  requireAuth,
  type AuthedRequest,
} from './http.js';

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

// Identidad que la app recoge en el registro (cliente y profesional usan el
// mismo vocabulario). Se valida en pantalla y aquí se persiste: antes se
// descartaba al enviar. El número es único por tipo (índice parcial en DB).
const IdentityFields = {
  documentType: z.enum(['CC', 'Pasaporte']).optional(),
  documentNumber: z
    .string()
    .trim()
    .min(6)
    .max(40)
    .regex(/^[A-Za-z0-9]+$/, 'invalid_document')
    .optional(),
  nationality: z.string().trim().min(2).max(80).optional(),
  // YYYY-MM-DD (formatDateLocalISO de la app).
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_birth_date')
    .optional(),
};

const CreateProfileBody = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    phone: PhoneField.optional(),
    bio: z.string().trim().max(2000).optional(),
    ...IdentityFields,
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

// Servicios del profesional: reemplazo completo del vínculo. Solo ids del
// catálogo; el professional_id sale del token.
const ServicesBody = z
  .object({
    serviceIds: z.array(z.number().int().positive()).min(1).max(50),
  })
  .strict();

// Documentos: metadatos acotados; `professional` y `status` los pone el BFF.
const DOC_TYPES = ['dni', 'titulo', 'certificado', 'otro'] as const;
const CreateDocumentBody = z
  .object({
    file: z.string().uuid(),
    docType: z.enum(DOC_TYPES).optional(),
    note: z.string().max(4000).nullable().optional(),
  })
  .strict();
const PatchDocumentBody = z
  .object({
    file: z.string().uuid().optional(),
    docType: z.enum(DOC_TYPES).optional(),
    note: z.string().max(4000).nullable().optional(),
  })
  .strict();

const ConfirmActivationBody = z
  .object({
    codigo: z.string().trim().regex(/^\d{6}$/, 'invalid_code'),
  })
  .strict();

const PORTFOLIO_MAX_FOTOS = 10;
const PORTFOLIO_MAX_VIDEOS = 4;
const PORTFOLIO_CAPTION_MAX = 100;
const PORTFOLIO_VIDEO_MAX_SEG = 30;

const PortfolioKind = z.enum(['photo', 'video']);
const PortfolioCaption = z.string().trim().max(PORTFOLIO_CAPTION_MAX).nullable().optional();

const CreatePortfolioBody = z
  .object({
    file: z.string().uuid(),
    kind: PortfolioKind,
    caption: PortfolioCaption,
    serviceId: z.number().int().positive().nullable().optional(),
    durationSec: z.number().positive().max(PORTFOLIO_VIDEO_MAX_SEG).optional(),
  })
  .strict();

const PatchPortfolioBody = z
  .object({
    caption: PortfolioCaption,
    serviceId: z.number().int().positive().nullable().optional(),
  })
  .strict();

const ReplacePortfolioFileBody = z
  .object({
    file: z.string().uuid(),
    durationSec: z.number().positive().max(PORTFOLIO_VIDEO_MAX_SEG).optional(),
  })
  .strict();

const MovePortfolioBody = z
  .object({
    direction: z.enum(['up', 'down']),
  })
  .strict();

const AdminVerificationBody = z
  .object({
    status: z.enum(['verified', 'rejected']),
    note: z.string().trim().max(4000).optional(),
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

const PROFILE_FIELDS = `id, user, display_name, bio, avatar, is_online, rating_avg,
  verification_status, verification_note, years_exp, specialties, phone, activated_at,
  document_type, document_number, nationality,
  to_char(birth_date, 'YYYY-MM-DD') AS birth_date`;

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
  activated_at: Date | null;
  document_type: string | null;
  document_number: string | null;
  nationality: string | null;
  /** 'YYYY-MM-DD' (to_char en la consulta, sin ambigüedad de zona horaria). */
  birth_date: string | null;
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
    documentType: row.document_type,
    documentNumber: row.document_number,
    nationality: row.nationality,
    birthDate: row.birth_date,
    activated: row.verification_status === 'verified' && row.activated_at !== null,
  };
}

type ServiceRow = {
  id: number;
  service_id: number;
  name: string;
  duration_min: number | null;
  price_base: number | null;
};

function toServiceDto(row: ServiceRow) {
  return {
    id: row.id,
    serviceId: row.service_id,
    name: row.name,
    durationMin: row.duration_min,
    priceBase: row.price_base === null ? null : Number(row.price_base),
  };
}

const SERVICE_QUERY = `SELECT ps.id, ps.service_id, s.name, s.duration_min, s.price_base
                         FROM professional_services ps
                         JOIN beauty_services s ON s.id = ps.service_id
                        WHERE ps.professional_id = $1
                        ORDER BY s.name`;

async function assertFileExists(pool: pg.Pool, fileId: string): Promise<void> {
  const { rows } = await pool.query('SELECT 1 FROM directus_files WHERE id = $1', [fileId]);
  if (!rows[0]) throw new HttpError(400, 'invalid_file');
}

async function listServices(pool: pg.Pool, professionalId: number) {
  const { rows } = await pool.query<ServiceRow>(SERVICE_QUERY, [professionalId]);
  return rows.map(toServiceDto);
}

type PortfolioRow = {
  id: number;
  kind: 'photo' | 'video';
  file: string;
  caption: string | null;
  service_id: number | null;
  sort_order: number;
  duration_sec: number | string | null;
  mime: string | null;
  size: number | string | null;
};

const PORTFOLIO_FIELDS = `pp.id, pp.kind, pp.file, pp.caption, pp.service_id, pp.sort_order,
                           pp.duration_sec, df.type AS mime, df.filesize AS size`;
const PORTFOLIO_JOIN = `FROM professional_portfolio pp
                        LEFT JOIN directus_files df ON df.id = pp.file`;

function toPortfolioDto(row: PortfolioRow) {
  return {
    id: row.id,
    kind: row.kind,
    file: row.file,
    caption: row.caption,
    serviceId: row.service_id,
    sortOrder: row.sort_order,
    durationSec: row.duration_sec === null ? null : Number(row.duration_sec),
    mime: row.mime,
    size: row.size === null ? null : Number(row.size),
  };
}

async function listPortfolio(pool: pg.Pool, professionalId: number) {
  const { rows } = await pool.query<PortfolioRow>(
    `SELECT ${PORTFOLIO_FIELDS} ${PORTFOLIO_JOIN}
      WHERE pp.professional = $1
      ORDER BY pp.kind, pp.sort_order, pp.id`,
    [professionalId],
  );
  return rows.map(toPortfolioDto);
}

async function getPortfolioItem(
  pool: pg.Pool,
  professionalId: number,
  itemId: number,
): Promise<PortfolioRow | null> {
  const { rows } = await pool.query<PortfolioRow>(
    `SELECT ${PORTFOLIO_FIELDS} ${PORTFOLIO_JOIN}
      WHERE pp.id = $1 AND pp.professional = $2
      LIMIT 1`,
    [itemId, professionalId],
  );
  return rows[0] ?? null;
}

async function assertOwnPortfolioFile(
  pool: pg.Pool,
  userId: string,
  fileId: string,
  kind: 'photo' | 'video',
): Promise<void> {
  const { rows } = await pool.query<{ type: string | null }>(
    `SELECT type FROM directus_files
      WHERE id = $1 AND uploaded_by = $2 AND description = 'lookify:portfolio'
      LIMIT 1`,
    [fileId, userId],
  );
  const mime = rows[0]?.type ?? '';
  if (kind === 'photo' && !mime.startsWith('image/')) throw new HttpError(400, 'invalid_file');
  if (kind === 'video' && !mime.startsWith('video/')) throw new HttpError(400, 'invalid_file');
}

async function assertPortfolioService(
  pool: pg.Pool,
  professionalId: number,
  serviceId: number | null | undefined,
): Promise<void> {
  if (serviceId === null || serviceId === undefined) return;
  const { rows } = await pool.query(
    `SELECT 1 FROM professional_services
      WHERE professional_id = $1 AND service_id = $2
      LIMIT 1`,
    [professionalId, serviceId],
  );
  if (!rows[0]) throw new HttpError(400, 'invalid_service');
}

async function normalizePortfolioOrder(
  client: pg.PoolClient,
  professionalId: number,
  kind: 'photo' | 'video',
): Promise<void> {
  await client.query(
    `WITH ordered AS (
       SELECT id, (ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1)::int AS position
         FROM professional_portfolio
        WHERE professional = $1 AND kind = $2
     )
     UPDATE professional_portfolio pp
        SET sort_order = ordered.position, updated_at = NOW()
       FROM ordered
      WHERE pp.id = ordered.id`,
    [professionalId, kind],
  );
}

type DocumentRow = {
  id: number;
  file: string | null;
  doc_type: string | null;
  status: string | null;
  note: string | null;
  created_at: Date | null;
};

function toDocumentDto(row: DocumentRow) {
  return {
    id: row.id,
    file: row.file,
    docType: row.doc_type,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
  };
}

const DOCUMENT_FIELDS = 'id, file, doc_type, status, note, created_at';

type PublicProfileRow = ProfessionalRow & { avatar: string | null };

function toPublicProfileDto(row: PublicProfileRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    bio: row.bio,
    avatar: row.avatar,
    isOnline: row.is_online,
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    verificationStatus: row.verification_status,
    yearsExp: row.years_exp,
    specialties: row.specialties,
  };
}

async function assertOwnAvatar(pool: pg.Pool, userId: string, fileId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT 1 FROM directus_files
      WHERE id = $1 AND uploaded_by = $2 AND description = 'lookify:avatar'
      LIMIT 1`,
    [fileId, userId],
  );
  if (!rows[0]) throw new HttpError(400, 'invalid_avatar');
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

export function commissionRate(raw = process.env.COMMISSION_RATE): number {
  if (raw === undefined || raw.trim() === '') return 0.15;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.15;
}

type ProfessionalContactRow = {
  id: number;
  user: string;
  email: string | null;
  verification_status: string | null;
  activated_at: Date | null;
};

const CONTACT_FIELDS = `bp.id, bp."user", u.email, bp.verification_status, bp.activated_at`;
const CONTACT_JOIN = `FROM beauty_professionals bp
                      LEFT JOIN directus_users u ON u.id = bp."user"`;

const ACTIVATION_CODE_FIELDS =
  'professional, code_hash, code_expires_at, failed_attempts, locked_until, resends_used, last_sent_at';

async function loadContactById(pool: pg.Pool, id: number): Promise<ProfessionalContactRow | null> {
  const { rows } = await pool.query<ProfessionalContactRow>(
    `SELECT ${CONTACT_FIELDS} ${CONTACT_JOIN} WHERE bp.id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

async function loadOwnContact(
  pool: pg.Pool,
  userId: string,
): Promise<ProfessionalContactRow | null> {
  const { rows } = await pool.query<ProfessionalContactRow>(
    `SELECT ${CONTACT_FIELDS} ${CONTACT_JOIN} WHERE bp."user" = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function loadActivationCode(
  pool: pg.Pool,
  professionalId: number,
): Promise<ActivationCodeRow | null> {
  const { rows } = await pool.query<ActivationCodeRow>(
    `SELECT ${ACTIVATION_CODE_FIELDS}
       FROM professional_activation_codes
      WHERE professional = $1
      LIMIT 1`,
    [professionalId],
  );
  return rows[0] ?? null;
}

export type ProfessionalsDeps = {
  sendMail?: SendMail;
  activationSecret?: string;
  now?: () => number;
};

export function createProfessionalsRouter(
  pool: pg.Pool,
  deps: ProfessionalsDeps = {},
): Router {
  const router = Router();
  const sendMail = deps.sendMail ?? sendSmtpMail;
  const now = deps.now ?? Date.now;
  const activationSecret =
    deps.activationSecret ??
    process.env.ACTIVATION_SECRET ??
    process.env.DIRECTUS_SECRET ??
    'lookify-activation-dev';
  router.use(requireAuth);
  router.use(rateLimit());

  const sendActivationEmail = async (
    contact: ProfessionalContactRow,
    code: string,
  ): Promise<void> => {
    if (!contact.email) throw new HttpError(400, 'email_missing');
    try {
      await sendMail(buildActivationEmail({ to: contact.email, code }));
    } catch {
      throw new HttpError(502, 'email_failed');
    }
  };

  // GET /api/professionals/me/earnings - totales de reservas completadas.
  router.get(
    '/me/earnings',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const { rows } = await pool.query<{ gross: string; completed: string }>(
        `SELECT COALESCE(SUM(price_snapshot), 0)::text AS gross,
                COUNT(*)::text AS completed
           FROM bookings
          WHERE professional = $1 AND status = 'completed'`,
        [professionalId],
      );
      const grossCop = Number(rows[0]?.gross ?? 0);
      const rate = commissionRate();
      const commissionCop = Math.round(grossCop * rate);
      res.json({
        data: {
          commissionRate: rate,
          grossCop,
          commissionCop,
          netCop: grossCop - commissionCop,
          completedBookings: Number(rows[0]?.completed ?? 0),
        },
      });
    }),
  );

  // GET /api/professionals/me/reviews — dashboard del pro del token.
  // GET /api/professionals/me/activation - estado de activación por código.
  router.get(
    '/me/activation',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const contact = await loadOwnContact(pool, req.user!.userId);
      if (!contact) throw new HttpError(404, 'not_found');
      if (contact.verification_status !== 'verified') {
        throw new HttpError(409, 'not_verified');
      }
      if (contact.activated_at !== null) {
        res.json({
          data: {
            activated: true,
            codigoExpirado: false,
            bloqueadoHastaMs: null,
            reenvioDisponibleEnMs: null,
            reenviosRestantes: 0,
            sinSalidaActivacion: false,
          },
        });
        return;
      }
      const row = await loadActivationCode(pool, contact.id);
      res.json({ data: { activated: false, ...activationState(row, now()) } });
    }),
  );

  // POST /api/professionals/me/activation/resend - reenvía código vigente.
  router.post(
    '/me/activation/resend',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const contact = await loadOwnContact(pool, req.user!.userId);
      if (!contact) throw new HttpError(404, 'not_found');
      if (contact.verification_status !== 'verified') {
        throw new HttpError(409, 'not_verified');
      }
      if (contact.activated_at !== null) throw new HttpError(409, 'already_activated');

      const nowMs = now();
      const current = await loadActivationCode(pool, contact.id);
      const state = activationState(current, nowMs);
      if (state.bloqueadoHastaMs !== null) throw new HttpError(429, 'bloqueo_temporal');
      if (state.reenvioDisponibleEnMs !== null) throw new HttpError(429, 'reenvio_cooldown');
      if ((current?.resends_used ?? 0) >= ACTIVATION_MAX_REENVIOS) {
        throw new HttpError(429, 'reenvios_agotados');
      }

      const code = generateActivationCode();
      await sendActivationEmail(contact, code);

      const sentAt = new Date(nowMs);
      const expiresAt = new Date(nowMs + ACTIVATION_VIGENCIA_MS);
      const resendsUsed = current ? current.resends_used + 1 : 0;
      await pool.query(
        `INSERT INTO professional_activation_codes
           (professional, code_hash, code_expires_at, failed_attempts,
            locked_until, resends_used, last_sent_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, NOW())
         ON CONFLICT (professional) DO UPDATE
           SET code_hash = EXCLUDED.code_hash,
               code_expires_at = EXCLUDED.code_expires_at,
               failed_attempts = EXCLUDED.failed_attempts,
               locked_until = NULL,
               resends_used = EXCLUDED.resends_used,
               last_sent_at = EXCLUDED.last_sent_at,
               updated_at = NOW()`,
        [
          contact.id,
          hashActivationCode(activationSecret, contact.id, code),
          expiresAt,
          current?.failed_attempts ?? 0,
          resendsUsed,
          sentAt,
        ],
      );
      const updated = await loadActivationCode(pool, contact.id);
      res.json({ data: activationState(updated, nowMs) });
    }),
  );

  // POST /api/professionals/me/activation/confirm - valida y activa la cuenta.
  router.post(
    '/me/activation/confirm',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const parsed = ConfirmActivationBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_code');
      const { codigo } = parsed.data;
      const nowMs = now();
      const outcome = await withTransaction(pool, async (client) => {
        const pro = await client.query<{
          id: number;
          verification_status: string | null;
          activated_at: Date | null;
        }>(
          `SELECT id, verification_status, activated_at
             FROM beauty_professionals
            WHERE "user" = $1
            LIMIT 1
            FOR UPDATE`,
          [req.user!.userId],
        );
        const row = pro.rows[0];
        if (!row) return { kind: 'not_found' as const };
        if (row.activated_at !== null) {
          return { kind: 'already_activated' as const, professionalId: row.id };
        }
        if (row.verification_status !== 'verified') {
          return { kind: 'not_verified' as const };
        }

        const codes = await client.query<ActivationCodeRow>(
          `SELECT ${ACTIVATION_CODE_FIELDS}
             FROM professional_activation_codes
            WHERE professional = $1
            LIMIT 1
            FOR UPDATE`,
          [row.id],
        );
        const codeRow = codes.rows[0] ?? null;
        if (codeExpired(codeRow, nowMs)) return { kind: 'expired' as const };
        if (codeRow?.locked_until && codeRow.locked_until.getTime() > nowMs) {
          return { kind: 'locked' as const };
        }
        if (
          !codeRow ||
          !activationCodeMatches(activationSecret, row.id, codigo, codeRow.code_hash)
        ) {
          const attempts = (codeRow?.failed_attempts ?? 0) + 1;
          const locked = attempts >= ACTIVATION_MAX_INTENTOS_FALLIDOS;
          await client.query(
            `UPDATE professional_activation_codes
                SET failed_attempts = $2,
                    locked_until = $3,
                    updated_at = NOW()
              WHERE professional = $1`,
            [row.id, attempts, locked ? new Date(nowMs + ACTIVATION_BLOQUEO_MS) : null],
          );
          return { kind: 'invalid' as const, locked };
        }

        await client.query(
          'UPDATE beauty_professionals SET activated_at = NOW() WHERE id = $1',
          [row.id],
        );
        await client.query(
          'DELETE FROM professional_activation_codes WHERE professional = $1',
          [row.id],
        );
        return { kind: 'ok' as const, professionalId: row.id };
      });

      if (outcome.kind === 'not_found') throw new HttpError(404, 'not_found');
      if (outcome.kind === 'not_verified') throw new HttpError(409, 'not_verified');
      if (outcome.kind === 'expired') throw new HttpError(400, 'codigo_expirado');
      if (outcome.kind === 'locked') throw new HttpError(429, 'bloqueo_temporal');
      if (outcome.kind === 'invalid') {
        throw new HttpError(
          outcome.locked ? 429 : 400,
          outcome.locked ? 'demasiados_intentos' : 'codigo_invalido',
        );
      }
      res.json({ data: { activated: true, professionalId: outcome.professionalId } });
    }),
  );

  // PATCH /api/professionals/:id/verification - decisión del admin.
  // Aprobar genera y envía el código; NO activa por sí solo.
  router.patch(
    '/:id/verification',
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
      const parsed = AdminVerificationBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data;
      const note =
        body.note ??
        (body.status === 'verified' ? 'Aprobado por admin' : 'Documentación insuficiente');

      const contact = await loadContactById(pool, id);
      if (!contact) throw new HttpError(404, 'not_found');

      if (body.status === 'rejected') {
        await withTransaction(pool, async (client) => {
          await client.query(
            `UPDATE beauty_professionals
                SET verification_status = 'rejected',
                    verification_note = $2,
                    activated_at = NULL
              WHERE id = $1`,
            [id, note],
          );
          await client.query(
            'DELETE FROM professional_activation_codes WHERE professional = $1',
            [id],
          );
        });
        res.json({ data: { id, verificationStatus: 'rejected', activated: false } });
        return;
      }

      if (contact.verification_status === 'verified' && contact.activated_at !== null) {
        await pool.query(
          'UPDATE beauty_professionals SET verification_note = $2 WHERE id = $1',
          [id, note],
        );
        res.json({
          data: {
            id,
            verificationStatus: 'verified',
            activated: true,
            emailSent: false,
            alreadyActivated: true,
          },
        });
        return;
      }

      const code = generateActivationCode();
      await sendActivationEmail(contact, code);

      const nowMs = now();
      const sentAt = new Date(nowMs);
      const expiresAt = new Date(nowMs + ACTIVATION_VIGENCIA_MS);
      await withTransaction(pool, async (client) => {
        await client.query(
          `UPDATE beauty_professionals
              SET verification_status = 'verified',
                  verification_note = $2,
                  activated_at = NULL
            WHERE id = $1`,
          [id, note],
        );
        await client.query(
          `INSERT INTO professional_activation_codes
             (professional, code_hash, code_expires_at, failed_attempts,
              locked_until, resends_used, last_sent_at, updated_at)
           VALUES ($1, $2, $3, 0, NULL, 0, $4, NOW())
           ON CONFLICT (professional) DO UPDATE
             SET code_hash = EXCLUDED.code_hash,
                 code_expires_at = EXCLUDED.code_expires_at,
                 failed_attempts = 0,
                 locked_until = NULL,
                 resends_used = 0,
                 last_sent_at = EXCLUDED.last_sent_at,
                 updated_at = NOW()`,
          [id, hashActivationCode(activationSecret, id, code), expiresAt, sentAt],
        );
      });
      res.json({
        data: { id, verificationStatus: 'verified', activated: false, emailSent: true },
      });
    }),
  );

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

  // GET /api/professionals/:id/public — perfil público sin PII (ni email, ni
  // user, ni teléfono) + servicios que ofrece.
  router.get(
    '/:id/public',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
      const { rows } = await pool.query<ProfessionalRow>(
        `SELECT ${PROFILE_FIELDS} FROM beauty_professionals WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (!rows[0]) throw new HttpError(404, 'not_found');
      res.json({
        data: { ...toPublicProfileDto(rows[0]), services: await listServices(pool, id) },
      });
    }),
  );

  // GET /api/professionals/me/services — servicios que ofrece el pro del token.
  router.get(
    '/me/services',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      res.json({ data: await listServices(pool, professionalId) });
    }),
  );

  // PUT /api/professionals/me/services — reemplazo transaccional del vínculo.
  router.put(
    '/me/services',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const parsed = ServicesBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const ids = [...new Set(parsed.data.serviceIds)];
      if (ids.length !== parsed.data.serviceIds.length) throw new HttpError(400, 'invalid_body');

      const existing = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM beauty_services WHERE id = ANY($1::int[])',
        [ids],
      );
      if (Number(existing.rows[0]?.count ?? 0) !== ids.length) {
        throw new HttpError(400, 'invalid_service');
      }

      await withTransaction(pool, async (client) => {
        await client.query('DELETE FROM professional_services WHERE professional_id = $1', [
          professionalId,
        ]);
        for (const serviceId of ids) {
          await client.query(
            'INSERT INTO professional_services (professional_id, service_id) VALUES ($1, $2)',
            [professionalId, serviceId],
          );
        }
      });
      res.json({ data: await listServices(pool, professionalId) });
    }),
  );

  // GET /api/professionals/me/portfolio — fotos y videos del pro del token.
  router.get(
    '/me/portfolio',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      res.json({ data: await listPortfolio(pool, professionalId) });
    }),
  );

  // POST /api/professionals/me/portfolio — registra un archivo ya subido.
  router.post(
    '/me/portfolio',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const parsed = CreatePortfolioBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data;
      await assertOwnPortfolioFile(pool, req.user!.userId, body.file, body.kind);
      await assertPortfolioService(pool, professionalId, body.serviceId);

      const limit = body.kind === 'photo' ? PORTFOLIO_MAX_FOTOS : PORTFOLIO_MAX_VIDEOS;
      const count = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM professional_portfolio
          WHERE professional = $1 AND kind = $2`,
        [professionalId, body.kind],
      );
      if (Number(count.rows[0]?.count ?? 0) >= limit) {
        throw new HttpError(
          409,
          body.kind === 'photo' ? 'limit_photos' : 'limit_videos',
        );
      }

      const caption =
        body.caption === undefined || body.caption === null || body.caption === ''
          ? null
          : body.caption;
      const itemId = await withTransaction(pool, async (client) => {
        const next = await client.query<{ next: number }>(
          `SELECT COALESCE(MAX(sort_order) + 1, 0)::int AS next
             FROM professional_portfolio
            WHERE professional = $1 AND kind = $2`,
          [professionalId, body.kind],
        );
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO professional_portfolio
             (professional, file, kind, caption, service_id, sort_order, duration_sec, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           RETURNING id`,
          [
            professionalId,
            body.file,
            body.kind,
            caption,
            body.serviceId ?? null,
            next.rows[0]?.next ?? 0,
            body.kind === 'video' ? body.durationSec ?? null : null,
          ],
        );
        return inserted.rows[0].id;
      });
      const row = await getPortfolioItem(pool, professionalId, itemId);
      if (!row) throw new HttpError(500, 'unknown');
      res.status(201).json({ data: toPortfolioDto(row) });
    }),
  );

  // PATCH /api/professionals/me/portfolio/:id — descripción y servicio.
  router.patch(
    '/me/portfolio/:id',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) throw new HttpError(404, 'not_found');
      const parsed = PatchPortfolioBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data;
      if (body.caption === undefined && body.serviceId === undefined) {
        throw new HttpError(400, 'invalid_body');
      }
      const current = await getPortfolioItem(pool, professionalId, itemId);
      if (!current) throw new HttpError(404, 'not_found');
      await assertPortfolioService(pool, professionalId, body.serviceId);

      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (body.caption !== undefined) {
        const caption =
          body.caption === null || body.caption === '' ? null : body.caption;
        sets.push(`caption = $${i}`);
        values.push(caption);
        i += 1;
      }
      if (body.serviceId !== undefined) {
        sets.push(`service_id = $${i}`);
        values.push(body.serviceId);
        i += 1;
      }
      values.push(itemId, professionalId);
      await pool.query(
        `UPDATE professional_portfolio
            SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${i} AND professional = $${i + 1}`,
        values,
      );
      const row = await getPortfolioItem(pool, professionalId, itemId);
      if (!row) throw new HttpError(404, 'not_found');
      res.json({ data: toPortfolioDto(row) });
    }),
  );

  // DELETE /api/professionals/me/portfolio/:id — quita el ítem del portafolio.
  router.delete(
    '/me/portfolio/:id',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) throw new HttpError(404, 'not_found');
      const deleted = await withTransaction(pool, async (client) => {
        const row = await client.query<{ kind: 'photo' | 'video' }>(
          `DELETE FROM professional_portfolio
            WHERE id = $1 AND professional = $2
          RETURNING kind`,
          [itemId, professionalId],
        );
        if (!row.rows[0]) return null;
        await normalizePortfolioOrder(client, professionalId, row.rows[0].kind);
        return row.rows[0].kind;
      });
      if (deleted === null) throw new HttpError(404, 'not_found');
      res.status(204).end();
    }),
  );

  // PUT /api/professionals/me/portfolio/:id/file — reemplaza el archivo.
  router.put(
    '/me/portfolio/:id/file',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) throw new HttpError(404, 'not_found');
      const parsed = ReplacePortfolioFileBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const current = await getPortfolioItem(pool, professionalId, itemId);
      if (!current) throw new HttpError(404, 'not_found');
      await assertOwnPortfolioFile(pool, req.user!.userId, parsed.data.file, current.kind);
      await pool.query(
        `UPDATE professional_portfolio
            SET file = $1, duration_sec = $2, updated_at = NOW()
          WHERE id = $3 AND professional = $4`,
        [
          parsed.data.file,
          current.kind === 'video' ? parsed.data.durationSec ?? null : null,
          itemId,
          professionalId,
        ],
      );
      const row = await getPortfolioItem(pool, professionalId, itemId);
      if (!row) throw new HttpError(404, 'not_found');
      res.json({ data: toPortfolioDto(row) });
    }),
  );

  // POST /api/professionals/me/portfolio/:id/move — reordena dentro del tipo.
  router.post(
    '/me/portfolio/:id/move',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) throw new HttpError(404, 'not_found');
      const parsed = MovePortfolioBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const current = await getPortfolioItem(pool, professionalId, itemId);
      if (!current) throw new HttpError(404, 'not_found');

      await withTransaction(pool, async (client) => {
        const rows = await client.query<{ id: number }>(
          `SELECT id FROM professional_portfolio
            WHERE professional = $1 AND kind = $2
            ORDER BY sort_order, id
            FOR UPDATE`,
          [professionalId, current.kind],
        );
        const ids = rows.rows.map((row) => row.id);
        const index = ids.indexOf(itemId);
        const target = parsed.data.direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        for (let position = 0; position < ids.length; position += 1) {
          await client.query(
            `UPDATE professional_portfolio
                SET sort_order = $1, updated_at = NOW()
              WHERE id = $2 AND professional = $3`,
            [position, ids[position], professionalId],
          );
        }
      });

      res.json({ data: await listPortfolio(pool, professionalId) });
    }),
  );

  // POST /api/professionals/me/portfolio/:id/cover — portada (solo fotos).
  router.post(
    '/me/portfolio/:id/cover',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) throw new HttpError(404, 'not_found');
      const current = await getPortfolioItem(pool, professionalId, itemId);
      if (!current) throw new HttpError(404, 'not_found');
      if (current.kind !== 'photo') throw new HttpError(400, 'invalid_kind');

      await withTransaction(pool, async (client) => {
        const rows = await client.query<{ id: number }>(
          `SELECT id FROM professional_portfolio
            WHERE professional = $1 AND kind = 'photo'
            ORDER BY sort_order, id
            FOR UPDATE`,
          [professionalId],
        );
        const ids = rows.rows.map((row) => row.id).filter((id) => id !== itemId);
        ids.unshift(itemId);
        for (let position = 0; position < ids.length; position += 1) {
          await client.query(
            `UPDATE professional_portfolio
                SET sort_order = $1, updated_at = NOW()
              WHERE id = $2 AND professional = $3`,
            [position, ids[position], professionalId],
          );
        }
      });

      res.json({ data: await listPortfolio(pool, professionalId) });
    }),
  );

  // GET /api/professionals/:id/portfolio — portafolio público del profesional.
  router.get(
    '/:id/portfolio',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
      const exists = await pool.query('SELECT 1 FROM beauty_professionals WHERE id = $1', [id]);
      if (!exists.rows[0]) throw new HttpError(404, 'not_found');
      res.json({ data: await listPortfolio(pool, id) });
    }),
  );

  // GET /api/professionals/me/documents — documentos del pro del token.
  router.get(
    '/me/documents',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const { rows } = await pool.query<DocumentRow>(
        `SELECT ${DOCUMENT_FIELDS} FROM professional_documents
          WHERE professional = $1 ORDER BY created_at LIMIT 100`,
        [professionalId],
      );
      res.json({ data: rows.map(toDocumentDto) });
    }),
  );

  // POST /api/professionals/me/documents — alta con status 'pending' forzado.
  router.post(
    '/me/documents',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const parsed = CreateDocumentBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data;
      await assertFileExists(pool, body.file);
      const { rows } = await pool.query<DocumentRow>(
        `INSERT INTO professional_documents
           (professional, file, doc_type, status, note, created_at)
         VALUES ($1, $2, $3, 'pending', $4, NOW())
         RETURNING ${DOCUMENT_FIELDS}`,
        [professionalId, body.file, body.docType ?? 'certificado', body.note ?? null],
      );
      res.status(201).json({ data: toDocumentDto(rows[0]) });
    }),
  );

  // PATCH /api/professionals/me/documents/:id — solo documentos propios.
  router.patch(
    '/me/documents/:id',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
      const parsed = PatchDocumentBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data as Record<string, unknown>;
      if (typeof body.file === 'string') await assertFileExists(pool, body.file);
      const columns: Record<string, string> = {
        file: 'file',
        docType: 'doc_type',
        note: 'note',
      };
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      for (const [key, value] of Object.entries(body)) {
        sets.push(`${columns[key]} = $${i}`);
        values.push(value);
        i += 1;
      }
      if (sets.length === 0) throw new HttpError(400, 'invalid_body');
      values.push(id, professionalId);
      const { rows } = await pool.query<DocumentRow>(
        `UPDATE professional_documents SET ${sets.join(', ')}
          WHERE id = $${i} AND professional = $${i + 1}
        RETURNING ${DOCUMENT_FIELDS}`,
        values,
      );
      if (!rows[0]) throw new HttpError(404, 'not_found');
      res.json({ data: toDocumentDto(rows[0]) });
    }),
  );

  // DELETE /api/professionals/me/documents/:id — solo documentos propios.
  router.delete(
    '/me/documents/:id',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const professionalId = await resolveOwnProfessionalId(pool, req.user!.userId);
      if (professionalId === null) throw new HttpError(404, 'not_found');
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
      const { rows } = await pool.query<{ file: string | null }>(
        `DELETE FROM professional_documents
          WHERE id = $1 AND professional = $2
        RETURNING file`,
        [id, professionalId],
      );
      if (!rows[0]) throw new HttpError(404, 'not_found');
      res.status(204).end();
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
           ("user", display_name, phone, bio, is_online, rating_avg, verification_status,
            document_type, document_number, nationality, birth_date)
         VALUES ($1, $2, $3, $4, false, 0, 'pending', $5, $6, $7, $8)
         RETURNING ${PROFILE_FIELDS}`,
        [
          user.userId,
          body.displayName,
          body.phone ?? null,
          body.bio ?? null,
          body.documentType ?? null,
          body.documentNumber ?? null,
          body.nationality ?? null,
          body.birthDate ?? null,
        ],
      ).catch((err: unknown) => {
        // Mismo documento ya registrado por otro usuario (índice único parcial).
        if ((err as { code?: string }).code === '23505') {
          throw new HttpError(409, 'document_duplicate');
        }
        throw err;
      });
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
      if (typeof body.avatar === 'string') {
        await assertOwnAvatar(pool, user.userId, body.avatar);
      }

      // Estado actual del perfil propio: necesario para aplicar los gates de
      // negocio (ponerse online / reenviar a revisión) ANTES de escribir.
      const current = await pool.query<{
        verification_status: string | null;
        activated_at: Date | null;
      }>(
        `SELECT verification_status, activated_at
           FROM beauty_professionals
          WHERE "user" = $1
          LIMIT 1`,
        [user.userId],
      );
      if (!current.rows[0]) throw new HttpError(404, 'not_found');
      const currentStatus = current.rows[0].verification_status;

      // Gate servidor: verificado no basta; también debe haber activado la
      // cuenta con el código enviado por correo.
      if (body.isOnline === true) {
        if (currentStatus !== 'verified') throw new HttpError(403, 'professional_not_verified');
        if (current.rows[0].activated_at === null) {
          throw new HttpError(403, 'professional_not_activated');
        }
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
