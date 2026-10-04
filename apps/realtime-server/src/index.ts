import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import pg from 'pg';
import pino from 'pino';

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

// Métricas en memoria (Fase 6: visibles en /health).
const stats = {
  startedAt: Date.now(),
  connectionsTotal: 0,
  connectionsCurrent: 0,
  locAccepted: 0,
  locRateLimited: 0,
  locBanned: 0,
  locInvalid: 0,
  nearbyQueries: 0,
  nearbyErrors: 0,
  batchRuns: 0,
  batchErrors: 0,
  batchRows: 0,
};

function corsOrigin(origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) {
  if (CORS_OPEN) return cb(null, true);
  if (origin && CORS_LIST.includes(origin)) return cb(null, true);
  logWarn('cors blocked', { origin });
  return cb(new Error('CORS blocked'));
}

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
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
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: ok ? 'ok' : 'degraded',
        redis: redisOk ? 'up' : 'down',
        postgres: pgOk ? 'up' : 'down',
        uptime_s: Math.floor((Date.now() - stats.startedAt) / 1000),
        cors: CORS_OPEN ? 'open-dev' : 'restricted',
        stats,
      }));
    })();
    return;
  }
  if (req.url && req.url.startsWith('/realtime/nearby')) {
    // Fase 3/5: query geo centralizada (PostGIS, anti-saturación con limit).
    // Fase 6: mide latencia p95 (ver scripts/load-test.mjs).
    const t0 = Date.now();
    (async () => {
      try {
        const u = new URL(req.url || '', 'http://localhost');
        const lat = Number(u.searchParams.get('lat'));
        const lng = Number(u.searchParams.get('lng'));
        const radiusM = Math.min(Math.max(Number(u.searchParams.get('radius')) || 5000, 100), 20000);
        const limit = Math.min(Math.max(Number(u.searchParams.get('limit')) || 20, 1), 50);
        if (!isValidLatLng(lat, lng)) {
          stats.nearbyErrors += 1;
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'lat/lng inválidos' }));
          return;
        }
        const { rows } = await pool.query(
          `SELECT pl.professional_id,
                  ST_Y(pl.geom::geometry) AS lat, ST_X(pl.geom::geometry) AS lng,
                  pl.updated_at, bp.display_name, bp.rating_avg, bp.is_online
           FROM professional_locations pl
           JOIN beauty_professionals bp ON bp.id = pl.professional_id
           WHERE bp.is_online = true
             AND ST_DWithin(pl.geom::geography, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, $3)
           ORDER BY pl.geom::geography <-> ST_SetSRID(ST_MakePoint($2,$1),4326)::geography
           LIMIT $4`,
          [lat, lng, radiusM, limit]
        );
        stats.nearbyQueries += 1;
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Server-Timing': `db;dur=${Date.now() - t0}`,
        });
        res.end(JSON.stringify({ data: rows }));
      } catch (e) {
        stats.nearbyErrors += 1;
        logErr('nearby error', { err: String(e) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'nearby failed' }));
      }
    })();
    return;
  }
  res.writeHead(404).end('not-found');
});
const io = new Server(httpServer, {
  cors: { origin: corsOrigin },
  // Fase 6: límites anti-saturación a nivel transporte.
  maxHttpBufferSize: 1e5, // 100KB por mensaje basta para GPS/eventos
  pingTimeout: 20000,
  pingInterval: 25000,
});
const redis = new Redis(REDIS_URL);
const pool = new pg.Pool({ connectionString: DATABASE_URL });

redis.on('error', (e) => logErr('redis error', { err: e?.message || String(e) }));
pool.on('error', (e) => logErr('pg pool error', { err: e?.message || String(e) }));

// Anti-saturación (Fase 3/5/6): 1 msg / 5s por socket + ban temporal si abusa.
const lastLoc = new Map<string, number>();
const violations = new Map<string, { count: number; windowStart: number }>();
const bannedUntil = new Map<string, number>();

