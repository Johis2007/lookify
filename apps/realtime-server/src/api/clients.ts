import { Router, type Response } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { asyncHandler, HttpError, rateLimit, requireAuth, type AuthedRequest } from './http.js';

// BFF del perfil de cliente (Ola 2 de permisos). El App User pierde el acceso
// directo a client_profiles: aquí la identidad SIEMPRE sale del token.
//
// - GET  /me → perfil propio (404 si aún no existe).
// - POST/PUT /me → upsert idempotente con lista blanca de campos. Reemplaza
//   `ensureClientProfile` (que leía/escribía directo en Directus).

const PhoneField = z
  .string()
  .trim()
  .regex(/^[+()\-\s\d]{7,20}$/, 'invalid_phone')
  .max(24);

const UpsertClientBody = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    phone: PhoneField.nullable().optional(),
    avatar: z.string().uuid().nullable().optional(),
    addressText: z.string().trim().max(255).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  })
  .strict();

const FIELD_MAP: Record<string, string> = {
  displayName: 'display_name',
  phone: 'phone',
  avatar: 'avatar',
  addressText: 'address_text',
  lat: 'lat',
  lng: 'lng',
};

const CLIENT_FIELDS =
  'id, user, display_name, phone, avatar, address_text, lat, lng, created_at';

type ClientRow = {
  id: number;
  user: string | null;
  display_name: string | null;
  phone: string | null;
  avatar: string | null;
  address_text: string | null;
  lat: number | null;
  lng: number | null;
  created_at: Date | null;
};

function toDto(row: ClientRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    phone: row.phone,
    avatar: row.avatar,
    addressText: row.address_text,
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at,
  };
}

export function createClientsRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(rateLimit());

  router.get(
    '/me',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { rows } = await pool.query<ClientRow>(
        `SELECT ${CLIENT_FIELDS} FROM client_profiles WHERE "user" = $1 LIMIT 1`,
        [req.user!.userId],
      );
      if (!rows[0]) throw new HttpError(404, 'not_found');
      res.json({ data: toDto(rows[0]) });
    }),
  );

  const upsert = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = UpsertClientBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'invalid_body');
    const body = parsed.data as Record<string, unknown>;

    const existing = await pool.query<ClientRow>(
      `SELECT ${CLIENT_FIELDS} FROM client_profiles WHERE "user" = $1 LIMIT 1`,
      [req.user!.userId],
    );

    if (!existing.rows[0]) {
      const names = Object.keys(body);
      const columns = ['"user"', ...names.map((k) => FIELD_MAP[k])];
      const values = [req.user!.userId, ...names.map((k) => body[k])];
      const placeholders = values.map((_, i) => `$${i + 1}`);
      const { rows } = await pool.query<ClientRow>(
        `INSERT INTO client_profiles (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING ${CLIENT_FIELDS}`,
        values,
      );
      res.status(201).json({ data: toDto(rows[0]) });
      return;
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(body)) {
      sets.push(`${FIELD_MAP[key]} = $${i}`);
      values.push(value);
      i += 1;
    }
    if (sets.length === 0) {
      res.json({ data: toDto(existing.rows[0]) });
      return;
    }
    values.push(req.user!.userId);
    const { rows } = await pool.query<ClientRow>(
      `UPDATE client_profiles SET ${sets.join(', ')}
        WHERE "user" = $${i}
      RETURNING ${CLIENT_FIELDS}`,
      values,
    );
    res.json({ data: toDto(rows[0]) });
  });

  router.post('/me', upsert);
  router.put('/me', upsert);

  return router;
}
