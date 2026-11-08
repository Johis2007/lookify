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
// cuenta creada a medias. La persistencia ocurre después, en el perfil
// (POST /api/clients/me o /api/professionals/me).
const RegisterBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
    firstName: z.string().trim().min(1).max(80),
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

      const { email, password, firstName, consents, documentType, documentNumber } = parsed.data;

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
      try {
        await options.pool.query(
          `INSERT INTO legal_consents (user_id, document, version, ip, user_agent)
           VALUES ($1, 'terms', $2, $4, $5),
                  ($1, 'privacy', $3, $4, $5)
           ON CONFLICT (user_id, document, version) DO NOTHING`,
          [id, consents.terms.version, consents.privacy.version, ip, userAgent],
        );
      } catch (err) {
        if (process.env.DEBUG_BFF) console.error('[bff] register consents', err);
        await adminFetch(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
        throw new HttpError(502, 'registration_failed');
      }

      res.status(201).json({
        data: {
          id,
          email,
          firstName,
        },
      });
    }),
  );

  return router;
}
