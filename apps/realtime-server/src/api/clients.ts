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

// Identidad del registro (mismo vocabulario que el profesional). La app la
// valida en pantalla; aquí se persiste en vez de descartarla.
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

const UpsertClientBody = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    phone: PhoneField.nullable().optional(),
    avatar: z.string().uuid().nullable().optional(),
    addressText: z.string().trim().max(255).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    ...IdentityFields,
  })
  .strict();

const FIELD_MAP: Record<string, string> = {
  displayName: 'display_name',
  phone: 'phone',
  avatar: 'avatar',
  addressText: 'address_text',
  lat: 'lat',
  lng: 'lng',
  documentType: 'document_type',
  documentNumber: 'document_number',
  nationality: 'nationality',
  birthDate: 'birth_date',
};

const CLIENT_FIELDS = `id, user, display_name, phone, avatar, address_text, lat, lng, created_at,
  document_type, document_number, nationality,
  to_char(birth_date, 'YYYY-MM-DD') AS birth_date`;

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
  document_type: string | null;
  document_number: string | null;
  nationality: string | null;
  /** 'YYYY-MM-DD' (to_char en la consulta, sin ambigüedad de zona horaria). */
  birth_date: string | null;
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
    documentType: row.document_type,
    documentNumber: row.document_number,
    nationality: row.nationality,
    birthDate: row.birth_date,
  };
}

// Mismo documento ya registrado por otro usuario (índice único parcial).
function rethrowDocumentDuplicate(err: unknown): never {
  if ((err as { code?: string }).code === '23505') {
    throw new HttpError(409, 'document_duplicate');
  }
  throw err;
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
    if (typeof body.avatar === 'string') {
      await assertOwnAvatar(pool, req.user!.userId, body.avatar);
    }

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
      ).catch(rethrowDocumentDuplicate);
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
    ).catch(rethrowDocumentDuplicate);
    res.json({ data: toDto(rows[0]) });
  });

  router.post('/me', upsert);
  router.put('/me', upsert);
  router.patch('/me', upsert);

  return router;
}
