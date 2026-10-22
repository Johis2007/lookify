import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { createBookingsRouter } from './api/bookings.js';
import { errorHandler } from './api/http.js';
import { verifyAccessToken } from './auth.js';
import { registerSocketHandlers, type RealtimeStats, type SocketRedis } from './socket.js';
import { readLastPosition, trackingKey } from './tracking.js';

// 4C-2: rastreo en vivo por reserva. HTTP + socket contra el Postgres real,
// con un Redis en memoria para comprobar claves y TTL lógico.
const DATABASE_URL = process.env.DATABASE_URL;
const SECRET = process.env.DIRECTUS_SECRET;
const maybe = DATABASE_URL && SECRET ? test : test.skip;

let pool: pg.Pool;
let httpServer: Server;
let io: SocketServer;
let baseUrl: string;
let clientUser: string;
let otherClient: string;
let proUser: string;
let proId: number;
let foreignProUser: string;
let foreignProId: number;
let serviceId: number;
let bookingAccepted: number;
let bookingOther: number;

const stats: RealtimeStats = {
  connectionsTotal: 0,
  connectionsCurrent: 0,
  locAccepted: 0,
  locRateLimited: 0,
  locBanned: 0,
  locInvalid: 0,
  trackRelayed: 0,
  trackRateLimited: 0,
};

const store = new Map<string, string>();
const redis: SocketRedis = {
  async sadd() {
    return 0;
  },
  async expire() {
    return 1;
  },
  async set(key, value) {
    store.set(key, value);
    return 'OK';
  },
  async get(key) {
    return store.get(key) ?? null;
  },
  async del(key) {
    return store.delete(key) ? 1 : 0;
  },
  async smembers() {
    return [];
  },
};

function token(userId: string): string {
  return jwt.sign({ id: userId, role: 'app-role', admin_access: false }, SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function connect(userId: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = clientIo(baseUrl, {
      auth: { token: token(userId) },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (e) => reject(e));
  });
}

function nextEvent<T = any>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), 3000);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(
  method: string,
  path: string,
  userId: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token(userId)}`,
    },
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

async function insertBooking(client: string, professional: number, status: string): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO bookings (client, professional, service, status, price_snapshot, address_text, lat, lng)
     VALUES ($1, $2, $3, $4, 42000, 'Calle Tracking', 4.7, -74.0) RETURNING id`,
    [client, professional, serviceId, status],
  );
  return r.rows[0].id;
}

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL });

  const stamp = Date.now();
  const mkUser = async (email: string) => {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO directus_users (id, first_name, email, status)
       VALUES (gen_random_uuid(), 'Tracking', $1, 'active') RETURNING id`,
      [email],
    );
    return r.rows[0].id;
  };
  const mkPro = async (userId: string, email: string) => {
    const r = await pool.query<{ id: number }>(
      `INSERT INTO beauty_professionals ("user", display_name, verification_status, is_online)
       VALUES ($1, $2, 'verified', false) RETURNING id`,
      [userId, email],
    );
    return r.rows[0].id;
  };

  clientUser = await mkUser(`track-client-${stamp}@lookify.app`);
  otherClient = await mkUser(`track-other-${stamp}@lookify.app`);
  proUser = await mkUser(`track-pro-${stamp}@lookify.app`);
  proId = await mkPro(proUser, 'Track Pro');
  foreignProUser = await mkUser(`track-pro2-${stamp}@lookify.app`);
  foreignProId = await mkPro(foreignProUser, 'Track Pro 2');

  const s = await pool.query<{ id: number }>(
    `INSERT INTO beauty_services (name, price_base, duration_min, is_active)
     VALUES ('Tracking Service', 42000, 40, true) RETURNING id`,
  );
  serviceId = s.rows[0].id;

  bookingAccepted = await insertBooking(clientUser, proId, 'accepted');
  bookingOther = await insertBooking(otherClient, foreignProId, 'accepted');

  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use(
    '/api/bookings',
    createBookingsRouter({
      pool,
      emitNew: () => {},
      emitStatus: () => {},
      redis,
      emitEvent: (bookingId, event) => {
        io.to(`booking:${bookingId}`).emit('booking:event', {
          booking_id: String(bookingId),
          ...event,
        });
      },
    }),
  );
  app.use(errorHandler);
  httpServer = createServer(app);
  io = new SocketServer(httpServer);
  io.use((socket, next) => {
    const t = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof t !== 'string' || !t) return next(new Error('UNAUTHORIZED'));
    try {
      socket.data.user = verifyAccessToken(t, SECRET as string);
      next();
    } catch (e) {
      next(e instanceof Error ? e : new Error('UNAUTHORIZED'));
    }
  });
  registerSocketHandlers(io, {
    pool,
    redis,
    stats,
    log: () => {},
    logWarn: () => {},
    logErr: () => {},
  });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await pool.query('DELETE FROM booking_events WHERE booking = ANY($1)', [
    [bookingAccepted, bookingOther],
  ]);
  await pool.query('DELETE FROM bookings WHERE id = ANY($1)', [[bookingAccepted, bookingOther]]);
  await pool.query('DELETE FROM professional_services WHERE service_id = $1', [serviceId]);
  await pool.query('DELETE FROM beauty_services WHERE id = $1', [serviceId]);
  await pool.query('DELETE FROM beauty_professionals WHERE id = ANY($1)', [[proId, foreignProId]]);
  await pool.query('DELETE FROM directus_users WHERE id = ANY($1)', [
    [clientUser, otherClient, proUser, foreignProUser],
  ]);
  await pool.end();
});

maybe('el pro asignado releva a la sala booking y guarda Redis + histórico', async () => {
  store.delete(trackingKey(bookingAccepted));
  const client = await connect(clientUser);
  const pro = await connect(proUser);
  try {
    client.emit('booking:join', { booking_id: bookingAccepted });
    await delay(100);
    const got = nextEvent<{ booking_id: string; lat: number; lng: number }>(
      client,
      'booking:location',
    );
    pro.emit('location:update', { booking_id: bookingAccepted, lat: 4.701, lng: -74.001 });
    const payload = await got;
    assert.equal(payload.booking_id, String(bookingAccepted));
    assert.equal(payload.lat, 4.701);
    await delay(150);
    const last = await readLastPosition(redis, bookingAccepted);
    assert.deepEqual({ lat: last?.lat, lng: last?.lng }, { lat: 4.701, lng: -74.001 });
    const hist = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM booking_location_history
        WHERE booking_id = $1 AND professional_id = $2`,
      [bookingAccepted, proId],
    );
    assert.ok(Number(hist.rows[0].count) >= 1, 'debe guardar histórico GPS');
  } finally {
    client.close();
    pro.close();
  }
});

