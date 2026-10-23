import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type IncomingMessage } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import pg from 'pg';
import pino from 'pino';
import {
  AuthError,
  verifyAccessToken,
  type AuthedUser,
} from './auth.js';
import { createBookingsRouter } from './api/bookings.js';
import { createClientsRouter } from './api/clients.js';
import { createFilesRouter } from './api/files.js';
import { createProfessionalsRouter } from './api/professionals.js';
import { createUsersRouter } from './api/users.js';
import { errorHandler } from './api/http.js';
import { sweepMatching, MATCH_SWEEP_INTERVAL_MS } from './matching.js';
import { registerSocketHandlers, isValidLatLng } from './socket.js';

// Carga de entorno: primero apps/realtime-server/.env (si existe) y, como
// fallback, el .env de la raíz del monorepo (donde viven DIRECTUS_SECRET y las
// credenciales de Postgres/Redis). dotenv no sobreescribe lo ya definido.
{
  const here = dirname(fileURLToPath(import.meta.url)); // .../apps/realtime-server/src
  const localEnv = resolve(here, '..', '.env');
  for (const candidate of [localEnv, resolve(here, '..', '..', '..', '.env')]) {
    if (existsSync(candidate)) loadEnv({ path: candidate });
  }
}

const PORT = Number(process.env.PORT || 4001);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://lookify:lookify_pwd@localhost:5432/lookify';
// Compat: docker-compose histórico usa CROS_ORIGIN (typo). Aceptar ambos.
// Fase 6: lista separada por comas para CORS estricto en prod; "*" solo DEV.
const CORS_RAW = process.env.CORS_ORIGIN || process.env.CROS_ORIGIN || '*';
const CORS_LIST = CORS_RAW.split(',').map((s) => s.trim()).filter(Boolean);
const CORS_OPEN = CORS_LIST.includes('*');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const log = (msg: string, extra?: Record<string, unknown>) => logger.info(extra || {}, msg);
const logErr = (msg: string, extra?: Record<string, unknown>) => logger.error(extra || {}, msg);
const logWarn = (msg: string, extra?: Record<string, unknown>) => logger.warn(extra || {}, msg);

// Variables obligatorias: sin ellas el servidor no puede autenticar ni hablar
// con la base. Fallamos temprano con un mensaje accionable (exit 1), no en
// silencio. DIRECTUS_SECRET debe ser el mismo SECRET de Directus (firma los JWT).
const REQUIRED_ENV: { key: string; hint: string }[] = [
  { key: 'DIRECTUS_SECRET', hint: 'el mismo DIRECTUS_SECRET/SECRET de Directus (firma los JWT)' },
  { key: 'DATABASE_URL', hint: 'cadena de conexión de Postgres (postgres://user:pass@host:5432/db)' },
  { key: 'REDIS_URL', hint: 'cadena de conexión de Redis (redis://host:6379)' },
];
{
  const missing = REQUIRED_ENV.filter(({ key }) => !process.env[key]?.trim());
  if (missing.length > 0) {
    for (const { key, hint } of missing) {
      logger.fatal(`Falta ${key} en el entorno: define ${hint}.`);
    }
    logger.fatal(
      'Crea apps/realtime-server/.env o el .env raíz (ver .env.example). Sin estas variables el servidor no arranca.',
    );
    process.exit(1);
  }
}
const DIRECTUS_SECRET = process.env.DIRECTUS_SECRET as string;

// Métricas en memoria (Fase 6: visibles en /health).
const stats = {
  startedAt: Date.now(),
  connectionsTotal: 0,
  connectionsCurrent: 0,
  locAccepted: 0,
  locRateLimited: 0,
  locBanned: 0,
  locInvalid: 0,
  trackRelayed: 0,
  trackRateLimited: 0,
  nearbyQueries: 0,
  nearbyErrors: 0,
  batchRuns: 0,
  batchErrors: 0,
  batchRows: 0,
  authRejected: 0,
};

function corsOrigin(origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) {
  if (CORS_OPEN) return cb(null, true);
  if (origin && CORS_LIST.includes(origin)) return cb(null, true);
  logWarn('cors blocked', { origin });
  return cb(new Error('CORS blocked'));
}

function httpBearer(req: IncomingMessage): AuthedUser | null {
  // Fase 7: /realtime/* exige Bearer <access token de Directus>.
  const h = req.headers.authorization || '';
  const m = /^Bearer (.+)$/.exec(h.trim());
  if (!m) return null;
  try {
    return verifyAccessToken(m[1], DIRECTUS_SECRET);
  } catch {
    return null;
  }
}