function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function isValidId(v: unknown): v is string | number {
  return (typeof v === 'string' && v.length > 0 && v.length <= 64)
    || (typeof v === 'number' && Number.isFinite(v) && v > 0);
}
function checkRateLimit(socketId: string): { ok: boolean; reason?: string } {
  const now = Date.now();
  const banned = bannedUntil.get(socketId);
  if (banned && now < banned) return { ok: false, reason: 'banned' };
  if (banned && now >= banned) {
    bannedUntil.delete(socketId);
    violations.delete(socketId);
  }
  const last = lastLoc.get(socketId) || 0;
  if (now - last < 5000) {
    const v = violations.get(socketId) || { count: 0, windowStart: now };
    if (now - v.windowStart > 60_000) { v.count = 0; v.windowStart = now; }
    v.count += 1;
    violations.set(socketId, v);
    if (v.count >= 5) {
      bannedUntil.set(socketId, now + 60_000);
      stats.locBanned += 1;
      logger.info({ socket: socketId, count: v.count }, 'rate-limit ban');
      return { ok: false, reason: 'banned' };
    }
    stats.locRateLimited += 1;
    return { ok: false, reason: 'rate-limited' };
  }
  lastLoc.set(socketId, now);
  return { ok: true };
}

function geohash5(lat: number, lng: number) {
  // Rooms por zona (MVP, suficiente para fan-out sin broadcast global).
  return `${Math.floor((lat + 90) * 10)}:${Math.floor((lng + 180) * 10)}`;
}

async function attachBooking(professionalId: string, bookingId: string) {
  // Vincula pro <-> booking para reenviar ubicación solo a su room (Fase 5).
  await redis.sadd(`prof_bookings:${professionalId}`, bookingId);
  await redis.expire(`prof_bookings:${professionalId}`, 3600);
  await redis.set(`booking_prof:${bookingId}`, professionalId, 'EX', 3600);
}

