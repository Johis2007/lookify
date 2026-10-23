import { before, after } from 'node:test';
import { DATABASE_URL, SECRET, maybe } from '../infra.js';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createProfessionalsRouter } from './professionals.js';
import { errorHandler } from './http.js';

// Tests del BFF de perfil profesional (Paso 2B-bis): cerrar la
// auto-verificación. Contra el Postgres local real; limpia sus fixtures.

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

maybe('POST /me por segunda vez -> 409 (sin duplicados)', async () => {
  const res = await api('POST', '/api/professionals/me', newProUser, { displayName: 'Duplicado' });
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'profile_exists');
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM beauty_professionals WHERE "user" = $1`, [
    newProUser,
  ]);
  assert.equal(count.rows[0].n, 1);
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

maybe('PATCH /me isOnline=true con perfil NO verificado -> 403', async () => {
  // El pro recién creado está en 'pending': no puede anunciarse online.
  const res = await api('PATCH', '/api/professionals/me', newProUser, { isOnline: true });
  assert.equal(res.status, 403);
  assert.equal(res.json.error, 'professional_not_verified');
});

maybe('PATCH /me permite campos de la lista blanca (sin isOnline)', async () => {
  const res = await api('PATCH', '/api/professionals/me', newProUser, {
    displayName: 'Nuevo Pro Editado',
    bio: 'Hola',
    yearsExp: 3,
    specialties: 'manicura, pedicura',
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.displayName, 'Nuevo Pro Editado');
  assert.equal(res.json.data.yearsExp, 3);
  assert.equal(res.json.data.specialties, 'manicura, pedicura');
});

maybe('PATCH /me rechaza phone con formato inválido -> 400', async () => {
  const res = await api('PATCH', '/api/professionals/me', newProUser, { phone: 'abc!!' });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'invalid_body');
});

maybe('PATCH /me verificationStatus=pending solo desde rejected (409 en pending)', async () => {
  // El perfil está en 'pending': reenviar a 'pending' no es transición válida.
  const res = await api('PATCH', '/api/professionals/me', newProUser, {
    verificationStatus: 'pending',
  });
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'invalid_transition');
});

maybe('PATCH /me verificationStatus=pending funciona desde rejected', async () => {
  await pool.query(
    `UPDATE beauty_professionals SET verification_status = 'rejected' WHERE "user" = $1`,
    [newProUser],
  );
  const res = await api('PATCH', '/api/professionals/me', newProUser, {
    verificationStatus: 'pending',
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.verificationStatus, 'pending');
});

maybe('PATCH /me isOnline=true funciona tras verificar (admin)', async () => {
  await pool.query(
    `UPDATE beauty_professionals SET verification_status = 'verified' WHERE "user" = $1`,
    [newProUser],
  );
  const res = await api('PATCH', '/api/professionals/me', newProUser, { isOnline: true });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.isOnline, true);
  // Cleanup para no dejar el fixture online.
  await pool.query(
    `UPDATE beauty_professionals SET verification_status = 'pending', is_online = false WHERE "user" = $1`,
    [newProUser],
  );
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
