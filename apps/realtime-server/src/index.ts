import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import pg from 'pg';
import pino from 'pino';
import { createBffApp, type BffStats } from './app.js';
import { createSocketAuthGuard } from './api/roleGuard.js';
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
const stats: BffStats = {
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
  // Sin Origin = app nativa/CLI (CORS no aplica). Los navegadores sí lo envían.
  if (!origin) return cb(null, true);
  if (CORS_LIST.includes(origin)) return cb(null, true);
  logWarn('cors blocked', { origin });
  return cb(new Error('CORS blocked'));
}

const redis = new Redis(REDIS_URL);
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// BFF HTTP montado sobre el mismo servidor (Paso 2B): además de /health y
// /realtime/nearby, expone /api/* con Express. Socket.io se engancha al mismo
// httpServer, así que la app solo necesita un host:puerto.
const ioRef: { current: Server | null } = { current: null };
const { app, rolePolicy } = createBffApp({
  pool,
  redis,
  stats,
  directusSecret: DIRECTUS_SECRET,
  appRoleId: process.env.APP_ROLE_ID,
  corsOpen: CORS_OPEN,
  logErr,
  getIo: () => {
    if (!ioRef.current) throw new Error('socket.io aún no inicializado');
    return ioRef.current;
  },
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: corsOrigin },
  // Fase 6: límites anti-saturación a nivel transporte.
  maxHttpBufferSize: 1e5, // 100KB por mensaje basta para GPS/eventos
  pingTimeout: 20000,
  pingInterval: 25000,
});
ioRef.current = io;

redis.on('error', (e) => logErr('redis error', { err: e?.message || String(e) }));
pool.on('error', (e) => logErr('pg pool error', { err: e?.message || String(e) }));

// Fase 7 + QA-2.3: handshake autenticado y con rol. Sin JWT válido no hay
// conexión; con JWT de un rol distinto al App User tampoco (salvo admin).
const socketAuth = createSocketAuthGuard({
  directusSecret: DIRECTUS_SECRET,
  policy: rolePolicy,
  onReject: (code, err) => {
    stats.authRejected += 1;
    logWarn('handshake rechazado', { code, err: err?.message });
  },
});
io.use((socket, next) => {
  void socketAuth(socket, (err) => next(err));
});

// Handlers de Socket.io (identidad ya verificada por io.use).
registerSocketHandlers(io, { pool, redis, stats, log, logWarn, logErr });

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
           WHERE id = $1 AND verification_status = 'verified' AND activated_at IS NOT NULL
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
