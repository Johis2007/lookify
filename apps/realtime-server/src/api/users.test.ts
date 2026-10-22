import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createUsersRouter } from './users.js';
import { errorHandler } from './http.js';

// Ola 2c: /api/users/me sin exponer email/role/status ni permitir escalada.
const DATABASE_URL = process.env.DATABASE_URL;
const SECRET = process.env.DIRECTUS_SECRET;
const maybe = DATABASE_URL && SECRET ? test : test.skip;

let pool: pg.Pool;
let server: Server;
let baseUrl: string;
let userId: string;
let originalPhone: string | null;

function token(id: string, isAdmin = false): string {
  return jwt.sign({ id, role: 'app-role', admin_access: isAdmin }, SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(userId)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  const u = await pool.query<{ id: string; phone: string | null }>(
    `SELECT id, phone FROM directus_users WHERE email = 'cliente.prueba@lookify.app'`,
  );
  if (!u.rows[0]) throw new Error('falta cliente.prueba');
  userId = u.rows[0].id;
  originalPhone = u.rows[0].phone;

  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use('/api/users', createUsersRouter(pool));
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await pool.query('UPDATE directus_users SET phone = $2 WHERE id = $1', [userId, originalPhone]);
  await pool.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

maybe('GET /me devuelve solo campos permitidos', async () => {
  const r = await api('GET', '/api/users/me');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.id, userId);
  assert.equal('email' in r.json.data, false);
  assert.equal('role' in r.json.data, false);
  assert.equal('status' in r.json.data, false);
});

maybe('PATCH /me actualiza phone y firstName', async () => {
  const r = await api('PATCH', '/api/users/me', {
    phone: '+57 300 111 2233',
    firstName: 'Cliente',
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.phone, '+57 300 111 2233');
  assert.equal(r.json.data.firstName, 'Cliente');
});

maybe('PATCH con email/role/status responde 400 (strict)', async () => {
  for (const body of [{ email: 'x@y.z' }, { role: 'admin' }, { status: 'active' }]) {
    const r = await api('PATCH', '/api/users/me', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.json.error, 'invalid_body');
  }
});

maybe('PATCH con teléfono inválido responde 400', async () => {
  const r = await api('PATCH', '/api/users/me', { phone: 'no-telefono' });
  assert.equal(r.status, 400);
});

maybe('PATCH con avatar ajeno o inexistente responde 400', async () => {
  const r = await api('PATCH', '/api/users/me', {
    avatar: '00000000-0000-4000-8000-0000000000aa',
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'invalid_avatar');
});

maybe('PATCH vacío responde 400', async () => {
  const r = await api('PATCH', '/api/users/me', {});
  assert.equal(r.status, 400);
});
