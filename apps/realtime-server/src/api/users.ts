import { Router, type Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { asyncHandler, HttpError, rateLimit, requireAuth, type AuthedRequest } from './http.js';

// BFF del usuario autenticado (Ola 2c). El App User pierde read sobre
// directus_users (sin enumeración de correos). Solo se exponen/editan campos
// no sensibles del propio usuario.

const PhoneField = z
  .string()
  .trim()
  .regex(/^[+()\-\s\d]{7,20}$/, 'invalid_phone')
  .max(24);

const PatchMeBody = z
  .object({
    firstName: z.string().trim().min(1).max(80).nullable().optional(),
    lastName: z.string().trim().max(80).nullable().optional(),
    phone: PhoneField.nullable().optional(),
    avatar: z.string().uuid().nullable().optional(),
  })
  .strict();

const ConsentBody = z
  .object({
    document: z.enum(['terms', 'privacy']),
    version: z.string().trim().min(1).max(64),
  })
  .strict();

const USER_FIELDS = 'id, first_name, last_name, phone, avatar';
const CONSENT_FIELDS = 'document, version, accepted_at';

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar: string | null;
};

type ConsentRow = {
  document: 'terms' | 'privacy';
  version: string;
  accepted_at: Date;
};

function toConsentDto(row: ConsentRow) {
  return {
    document: row.document,
    version: row.version,
    acceptedAt: row.accepted_at,
  };
}

function toDto(row: UserRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    avatar: row.avatar,
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

export function createUsersRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(rateLimit());

  router.get(
    '/me',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { rows } = await pool.query<UserRow>(
        `SELECT ${USER_FIELDS} FROM directus_users WHERE id = $1 LIMIT 1`,
        [req.user!.userId],
      );
      if (!rows[0]) throw new HttpError(404, 'not_found');
      res.json({ data: toDto(rows[0]) });
    }),
  );

  router.patch(
    '/me',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const parsed = PatchMeBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const body = parsed.data;
      if (body.avatar) await assertOwnAvatar(pool, req.user!.userId, body.avatar);

      const columns: Record<string, string> = {
        firstName: 'first_name',
        lastName: 'last_name',
        phone: 'phone',
        avatar: 'avatar',
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
      values.push(req.user!.userId);
      const { rows } = await pool.query<UserRow>(
        `UPDATE directus_users SET ${sets.join(', ')}
          WHERE id = $${i}
        RETURNING ${USER_FIELDS}`,
        values,
      );
      if (!rows[0]) throw new HttpError(404, 'not_found');
      res.json({ data: toDto(rows[0]) });
    }),
  );

  router.get(
    '/me/consents',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { rows } = await pool.query<ConsentRow>(
        `SELECT DISTINCT ON (document) ${CONSENT_FIELDS}
           FROM legal_consents
          WHERE user_id = $1
          ORDER BY document, accepted_at DESC, id DESC`,
        [req.user!.userId],
      );
      res.json({ data: rows.map(toConsentDto) });
    }),
  );

  router.post(
    '/me/consents',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const parsed = ConsentBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, 'invalid_body');
      const { document, version } = parsed.data;
      const ip = (req.ip || '').slice(0, 64) || null;
      const userAgent = (req.get('user-agent') || '').slice(0, 512) || null;

      const inserted = await pool.query<ConsentRow>(
        `INSERT INTO legal_consents (user_id, document, version, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, document, version) DO NOTHING
         RETURNING ${CONSENT_FIELDS}`,
        [req.user!.userId, document, version, ip, userAgent],
      );
      if (inserted.rows[0]) {
        res.status(201).json({ data: toConsentDto(inserted.rows[0]) });
        return;
      }

      const existing = await pool.query<ConsentRow>(
        `SELECT ${CONSENT_FIELDS}
           FROM legal_consents
          WHERE user_id = $1 AND document = $2 AND version = $3
          LIMIT 1`,
        [req.user!.userId, document, version],
      );
      if (!existing.rows[0]) throw new HttpError(500, 'internal_error');
      res.json({ data: toConsentDto(existing.rows[0]) });
    }),
  );

  return router;
}
