import { before, after } from 'node:test';
import { DATABASE_URL, SECRET, maybe } from '../infra.js';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createClientsRouter } from './clients.js';
import { createProfessionalsRouter } from './professionals.js';
import { createBookingsRouter } from './bookings.js';
import { errorHandler } from './http.js';

// Ola 2a: perfiles de cliente y reseñas solo por BFF. Contra el Postgres local
// real; usa los usuarios cliente.prueba / cliente2.prueba y limpia fixtures.
const PRO_ID = 121;

let pool: pg.Pool;
let server: Server;
let baseUrl: string;
let user1: string;
let user2: string;
let proUser: string;
let bookingId: number;
let otherBookingId: number;
let notCompletedId: number;
let originalRating: number | null;

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

async function insertBooking(client: string, status: string, professional: number | null): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO bookings
       (client, professional, service, status, price_snapshot, address_text, lat, lng,
        match_round, created_at)
     VALUES ($1,$2,4,$3,50000,'Test 2E',$4,$5,0,NOW()) RETURNING id`,
    [client, professional, status, 4.65, -74.06],
  );
  return r.rows[0].id;
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

  const pro = await pool.query<{ user: string; rating_avg: string | null }>(
    'SELECT "user", rating_avg FROM beauty_professionals WHERE id = $1',
    [PRO_ID],
  );
  if (!pro.rows[0]) throw new Error('falta el profesional 121');
  proUser = pro.rows[0].user;
  originalRating = pro.rows[0].rating_avg === null ? null : Number(pro.rows[0].rating_avg);

  bookingId = await insertBooking(user1, 'completed', PRO_ID);
  otherBookingId = await insertBooking(user2, 'completed', PRO_ID);
  notCompletedId = await insertBooking(user1, 'in_progress', PRO_ID);

  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use('/api/clients', createClientsRouter(pool));
  app.use('/api/professionals', createProfessionalsRouter(pool));
  app.use(
    '/api/bookings',
    createBookingsRouter({
      pool,
      emitNew: () => undefined,
      emitStatus: () => undefined,
    }),
  );
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await pool.query('DELETE FROM reviews WHERE booking = ANY($1::int[])', [
    [bookingId, otherBookingId, notCompletedId],
  ]);
  await pool.query('DELETE FROM bookings WHERE id = ANY($1::int[])', [
    [bookingId, otherBookingId, notCompletedId],
  ]);
  await pool.query('UPDATE beauty_professionals SET rating_avg = $2 WHERE id = $1', [
    PRO_ID,
    originalRating,
  ]);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

maybe('POST/PUT /api/clients/me es idempotente y usa el user del token', async () => {
  const created = await api('PUT', '/api/clients/me', user1, {
    displayName: 'Cliente Prueba',
    phone: '3001234567',
  });
  assert.ok(created.status === 200 || created.status === 201);
  assert.equal(created.json.data.displayName, 'Cliente Prueba');

  const again = await api('POST', '/api/clients/me', user1, { phone: '3007654321' });
  assert.equal(again.status, 200);
  assert.equal(again.json.data.phone, '3007654321');

  const me = await api('GET', '/api/clients/me', user1);
  assert.equal(me.status, 200);
  assert.equal(me.json.data.phone, '3007654321');
});

maybe('un cliente no puede leer ni editar el perfil de otro por el BFF', async () => {
  await api('PUT', '/api/clients/me', user2, { displayName: 'Cliente Dos', phone: '3110000000' });
  const mine = await api('GET', '/api/clients/me', user2);
  const other = await api('GET', '/api/clients/me', user1);
  assert.equal(mine.json.data.displayName, 'Cliente Dos');
  assert.equal(other.json.data.displayName, 'Cliente Prueba');
  assert.notEqual(mine.json.data.id, other.json.data.id);

  const intromision = await api('PUT', '/api/clients/me', user2, {
    user: user1,
    displayName: 'Hack',
  });
  assert.equal(intromision.status, 400);
  const after = await api('GET', '/api/clients/me', user1);
  assert.equal(after.json.data.displayName, 'Cliente Prueba');
});

maybe('reseña: solo dueño, solo completed, sin duplicados y rating 1..5', async () => {
  const ajena = await api('POST', `/api/bookings/${otherBookingId}/review`, user1, { rating: 5 });
  assert.equal(ajena.status, 404);

  const noCompletada = await api('POST', `/api/bookings/${notCompletedId}/review`, user1, {
    rating: 5,
  });
  assert.equal(noCompletada.status, 403);

  const rango = await api('POST', `/api/bookings/${bookingId}/review`, user1, { rating: 6 });
  assert.equal(rango.status, 400);
  const decimal = await api('POST', `/api/bookings/${bookingId}/review`, user1, { rating: 4.5 });
  assert.equal(decimal.status, 400);

  const ok = await api('POST', `/api/bookings/${bookingId}/review`, user1, {
    rating: 5,
    comment: 'Excelente',
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.data.rating, 5);

  const dup = await api('POST', `/api/bookings/${bookingId}/review`, user1, { rating: 4 });
  assert.equal(dup.status, 409);
});

maybe('rating_avg se recalcula y las reseñas exponen solo el primer nombre', async () => {
  const rating = await pool.query<{ rating_avg: string }>(
    'SELECT rating_avg FROM beauty_professionals WHERE id = $1',
    [PRO_ID],
  );
  assert.equal(Number(rating.rows[0].rating_avg), 5);

  const pro = await api('GET', '/api/professionals/me/reviews', proUser);
  assert.equal(pro.status, 200);
  assert.equal(pro.json.data.total, 1);
  assert.equal(pro.json.data.reviews[0].author, 'Cliente');

  const publico = await api('GET', `/api/professionals/${PRO_ID}/reviews`, user1);
  assert.equal(publico.status, 200);
  assert.equal(publico.json.data.reviews[0].comment, 'Excelente');
  const body = JSON.stringify(publico.json);
  assert.equal(body.includes(user1), false);
  assert.equal(body.includes('@'), false);
});
