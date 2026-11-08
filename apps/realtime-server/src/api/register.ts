import { Router, type Request, type Response as ExpressResponse } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { adminFetch } from './directusAdmin.js';
import { asyncHandler, HttpError } from './http.js';

const ConsentBody = z
  .object({
    version: z.string().trim().min(1).max(64),
  })
  .strict();

// Identidad que la app valida en pantalla. El BFF la comprueba ANTES de crear
// el usuario (mismo orden que el mock): así un documento duplicado no deja una
// cuenta creada a medias. Con accountType='professional' el perfil
// beauty_professionals se crea en la MISMA transacción que los
// consentimientos: el rol pro se deriva de la existencia de esa fila y, sin
// ella, el nuevo profesional entraría como cliente.
const RegisterBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
    firstName: z.string().trim().min(1).max(80),
    // Solo se usa para registrar profesionales en una sola petición.
    accountType: z.enum(['client', 'professional']).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[+()\-\s\d]{7,20}$/, 'invalid_phone')
      .max(24)
      .optional(),
    consents: z
      .object({
        terms: ConsentBody,
        privacy: ConsentBody,
      })
      .strict(),
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
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.documentNumber === undefined) !== (value.documentType === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentNumber'],
        message: 'document_requires_type',
      });
    }
  });

export type RegisterRouterOptions = {
  appRoleId?: string;
  maxPerWindow?: number;
  windowMs?: number;
  pool?: pg.Pool;
};

type Bucket = { count: number; windowStart: number };

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function registerRateLimit(maxPerWindow: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, res: ExpressResponse, next: () => void): void => {
    const key = req.ip || 'anonymous';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart > windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxPerWindow) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}

async function readJsonSafe(res: globalThis.Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function createRegisterRouter(options: RegisterRouterOptions = {}): Router {
  const router = Router();
  const maxPerWindow =
    options.maxPerWindow ??
    positiveInt(process.env.BFF_REGISTER_RATE_MAX, 5);
  const windowMs =
    options.windowMs ??
    positiveInt(process.env.BFF_REGISTER_RATE_WINDOW_MS, 15 * 60_000);

  router.post(
    '/register',
    registerRateLimit(maxPerWindow, windowMs),
    asyncHandler(async (req: Request, res: ExpressResponse) => {
      const parsed = RegisterBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, 'invalid_body');

      const appRoleId = (options.appRoleId ?? process.env.APP_ROLE_ID ?? '').trim();
      if (!appRoleId) throw new HttpError(503, 'registration_unavailable');
      if (!options.pool) throw new HttpError(503, 'registration_unavailable');

      const {
        email,
        password,
        firstName,
        accountType,
        displayName,
        phone,
        consents,
        documentType,
        documentNumber,
        nationality,
        birthDate,
      } = parsed.data;

      // Documento ya registrado (cliente o profesional): se decide ANTES de
      // crear el usuario, como en el mock, para no dejar cuentas a medias.
      if (documentNumber && documentType && options.pool) {
        const dup = await options.pool.query(
          `SELECT 1 FROM beauty_professionals WHERE document_type = $1 AND document_number = $2
           UNION ALL
           SELECT 1 FROM client_profiles WHERE document_type = $1 AND document_number = $2
           LIMIT 1`,
          [documentType, documentNumber],
        );
        if (dup.rows[0]) throw new HttpError(409, 'document_duplicate');
      }

      const created = await adminFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          first_name: firstName,
          role: appRoleId,
          status: 'active',
        }),
      });
      const payload = await readJsonSafe(created);

      if (!created.ok) {
        const detail = JSON.stringify(payload ?? '');
        if (created.status === 400 && /unique|RECORD_NOT_UNIQUE|already exists/i.test(detail)) {
          throw new HttpError(409, 'email_duplicate');
        }
        throw new HttpError(502, 'registration_failed');
      }

      let id =
        payload && typeof payload === 'object' && 'data' in payload
          ? (payload as { data?: { id?: unknown } }).data?.id
          : undefined;
      if (typeof id !== 'string') {
        const { rows } = await options.pool.query<{ id: string }>(
          'SELECT id FROM directus_users WHERE email = $1 LIMIT 1',
          [email],
        );
        id = rows[0]?.id;
      }
      if (typeof id !== 'string') throw new HttpError(502, 'registration_failed');

      const ip = (req.ip || '').slice(0, 64) || null;
      const userAgent = (req.get('user-agent') || '').slice(0, 512) || null;

      // Consentimientos + perfil del profesional en UNA transacción. El usuario
      // ya fue dado de alta en Directus (fuera de la BD); si aquí fallamos lo
      // borramos para no dejar una cuenta a medias.
      const client = await options.pool.connect();
      let professionalId: number | null = null;
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO legal_consents (user_id, document, version, ip, user_agent)
           VALUES ($1, 'terms', $2, $4, $5),
                  ($1, 'privacy', $3, $4, $5)
           ON CONFLICT (user_id, document, version) DO NOTHING`,
          [id, consents.terms.version, consents.privacy.version, ip, userAgent],
        );
        if (accountType === 'professional') {
          const { rows } = await client.query<{ id: number }>(
            `INSERT INTO beauty_professionals
               ("user", display_name, phone, is_online, rating_avg, verification_status,
                document_type, document_number, nationality, birth_date)
             VALUES ($1, $2, $3, false, 0, 'pending', $4, $5, $6, $7)
             RETURNING id`,
            [
              id,
              displayName ?? firstName,
              phone ?? null,
              documentType ?? null,
              documentNumber ?? null,
              nationality ?? null,
              birthDate ?? null,
            ],
          );
          const createdId = Number(rows[0]?.id);
          if (!Number.isInteger(createdId) || createdId <= 0) {
            throw new Error('professional_profile_failed');
          }
          professionalId = createdId;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (process.env.DEBUG_BFF) console.error('[bff] register profile/consents', err);
        await adminFetch(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
        const duplicateDocument =
          typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
        throw new HttpError(
          duplicateDocument ? 409 : 502,
          duplicateDocument ? 'document_duplicate' : 'registration_failed',
        );
      } finally {
        client.release();
      }

      res.status(201).json({
        data: {
          id,
          email,
          firstName,
          ...(professionalId ? { professionalId } : {}),
        },
      });
    }),
  );

  return router;
}