// BFF HTTP montado sobre el mismo servidor (Paso 2B): además de /health y
// /realtime/nearby, expone /api/bookings/* con Express. Socket.io se engancha
// al mismo httpServer, así que la app solo necesita un host:puerto.
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));
app.locals.directusSecret = DIRECTUS_SECRET;

app.get('/health', (_req, res) => {
  // Health con checks reales (Fase 5): redis + postgres.
  (async () => {
    let redisOk = false;
    let pgOk = false;
    try {
      const pong = await redis.ping();
      redisOk = pong === 'PONG';
    } catch { redisOk = false; }
    try {
      await pool.query('SELECT 1');
      pgOk = true;
    } catch { pgOk = false; }
    const ok = redisOk && pgOk;
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      redis: redisOk ? 'up' : 'down',
      postgres: pgOk ? 'up' : 'down',
      uptime_s: Math.floor((Date.now() - stats.startedAt) / 1000),
      cors: CORS_OPEN ? 'open-dev' : 'restricted',
      stats,
    });
  })();
});

app.get('/realtime/nearby', (req, res) => {
  // Fase 3/5: query geo centralizada (PostGIS, anti-saturación con limit).
  // Fase 6: mide latencia p95 (ver scripts/load-test.mjs).
  // Fase 7: requiere Bearer (mismo JWT que el socket).
  const fakeReq = { headers: req.headers } as IncomingMessage;
  if (!httpBearer(fakeReq)) {
    stats.nearbyErrors += 1;
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const t0 = Date.now();
  (async () => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const radiusM = Math.min(Math.max(Number(req.query.radius) || 5000, 100), 20000);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      if (!isValidLatLng(lat, lng)) {
        stats.nearbyErrors += 1;
        res.status(400).json({ error: 'lat/lng inválidos' });
        return;
      }
      const { rows } = await pool.query(
        `SELECT pl.professional_id,
                ST_Y(pl.geom::geometry) AS lat, ST_X(pl.geom::geometry) AS lng,
                pl.updated_at, bp.display_name, bp.rating_avg, bp.is_online
         FROM professional_locations pl
         JOIN beauty_professionals bp ON bp.id = pl.professional_id
         WHERE bp.is_online = true
           AND bp.verification_status = 'verified'
           AND ST_DWithin(pl.geom::geography, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, $3)
         ORDER BY pl.geom::geography <-> ST_SetSRID(ST_MakePoint($2,$1),4326)::geography
         LIMIT $4`,
        [lat, lng, radiusM, limit]
      );
      stats.nearbyQueries += 1;
      res.setHeader('Server-Timing', `db;dur=${Date.now() - t0}`);
      res.json({ data: rows });
    } catch (e) {
      stats.nearbyErrors += 1;
      logErr('nearby error', { err: String(e) });
      res.status(500).json({ error: 'nearby failed' });
    }
  })();
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: corsOrigin },
  // Fase 6: límites anti-saturación a nivel transporte.
  maxHttpBufferSize: 1e5, // 100KB por mensaje basta para GPS/eventos
  pingTimeout: 20000,
  pingInterval: 25000,
});
const redis = new Redis(REDIS_URL);
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Fase 7: handshake autenticado. Sin JWT válido no hay conexión.
// El cliente recibe connect_error con message = código ('UNAUTHORIZED' o
// 'TOKEN_EXPIRED'); el detalle queda en el log del servidor.
io.use((socket, next) => {
  const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof token !== 'string' || !token) {
    stats.authRejected += 1;
    return next(new Error('UNAUTHORIZED'));
  }
  try {
    socket.data.user = verifyAccessToken(token, DIRECTUS_SECRET);
    next();
  } catch (e) {
    stats.authRejected += 1;
    const code = e instanceof AuthError ? e.code : 'UNAUTHORIZED';
    logWarn('handshake rechazado', { code });
    next(new Error(code));
  }
});

redis.on('error', (e) => logErr('redis error', { err: e?.message || String(e) }));
pool.on('error', (e) => logErr('pg pool error', { err: e?.message || String(e) }));

// Handlers de Socket.io (identidad ya verificada por io.use).
registerSocketHandlers(io, { pool, redis, stats, log, logWarn, logErr });

