import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Router, type Response } from 'express';
import multer from 'multer';
import type pg from 'pg';
import { z } from 'zod';
import { adminFetch } from './directusAdmin.js';
import { asyncHandler, HttpError, rateLimit, requireAuth, type AuthedRequest } from './http.js';

// BFF de archivos (Ola 2c). El App User pierde create/read/delete directos de
// directus_files: la subida y la lectura pasan por aquí. La identidad sale del
// JWT y `uploaded_by` NUNCA se acepta del cliente.
//
// Lectura: stream a través del BFF (no URL firmada). Motivo: la autorización
// queda centralizada y no depende de URLs/tokens de Directus; el cliente envía
// `Authorization` también al renderizar (React Native Image lo soporta).

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const PURPOSES = ['avatar', 'portfolio', 'certificate'] as const;
type Purpose = (typeof PURPOSES)[number];

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MIMES_BY_PURPOSE: Record<Purpose, readonly string[]> = {
  avatar: IMAGE_MIMES,
  portfolio: IMAGE_MIMES,
  certificate: [...IMAGE_MIMES, 'application/pdf'],
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const PurposeBody = z.enum(PURPOSES);

type FileRow = {
  id: string;
  type: string | null;
  filesize: number | string | null;
  filename_download: string | null;
  uploaded_by: string | null;
  description: string | null;
};

function purposeOf(description: string | null): Purpose | null {
  const match = /lookify:(avatar|portfolio|certificate)/.exec(description ?? '');
  return match ? (match[1] as Purpose) : null;
}

async function canRead(
  pool: pg.Pool,
  user: { userId: string; isAdmin: boolean },
  row: FileRow,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (row.uploaded_by === user.userId) return true;
  const purpose = purposeOf(row.description);
  if (purpose === 'avatar' || purpose === 'portfolio') return true;
  if (purpose === 'certificate') return false;

  const { rows } = await pool.query(
    `SELECT 1
       FROM professional_documents pd
       JOIN beauty_professionals bp ON bp.id = pd.professional
      WHERE pd.file = $1 AND bp."user" = $2
      LIMIT 1`,
    [row.id, user.userId],
  );
  if (rows[0]) return true;
  const avatar = await pool.query(
    `SELECT 1 FROM beauty_professionals WHERE avatar = $1 AND "user" = $2
     UNION ALL
     SELECT 1 FROM client_profiles WHERE avatar = $1 AND "user" = $3
     LIMIT 1`,
    [row.id, user.userId, user.userId],
  );
  return Boolean(avatar.rows[0]);
}

function uploadSingle(req: AuthedRequest, res: Response, next: (err?: unknown) => void): void {
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4 },
  }).single('file');
  handler(req as never, res as never, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'file_too_large' });
        return;
      }
      res.status(400).json({ error: 'invalid_multipart' });
      return;
    }
    next(err);
  });
}

async function readDirectusFileRow(pool: pg.Pool, id: string): Promise<FileRow | null> {
  const { rows } = await pool.query<FileRow>(
    `SELECT id, type, filesize, filename_download, uploaded_by, description
       FROM directus_files WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export function createFilesRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(rateLimit());

  // POST /api/files (multipart: file + purpose)
  router.post(
    '/',
    (req, res, next) => uploadSingle(req as AuthedRequest, res, next),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const parsed = PurposeBody.safeParse(
        typeof req.body?.purpose === 'string' ? req.body.purpose : undefined,
      );
      if (!parsed.success) throw new HttpError(400, 'invalid_purpose');
      const purpose = parsed.data;
      const file = (req as AuthedRequest & { file?: Express.Multer.File }).file;
      if (!file || !file.size) throw new HttpError(400, 'file_required');

      if (!MIMES_BY_PURPOSE[purpose].includes(file.mimetype)) {
        throw new HttpError(400, 'invalid_mime');
      }
      if (file.size > MAX_FILE_BYTES) throw new HttpError(413, 'file_too_large');

      const ext = EXT_BY_MIME[file.mimetype];
      const generated = `${purpose}-${req.user!.userId.slice(0, 8)}-${randomUUID()}.${ext}`;
      const form = new FormData();
      form.append('file', new Blob([file.buffer as unknown as ArrayBuffer], { type: file.mimetype }), generated);
      form.append('title', generated);
      form.append('description', `lookify:${purpose}`);

      const uploadedRes = await adminFetch('/files', { method: 'POST', body: form });
      const uploadedJson = (await uploadedRes.json().catch(() => null)) as
        | { data?: { id?: string } | Array<{ id?: string }> }
        | null;
      const uploaded = Array.isArray(uploadedJson?.data)
        ? uploadedJson?.data[0]
        : uploadedJson?.data;
      if (!uploadedRes.ok || !uploaded?.id) throw new HttpError(502, 'upload_failed');
      const fileId = uploaded.id;

      // uploaded_by SIEMPRE del token; si Directus no lo aplica en el upload,
      // se fija con la credencial de servicio.
      const patched = await adminFetch(`/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uploaded_by: req.user!.userId,
          description: `lookify:${purpose}`,
        }),
      });
      if (!patched.ok) {
        await adminFetch(`/files/${fileId}`, { method: 'DELETE' }).catch(() => undefined);
        throw new HttpError(502, 'upload_failed');
      }

      res.status(201).json({
        data: {
          id: fileId,
          url: `/api/files/${fileId}`,
          mime: file.mimetype,
          size: file.size,
          filename: generated,
        },
      });
    }),
  );

  // GET /api/files/:id — stream con ACL del BFF.
  router.get(
    '/:id',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'not_found');
      const row = await readDirectusFileRow(pool, id);
      if (!row) throw new HttpError(404, 'not_found');
      if (!(await canRead(pool, req.user!, row))) throw new HttpError(404, 'not_found');

      const asset = await adminFetch(`/assets/${id}`);
      if (!asset.ok || !asset.body) throw new HttpError(404, 'not_found');

      res.status(200);
      res.setHeader('Content-Type', row.type || 'application/octet-stream');
      if (row.filesize !== null) res.setHeader('Content-Length', String(row.filesize));
      res.setHeader('Cache-Control', 'private, max-age=300');
      const safeName = (row.filename_download || 'archivo').replace(/["\\\r\n]/g, '_');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      Readable.fromWeb(asset.body as import('node:stream/web').ReadableStream).pipe(res);
    }),
  );

  // DELETE /api/files/:id — solo dueño o admin.
  router.delete(
    '/:id',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'not_found');
      const row = await readDirectusFileRow(pool, id);
      if (!row) throw new HttpError(404, 'not_found');
      if (!req.user!.isAdmin && row.uploaded_by !== req.user!.userId) {
        throw new HttpError(404, 'not_found');
      }
      const del = await adminFetch(`/files/${id}`, { method: 'DELETE' });
      if (!del.ok && del.status !== 404) throw new HttpError(502, 'delete_failed');
      res.status(204).end();
    }),
  );

  return router;
}
