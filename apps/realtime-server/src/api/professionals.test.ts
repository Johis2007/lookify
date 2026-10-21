import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createProfessionalsRouter } from './professionals.js';
import { errorHandler } from './http.js';

// Tests del BFF de perfil profesional (Paso 2B-bis): cerrar la
// auto-verificación. Contra el Postgres local real; limpia sus fixtures.
const DATABASE_URL = process.env.DATABASE_URL;
const SECRET = process.env.DIRECTUS_SECRET;
const maybe = DATABASE_URL && SECRET ? test : test.skip;

let pool: pg.Pool;
let server: Server;
let baseUrl: string;
let newProUser: string;

function token(userId: string, isAdmin = false): string {
  return jwt.sign({ id: userId, role: 'app-role', admin_access: isAdmin }, SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

async function api(method: string, path: string, userId: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(userId)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use('/api/professionals', createProfessionalsRouter(pool));
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  const u = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, first_name, email, status)
     VALUES (gen_random_uuid(), 'New Pro', 'test-newpro@lookify.app', 'active') RETURNING id`,
  );
  newProUser = u.rows[0].id;
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await pool.query('DELETE FROM beauty_professionals WHERE "user" = $1', [newProUser]);
  await pool.query('DELETE FROM directus_users WHERE id = $1', [newProUser]);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

maybe('POST /me crea el perfil: user del token, pending, rating 0, offline', async () => {
  const res = await api('POST', '/api/professionals/me', newProUser, {
    displayName: 'Nuevo Pro',
    phone: '3001112233',
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.verificationStatus, 'pending');
  assert.equal(res.json.data.ratingAvg, 0);
  assert.equal(res.json.data.isOnline, false);
  // user se deriva del token, no del body.
  const row = await pool.query(`SELECT "user" FROM beauty_professionals WHERE id = $1`, [res.json.data.id]);
  assert.equal(row.rows[0].user, newProUser);
});

maybe('PATCH /me ignora verification_status=verified en create (no existe tal campo)', async () => {
  // El POST no acepta verification_status: pasar campos extra no rompe, pero
  // si se envía por PATCH debe dar 400.
  const res = await api('PATCH', '/api/professionals/me', newProUser, {
    verificationStatus: 'verified',
  });
  assert.equal(res.status, 400);
});

maybe('PATCH /me con campo prohibido (rating_avg) -> 400', async () => {
  const res = await api('PATCH', '/api/professionals/me', newProUser, { ratingAvg: 5 });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'forbidden_field');
});

maybe('PATCH /me con campo prohibido directo (user) -> 400', async () => {
  const res = await api('PATCH', '/api/professionals/me', newProUser, { user: newProUser });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'forbidden_field');
});

maybe('PATCH /me con verification_status en el body -> 400 forbidden_field', async () => {
  const res = await api('PATCH', '/api/professionals/me', newProUser, {
    verification_status: 'verified',
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'forbidden_field');
});

maybe('PATCH /me permite campos de la lista blanca', async () => {
  const res = await api('PATCH', '/api/professionals/me', newProUser, {
    displayName: 'Nuevo Pro Editado',
    bio: 'Hola',
    isOnline: true,
    yearsExp: 3,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.displayName, 'Nuevo Pro Editado');
  assert.equal(res.json.data.isOnline, true);
  assert.equal(res.json.data.yearsExp, 3);
});

maybe('PATCH /me solo admite verificationStatus=pending', async () => {
  const res = await api('PATCH', '/api/professionals/me', newProUser, {
    verificationStatus: 'pending',
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.verificationStatus, 'pending');
});

maybe('GET /me devuelve el perfil propio', async () => {
  const res = await api('GET', '/api/professionals/me', newProUser);
  assert.equal(res.status, 200);
  assert.equal(res.json.data.displayName, 'Nuevo Pro Editado');
});

maybe('GET /me sin perfil -> 404', async () => {
  const other = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, first_name, email, status)
     VALUES (gen_random_uuid(), 'No Pro', 'test-nopro@lookify.app', 'active') RETURNING id`,
  );
  try {
    const res = await api('GET', '/api/professionals/me', other.rows[0].id);
    assert.equal(res.status, 404);
  } finally {
    await pool.query('DELETE FROM directus_users WHERE id = $1', [other.rows[0].id]);
  }
});
