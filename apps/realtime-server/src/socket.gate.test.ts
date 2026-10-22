import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { registerSocketHandlers, type RealtimeStats, type SocketRedis } from './socket.js';
import { verifyAccessToken } from './auth.js';

// 2B-ter: el gate de "profesional verificado" también aplica al socket.
// Un pro 'pending' NO puede emitir prof:online (ni entrar a su room ni
// publicar GPS), aunque tenga perfil y conexión autenticada.
const DATABASE_URL = process.env.DATABASE_URL;
const SECRET = process.env.DIRECTUS_SECRET;
const maybe = DATABASE_URL && SECRET ? test : test.skip;

let pool: pg.Pool;
let httpServer: Server;
let io: SocketServer;
let baseUrl: string;
let verifiedUser: string;
let verifiedPro: number;
let pendingUser: string;
let pendingPro: number;

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

// Redis en memoria: basta para comprobar qué claves escribe (o no) el gate.
function fakeRedis(): SocketRedis & { store: Map<string, string>; sets: Map<string, Set<string>> } {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    store,
    sets,
    async sadd(key, member) {
      const set = sets.get(key) ?? new Set<string>();
      const had = set.has(member);
      set.add(member);
      sets.set(key, set);
      return had ? 0 : 1;
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
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
  };
}
const redis = fakeRedis();

const token = (userId: string) =>
  jwt.sign({ id: userId, role: 'app-role', admin_access: false }, SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

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

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL });

  const stamp = Date.now();
  const mkUser = async (email: string) => {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO directus_users (id, first_name, email, status)
       VALUES (gen_random_uuid(), 'Socket', $1, 'active') RETURNING id`,
      [email],
    );
    return r.rows[0].id;
  };
  const mkPro = async (userId: string, status: string) => {
    const r = await pool.query<{ id: number }>(
      `INSERT INTO beauty_professionals ("user", display_name, verification_status, is_online)
       VALUES ($1, 'Socket Pro', $2, false) RETURNING id`,
      [userId, status],
    );
    return r.rows[0].id;
  };

  verifiedUser = await mkUser(`sock-verified-${stamp}@lookify.app`);
  verifiedPro = await mkPro(verifiedUser, 'verified');
  pendingUser = await mkUser(`sock-pending-${stamp}@lookify.app`);
  pendingPro = await mkPro(pendingUser, 'pending');

  httpServer = createServer();
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
  await pool.query('DELETE FROM beauty_professionals WHERE id = ANY($1)', [[verifiedPro, pendingPro]]);
  await pool.query('DELETE FROM directus_users WHERE id = ANY($1)', [[verifiedUser, pendingUser]]);
  await pool.end();
});

maybe('2B-ter: un pro pending no puede emitir prof:online (FORBIDDEN, sin clave online)', async () => {
  const socket = await connect(pendingUser);
  try {
    const error = nextEvent<{ code: string }>(socket, 'error');
    socket.emit('prof:online');
    const payload = await error;
    assert.equal(payload.code, 'FORBIDDEN');
    await delay(100);
    assert.equal(redis.store.has(`online:${pendingPro}`), false, 'no debe marcarse online');
  } finally {
    socket.close();
  }
});

maybe('2B-ter: un pro pending no puede publicar GPS (location:update)', async () => {
  const socket = await connect(pendingUser);
  try {
    const error = nextEvent<{ code: string }>(socket, 'error');
    socket.emit('location:update', { lat: 4.7, lng: -74.0 });
    const payload = await error;
    assert.equal(payload.code, 'FORBIDDEN');
    await delay(100);
    assert.equal(redis.store.has(`geo:prof:${pendingPro}`), false, 'sin ubicación en Redis');
  } finally {
    socket.close();
  }
});

maybe('2B-ter: un pro verificado sí puede emitir prof:online y publicar GPS', async () => {
  const socket = await connect(verifiedUser);
  try {
    socket.emit('prof:online');
    await delay(150);
    assert.equal(redis.store.get(`online:${verifiedPro}`), '1');

    socket.emit('location:update', { lat: 4.7, lng: -74.0 });
    await delay(200);
    assert.equal(redis.store.has(`geo:prof:${verifiedPro}`), true);
    assert.ok(stats.locAccepted >= 1);
  } finally {
    socket.close();
  }
});