maybe('un tercero no puede entrar a la sala de tracking (FORBIDDEN)', async () => {
  const other = await connect(otherClient);
  try {
    const error = nextEvent<{ code: string }>(other, 'error');
    other.emit('booking:join', { booking_id: bookingAccepted });
    const payload = await error;
    assert.equal(payload.code, 'FORBIDDEN');
  } finally {
    other.close();
  }
});

maybe('otro pro no puede relevar una reserva que no es suya', async () => {
  store.delete(trackingKey(bookingAccepted));
  const foreign = await connect(foreignProUser);
  try {
    const error = nextEvent<{ code: string }>(foreign, 'error');
    foreign.emit('location:update', { booking_id: bookingAccepted, lat: 4.7, lng: -74.0 });
    const payload = await error;
    assert.equal(payload.code, 'FORBIDDEN');
    await delay(100);
    assert.equal(store.has(trackingKey(bookingAccepted)), false);
  } finally {
    foreign.close();
  }
});

maybe('máximo 1 relevo cada 2s por socket', async () => {
  const pro = await connect(proUser);
  try {
    pro.emit('location:update', { booking_id: bookingAccepted, lat: 4.702, lng: -74.002 });
    await delay(120);
    const error = nextEvent<{ code: string }>(pro, 'error');
    pro.emit('location:update', { booking_id: bookingAccepted, lat: 4.703, lng: -74.003 });
    const payload = await error;
    assert.equal(payload.code, 'RATE_LIMITED');
    const last = await readLastPosition(redis, bookingAccepted);
    assert.equal(last?.lat, 4.702, 'la segunda posición no debe guardarse');
  } finally {
    pro.close();
  }
});

maybe('GET /tracking: participante 200 con última posición; tercero 404', async () => {
  const ok = await api('GET', `/api/bookings/${bookingAccepted}/tracking`, clientUser);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.bookingId, bookingAccepted);
  assert.equal(ok.json.data.location.lat, 4.702);
  assert.equal(ok.json.data.professionalId, proId);

  const denied = await api('GET', `/api/bookings/${bookingAccepted}/tracking`, otherClient);
  assert.equal(denied.status, 404);
});

maybe('la llegada del pro avisa al cliente por booking:event', async () => {
  const client = await connect(clientUser);
  try {
    client.emit('booking:join', { booking_id: bookingAccepted });
    await delay(100);
    const got = nextEvent<{ booking_id: string; status: string }>(client, 'booking:event');
    const res = await api('POST', `/api/bookings/${bookingAccepted}/events`, proUser, {
      status: 'llegada',
    });
    assert.equal(res.status, 201);
    const payload = await got;
    assert.equal(payload.booking_id, String(bookingAccepted));
    assert.equal(payload.status, 'llegada');
  } finally {
    client.close();
  }
});

maybe('al iniciar el servicio se detiene el rastreo (clave borrada y FORBIDDEN)', async () => {
  const res = await api('POST', `/api/bookings/${bookingAccepted}/start`, proUser);
  assert.equal(res.status, 200);
  assert.equal(res.json.data.status, 'in_progress');
  assert.equal(store.has(trackingKey(bookingAccepted)), false, 'debe borrar la última posición');

  const pro = await connect(proUser);
  try {
    const error = nextEvent<{ code: string }>(pro, 'error');
    pro.emit('location:update', { booking_id: bookingAccepted, lat: 4.704, lng: -74.004 });
    const payload = await error;
    assert.equal(payload.code, 'FORBIDDEN', 'ya no está en accepted');
  } finally {
    pro.close();
  }
});