io.on('connection', (socket) => {
  stats.connectionsTotal += 1;
  stats.connectionsCurrent += 1;
  socket.on('prof:online', async ({ professional_id }) => {
    if (!isValidId(professional_id)) return;
    const pid = String(professional_id);
    socket.join(`prof:${pid}`);
    await redis.set(`online:${pid}`, '1', 'EX', 40);
    log('prof:online', { pid });
  });

  socket.on('prof:offline', async ({ professional_id }) => {
    if (!isValidId(professional_id)) return;
    const pid = String(professional_id);
    await redis.del(`online:${pid}`);
    await redis.del(`geo:prof:${pid}`);
    await redis.del(`prof_bookings:${pid}`);
    log('prof:offline', { pid });
  });

  // Heartbeat explícito (Fase 5): el pro lo llama cada ~25s para no expirar TTL 40s.
  socket.on('prof:heartbeat', async ({ professional_id }) => {
    if (!isValidId(professional_id)) return;
    await redis.expire(`online:${String(professional_id)}`, 40);
  });

  socket.on('location:update', async ({ professional_id, lat, lng, booking_id }) => {
    if (!isValidId(professional_id) || !isValidLatLng(lat, lng)) { stats.locInvalid += 1; return; }
    if (booking_id !== undefined && booking_id !== null && !isValidId(booking_id)) { stats.locInvalid += 1; return; }
    const gate = checkRateLimit(socket.id);
    if (!gate.ok) {
      socket.emit('error', { code: gate.reason === 'banned' ? 'BANNED_60S' : 'RATE_LIMITED', message: 'Máximo 1 mensaje GPS cada 5s' });
      return;
    }
    stats.locAccepted += 1;
    const pid = String(professional_id);
    const now = Date.now();
    const zone = geohash5(lat, lng);
    socket.join(`zone:${zone}`);
    // Redis TTL 30s: si no reporta, se considera offline (Fase 5).
    await redis.set(`geo:prof:${pid}`, JSON.stringify({ lat, lng, ts: now }), 'EX', 30);
    await redis.set(`online:${pid}`, '1', 'EX', 40);
    const payload = { professional_id: pid, lat, lng, ts: now };
    // Fan-out a su zona (clientes del mapa/radar).
    socket.to(`zone:${zone}`).emit('zone:update', [payload]);
    // + a sus bookings activos (tracking 1:1, sin broadcast global).
    try {
      const bids = await redis.smembers(`prof_bookings:${pid}`);
      const targets = new Set<string>(bids);
      if (booking_id) targets.add(String(booking_id));
      for (const bid of targets) {
        io.to(`booking:${bid}`).emit('pro:location', { ...payload, booking_id: bid });
      }
    } catch (e) { logErr('forward booking rooms', { err: String(e) }); }
  });

  socket.on('booking:join', async ({ booking_id, professional_id }) => {
    if (!isValidId(booking_id)) return;
    const bid = String(booking_id);
    socket.join(`booking:${bid}`);
    // Si el que hace join es el pro (o lo declara), vincula para tracking 1:1.
    if (professional_id && isValidId(professional_id)) {
      await attachBooking(String(professional_id), bid);
    }
  });

  // El pro llama esto al aceptar: a partir de aquí su GPS va a booking:{id}.
  socket.on('booking:attach', async ({ booking_id, professional_id }) => {
    if (!isValidId(booking_id) || !isValidId(professional_id)) return;
    await attachBooking(String(professional_id), String(booking_id));
    socket.join(`booking:${String(booking_id)}`);
  });

  // La reserva vive en Directus; aquí solo re-emitimos para realtime (Fase 4/5).
  socket.on('booking:new', ({ booking_id, professional_id, service, client }) => {
    if (!isValidId(booking_id)) return;
    const payload: Record<string, unknown> = { booking_id: String(booking_id) };
    if (professional_id && isValidId(professional_id)) payload.professional_id = String(professional_id);
    if (service !== undefined) payload.service = service;
    if (client !== undefined) payload.client = client;
    // Dirigido al pro (room prof:{id}) + broadcast global para admin/requests.
    if (payload.professional_id) io.to(`prof:${payload.professional_id}`).emit('booking:new', payload);
    io.emit('booking:new', payload);
  });

  // Compat FASE 3 (app/(client)/map): alias simple de join a booking room.
  socket.on('join:booking', ({ booking_id }) => {
    if (!isValidId(booking_id)) return;
    socket.join(`booking:${String(booking_id)}`);
  });

  socket.on('leave:booking', ({ booking_id }) => {
    if (booking_id) socket.leave(`booking:${booking_id}`);
  });

  socket.on('join:prof', ({ professional_id }) => {
    if (professional_id) socket.join(`prof:${professional_id}`);
  });

  socket.on('leave:prof', ({ professional_id }) => {
    if (professional_id) socket.leave(`prof:${professional_id}`);
  });

  // Cliente se une a zona geográfica para recibir updates en tiempo real
  socket.on('join:zone', ({ lat, lng }) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    const zone = geohash5(lat, lng);
    socket.join(`zone:${zone}`);
    console.log(`Client ${socket.id} joined zone:${zone}`);
  });

  socket.on('leave:zone', ({ lat, lng }) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    const zone = geohash5(lat, lng);
    socket.leave(`zone:${zone}`);
  });

  // Query cercanos desde cliente (on-demand)
  socket.on('nearby:request', async ({ lat, lng, radius = 5000, service_id }) => {
    try {
      let query = `
        SELECT p.id, p.display_name, p.bio, p.avatar, p.rating_avg,
               ST_X(l.geom) as lng, ST_Y(l.geom) as lat,
               ST_Distance(l.geom::geography, ST_MakePoint($1,$2)::geography) as dist_m
        FROM beauty_professionals p
        JOIN professional_locations l ON l.professional_id = p.id
        WHERE p.is_online = true
          AND ST_DWithin(l.geom::geography, ST_MakePoint($1,$2)::geography, $3)
      `;
      const params: any[] = [lng, lat, radius];
      
      if (service_id) {
        query += ` AND EXISTS (
          SELECT 1 FROM professional_services ps 
          WHERE ps.professional_id = p.id AND ps.service_id = $4
        )`;
        params.push(service_id);
      }
      
      query += ` ORDER BY dist_m LIMIT 20`;
      
      const result = await pool.query(query, params);
      
      const professionals = result.rows.map(row => ({
        id: row.id,
        display_name: row.display_name,
        bio: row.bio,
        avatar: row.avatar,
        rating_avg: row.rating_avg,
        lat: row.lat,
        lng: row.lng,
        distance_m: Math.round(row.dist_m),
      }));
      
      socket.emit('nearby:response', professionals);
    } catch (e) {
      console.error('nearby:request error', e);
      socket.emit('nearby:response', []);
    }
  });

  socket.on('booking:status', ({ booking_id, status }) => {
    if (!isValidId(booking_id) || typeof status !== 'string' || status.length > 32) return;
    io.to(`booking:${String(booking_id)}`).emit('booking:status', { booking_id: String(booking_id), status });
  });

  socket.on('disconnect', () => {
    stats.connectionsCurrent = Math.max(0, stats.connectionsCurrent - 1);
    lastLoc.delete(socket.id);
    violations.delete(socket.id);
    bannedUntil.delete(socket.id);
  });
});

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
      await pool.query(
        `INSERT INTO professional_locations (professional_id, geom, updated_at)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326), NOW())
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
