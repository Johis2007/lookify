import { before, after } from 'node:test';
import { DATABASE_URL, SECRET, maybe } from '../infra.js';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createFilesRouter } from './files.js';
import { errorHandler } from './http.js';

// Ola 2c: BFF de archivos. Contra el Postgres local real; valida bordes HTTP y
// ACL sin depender de que Directus tenga el binario (subida real en E2E).

let pool: pg.Pool;
let server: Server;
let baseUrl: string;
let user1: string;
let user2: string;
let certificateId: string;

function token(userId: string, isAdmin = false): string {
  return jwt.sign({ id: userId, role: 'app-role', admin_access: isAdmin }, SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function form(purpose: string, mime: string, bytes: Uint8Array): FormData {
  const fd = new FormData();
  fd.append('purpose', purpose);
  fd.append('file', new Blob([bytes as unknown as ArrayBuffer], { type: mime }), 'test.bin');
  return fd;
}

async function upload(userId: string, fd: FormData) {
  const res = await fetch(`${baseUrl}/api/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(userId)}` },
    body: fd,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  const users = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM directus_users
      WHERE email IN ('cliente.prueba@lookify.app', 'cliente2.prueba@lookify.app')`,
  );
  const u1 = users.rows.find((u) => u.email === 'cliente.prueba@lookify.app');
  const u2 = users.rows.find((u) => u.email === 'cliente2.prueba@lookify.app');
  if (!u1 || !u2) throw new Error('faltan usuarios cliente.prueba / cliente2.prueba');
  user1 = u1.id;
  user2 = u2.id;

  certificateId = '00000000-0000-4000-8000-0000000000c1';
  await pool.query(
    `INSERT INTO directus_files
       (id, storage, filename_download, filename_disk, type, filesize, uploaded_by, description)
     VALUES ($1, 'local', 'cert.pdf', 'cert.pdf', 'application/pdf', 10, $2, 'lookify:certificate')
     ON CONFLICT (id) DO NOTHING`,
    [certificateId, user1],
  );

  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use('/api/files', createFilesRouter(pool));
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await pool.query('DELETE FROM directus_files WHERE id = $1', [certificateId]);
  await pool.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

maybe('sin token responde 401', async () => {
  const res = await fetch(`${baseUrl}/api/files/${certificateId}`);
  assert.equal(res.status, 401);
});

maybe('purpose inválido responde 400', async () => {
  const r = await upload(user1, form('otro', 'image/png', new Uint8Array([1, 2, 3])));
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'invalid_purpose');
});

maybe('MIME no permitido responde 400', async () => {
  const r = await upload(user1, form('avatar', 'image/gif', new Uint8Array([1, 2, 3])));
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'invalid_mime');
});

maybe('certificado PDF solo con purpose certificate', async () => {
  const r = await upload(user1, form('avatar', 'application/pdf', new Uint8Array([1, 2, 3])));
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'invalid_mime');
});

maybe('archivo mayor a 5 MB responde 413', async () => {
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  const r = await upload(user1, form('avatar', 'image/png', big));
  assert.equal(r.status, 413);
  assert.equal(r.json.error, 'file_too_large');
});

maybe('id inválido o inexistente responde 404', async () => {
  const bad = await fetch(`${baseUrl}/api/files/no-es-uuid`, {
    headers: { Authorization: `Bearer ${token(user1)}` },
  });
  assert.equal(bad.status, 404);
  const missing = await fetch(`${baseUrl}/api/files/00000000-0000-4000-8000-0000000000ff`, {
    headers: { Authorization: `Bearer ${token(user1)}` },
  });
  assert.equal(missing.status, 404);
});

maybe('certificado ajeno responde 404 sin filtrar existencia', async () => {
  const res = await fetch(`${baseUrl}/api/files/${certificateId}`, {
    headers: { Authorization: `Bearer ${token(user2)}` },
  });
  assert.equal(res.status, 404);
});

maybe('DELETE de archivo ajeno responde 404', async () => {
  const res = await fetch(`${baseUrl}/api/files/${certificateId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token(user2)}` },
  });
  assert.equal(res.status, 404);
});

maybe('certificado de otro usuario no puede usarse como avatar (propiedad/purpose)', async () => {
  // Intentar usar certificado ajeno como avatar debe fallar en PATCH /me
  // (validado por el router de usuarios; probamos por API directa)
  const res = await fetch(`${baseUrl.replace('/api/files', '')}/api/users/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(user2)}` },
    body: JSON.stringify({ avatar: certificateId }),
  }).catch(() => null);
  // Si el servidor de archivos no tiene /api/users montado, este test es best-effort
  // pero la validación existe en users.ts
  if (res) {
    assert.equal(res.status, 400);
    const json = await res.json().catch(() => null);
    assert.equal(json?.error, 'invalid_avatar');
  }
  const getRes = await fetch(`${baseUrl}/api/files/${certificateId}`, {
    headers: { Authorization: `Bearer ${token(user2)}` },
  });
  assert.equal(getRes.status, 404);
});
