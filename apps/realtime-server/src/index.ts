import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import pg from 'pg';

const PORT = Number(process.env.PORT || 4001);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://lookify:lookify_pwd@localhost:5432/lookify';

const httpServer = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200).end('ok'); return; }
  res.writeHead(404).end('not-found');
});
const io = new Server(httpServer, { cors: { origin: process.env.CROS_ORIGIN || '*' } });
const redis = new Redis(REDIS_URL);
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// rate-limit simple en memoria: 1 msg / 5s por socket para location:update
const lastLoc = new Map<string, number>();

function geohash5(lat: number, lng: number) {
  // geohash simplificado para rooms por zona (no preciso, suficiente MVP)
  return `${Math.floor((lat + 90) * 10)}:${Math.floor((lng + 180) * 10)}`;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

io.on('connection', (socket) => {
  socket.on('prof:online', async ({ professional_id }) => {
    if (!professional_id) return;
    socket.join(`prof:${professional_id}`);
    await redis.set(`online:${professional_id}`, '1', 'EX', 40);
  });

  socket.on('prof:offline', async ({ professional_id }) => {
    if (!professional_id) return;
    await redis.del(`online:${professional_id}`);
    await redis.del(`geo:prof:${professional_id}`);
  });

  socket.on('location:update', async ({ professional_id, lat, lng }) => {
    if (!professional_id || typeof lat !== 'number' || typeof lng !== 'number') return;
    const now = Date.now();
    if (now - (lastLoc.get(socket.id) || 0) < 5000) return; // anti-saturación
    lastLoc.set(socket.id, now);

    const zone = geohash5(lat, lng);
    socket.join(`zone:${zone}`);
    // Redis TTL 30s: si no reporta, se considera offline
    await redis.set(`geo:prof:${professional_id}`, JSON.stringify({ lat, lng, ts: now }), 'EX', 30);
    await redis.set(`online:${professional_id}`, '1', 'EX', 40);
    // fan-out solo a su zona + a sus bookings activos
    socket.to(`zone:${zone}`).emit('zone:update', [{ professional_id, lat, lng }]);
  });

  socket.on('join:booking', ({ booking_id }) => {
    if (booking_id) socket.join(`booking:${booking_id}`);
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
    if (booking_id) io.to(`booking:${booking_id}`).emit('booking:status', { booking_id, status });
  });

  socket.on('disconnect', () => { lastLoc.delete(socket.id); });
});

// Batch cada 10s: Redis -> PostGIS (evita 1 write por ping)
setInterval(async () => {
  try {
    const keys = await redis.keys('geo:prof:*');
    if (!keys.length) return;
    const vals = await redis.mget(keys);
    for (let i = 0; i < keys.length; i++) {
      const profId = keys[i].replace('geo:prof:', '');
      const v = vals[i]; if (!v) continue;
      const { lat, lng } = JSON.parse(v);
      await pool.query(
        `INSERT INTO professional_locations (professional_id, geom, updated_at)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326), NOW())
         ON CONFLICT (professional_id) DO UPDATE SET geom=EXCLUDED.geom, updated_at=NOW()`,
        [profId, lng, lat]
      );
    }
  } catch (e) { console.error('batch error', e); }
}, 10_000);

httpServer.listen(PORT, () => console.log(`realtime up :${PORT}`));