// BFF de reservas (Paso 2B). Los eventos socket se emiten SOLO tras confirmar
// la transacción en la base, nunca antes.
app.use(
  '/api/bookings',
  createBookingsRouter({
    pool,
    emitNew: (bookingId, professionalId, clientId) => {
      const payload: Record<string, unknown> = { booking_id: String(bookingId), client_id: clientId };
      if (professionalId !== null && professionalId !== undefined) {
        payload.professional_id = String(professionalId);
        io.to(`prof:${professionalId}`).emit('booking:new', payload);
      }
      io.to('admins').emit('booking:new', payload);
    },
    emitStatus: (bookingId, status) => {
      io.to(`booking:${bookingId}`).emit('booking:status', { booking_id: String(bookingId), status });
    },
    emitOffer: (bookingId, professionalId, clientId) => {
      io.to(`prof:${professionalId}`).emit('booking:new', {
        booking_id: String(bookingId),
        client_id: clientId,
        offer: true,
      });
    },
    emitTaken: (bookingId, professionalId) => {
      io.to(`prof:${professionalId}`).emit('booking:taken', { booking_id: String(bookingId) });
    },
    emitExpired: (bookingId) => {
      io.to(`booking:${bookingId}`).emit('booking:status', {
        booking_id: String(bookingId),
        status: 'expired',
      });
    },
    // 4C-2: última posición en Redis para el polling + aviso de llegada.
    redis,
    emitEvent: (bookingId, event) => {
      io.to(`booking:${bookingId}`).emit('booking:event', {
        booking_id: String(bookingId),
        ...event,
      });
    },
  }),
);
app.use('/api/clients', createClientsRouter(pool));
app.use('/api/professionals', createProfessionalsRouter(pool));
app.use('/api/files', createFilesRouter(pool));
app.use('/api/users', createUsersRouter(pool));
app.use(errorHandler);

// Batch cada 10s: Redis -> PostGIS (evita 1 write por ping).
setInterval(async () => {
  stats.batchRuns += 1;
  try {
    const keys = await redis.keys('geo:prof:*');
    if (!keys.length) return;
    const vals = await redis.mget(keys);
    for (let i = 0; i < keys.length; i++) {
      const rawId = keys[i].replace('geo:prof:', '');
      const profId = Number(rawId);
      if (!Number.isFinite(profId)) { continue; }
      const v = vals[i]; if (!v) continue;
      let lat: number, lng: number;
      try {
        const parsed = JSON.parse(v);
        lat = parsed.lat; lng = parsed.lng;
      } catch { continue; }
      if (!isValidLatLng(lat, lng)) continue;
      // Doble gate: solo persiste GPS de profesionales verificados (cubre el
      // caso de un pro verificado al reportar y des-verificado luego).
      await pool.query(
        `INSERT INTO professional_locations (professional_id, geom, updated_at)
         SELECT $1, ST_SetSRID(ST_MakePoint($2,$3),4326), NOW()
         WHERE EXISTS (
           SELECT 1 FROM beauty_professionals
           WHERE id = $1 AND verification_status = 'verified'
         )
         ON CONFLICT (professional_id) DO UPDATE SET geom=EXCLUDED.geom, updated_at=NOW()`,
        [profId, lng, lat]
      );
      stats.batchRows += 1;
    }
  } catch (e) { stats.batchErrors += 1; logErr('batch error', { err: String(e) }); }
}, 10_000);

httpServer.listen(PORT, () => {
  log('realtime up', { port: PORT, cors: CORS_OPEN ? 'open-dev' : 'restricted' });
  if (CORS_OPEN) logWarn('CORS abierto (*) — solo para DEV; en prod define CORS_ORIGIN');
});

// Barrido del modelo "claim": cada 10 s amplía radio (3->6 km) o expira
// reservas vencidas. Estado en la base -> sobrevive reinicios. Se usa un
// setInterval simple en vez de BullMQ: la carga es baja y no hace falta cola.
setInterval(() => {
  sweepMatching({
    pool,
    emitOffer: (bookingId, professionalId, clientId) => {
      io.to(`prof:${professionalId}`).emit('booking:new', {
        booking_id: String(bookingId),
        client_id: clientId,
        offer: true,
      });
    },
    emitExpired: (bookingId) => {
      io.to(`booking:${bookingId}`).emit('booking:status', {
        booking_id: String(bookingId),
        status: 'expired',
      });
    },
  }).catch((e) => logErr('match sweep error', { err: String(e) }));
}, MATCH_SWEEP_INTERVAL_MS).unref();
