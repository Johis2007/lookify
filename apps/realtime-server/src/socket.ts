import type pg from 'pg';
import type { Server } from 'socket.io';
import {
  professionalExists,
  resolveAttachableBooking,
  resolveBookingAccess,
  resolveOwnNewBooking,
  resolveOwnProfessionalId,
  resolveOwnVerifiedProfessionalId,
  type AuthedUser,
} from './auth.js';

// Handlers de Socket.io (Fase 3-7) extraídos de index.ts para poder probarlos
// sin levantar el proceso completo. Toda la autorización vive aquí: el
// professional_id que manda el cliente se ignora y la identidad sale del JWT
// verificado en el handshake (io.use en index.ts).

// Contadores que index.ts publica en /health. El módulo solo incrementa los
// que le pertenecen (conexiones y GPS).
export type RealtimeStats = {
  connectionsTotal: number;
  connectionsCurrent: number;
  locAccepted: number;
  locRateLimited: number;
  locBanned: number;
  locInvalid: number;
};

// Subconjunto de Redis que usan los handlers (permite inyectar un fake en tests).
export type SocketRedis = {
  sadd(key: string, member: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  del(key: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
};

export type SocketHandlerDeps = {
  pool: pg.Pool;
  redis: SocketRedis;
  stats: RealtimeStats;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  logWarn: (msg: string, extra?: Record<string, unknown>) => void;
  logErr: (msg: string, extra?: Record<string, unknown>) => void;
};

// Anti-saturación (Fase 3/5/6): 1 mensaje GPS / 5s por socket + ban temporal.
const lastLoc = new Map<string, number>();
const violations = new Map<string, { count: number; windowStart: number }>();
const bannedUntil = new Map<string, number>();

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function isValidId(v: unknown): v is string | number {
  return (
    (typeof v === 'string' && v.length > 0 && v.length <= 64) ||
    (typeof v === 'number' && Number.isFinite(v) && v > 0)
  );
}

function checkRateLimit(socketId: string, stats: RealtimeStats): { ok: boolean; reason?: string } {
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
    if (now - v.windowStart > 60_000) {
      v.count = 0;
      v.windowStart = now;
    }
    v.count += 1;
    violations.set(socketId, v);
    if (v.count >= 5) {
      bannedUntil.set(socketId, now + 60_000);
      stats.locBanned += 1;
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

async function attachBooking(redis: SocketRedis, professionalId: string, bookingId: string) {
  // Vincula pro <-> booking para reenviar ubicación solo a su room (Fase 5).
  await redis.sadd(`prof_bookings:${professionalId}`, bookingId);
  await redis.expire(`prof_bookings:${professionalId}`, 3600);
  await redis.set(`booking_prof:${bookingId}`, professionalId, 'EX', 3600);
}

export function registerSocketHandlers(io: Server, deps: SocketHandlerDeps): void {
  const { pool, redis, stats, log, logWarn, logErr } = deps;

  io.on('connection', (socket) => {
    // Fase 7: identidad verificada en el handshake (io.use). Todos los eventos
    // sensibles se atan a este usuario; el professional_id del payload se ignora.
    const me = socket.data.user as AuthedUser;
    stats.connectionsTotal += 1;
    stats.connectionsCurrent += 1;
    if (me.isAdmin) socket.join('admins');

    const forbidden = (action: string) => {
      socket.emit('error', { code: 'FORBIDDEN', message: `Sin acceso para ${action}` });
      logWarn('forbidden', { action, user: me.userId });
    };

    socket.on('prof:online', async () => {
      // Solo un profesional VERIFICADO puede anunciarse online (gate servidor).
      const pid = await resolveOwnVerifiedProfessionalId(pool, me.userId);
      if (pid === null) {
        forbidden('prof:online');
        return;
      }
      socket.join(`prof:${pid}`);
      await redis.set(`online:${pid}`, '1', 'EX', 40);
      log('prof:online', { pid, user: me.userId });
    });

    socket.on('prof:offline', async () => {
      const pid = await resolveOwnProfessionalId(pool, me.userId);
      if (pid === null) return;
      await redis.del(`online:${pid}`);
      await redis.del(`geo:prof:${pid}`);
      await redis.del(`prof_bookings:${pid}`);
      log('prof:offline', { pid, user: me.userId });
    });

    // Heartbeat explícito (Fase 5): el pro lo llama cada ~25s para no expirar TTL 40s.
    socket.on('prof:heartbeat', async () => {
      const pid = await resolveOwnVerifiedProfessionalId(pool, me.userId);
      if (pid === null) return;
      await redis.expire(`online:${pid}`, 40);
    });

    socket.on('location:update', async ({ professional_id, lat, lng, booking_id }) => {
      if (!isValidLatLng(lat, lng)) {
        stats.locInvalid += 1;
        return;
      }
      if (booking_id !== undefined && booking_id !== null && !isValidId(booking_id)) {
        stats.locInvalid += 1;
        return;
      }
      // El GPS siempre se atribuye al perfil propio: el id declarado se ignora.
      // Solo profesionales verificados publican ubicación (gate servidor).
      const pid = await resolveOwnVerifiedProfessionalId(pool, me.userId);
      if (pid === null) {
        forbidden('location:update');
        return;
      }
      if (professional_id !== undefined && professional_id !== null && String(professional_id) !== String(pid)) {
        logWarn('pro id mismatch (ignorado)', { claimed: String(professional_id), pid, user: me.userId });
      }
      const gate = checkRateLimit(socket.id, stats);
      if (!gate.ok) {
        socket.emit('error', {
          code: gate.reason === 'banned' ? 'BANNED_60S' : 'RATE_LIMITED',
          message: 'Máximo 1 mensaje GPS cada 5s',
        });
        return;
      }
      stats.locAccepted += 1;
      const now = Date.now();
      const zone = geohash5(lat, lng);
      socket.join(`zone:${zone}`);
      // Redis TTL 30s: si no reporta, se considera offline (Fase 5).
      await redis.set(`geo:prof:${pid}`, JSON.stringify({ lat, lng, ts: now }), 'EX', 30);
      await redis.set(`online:${pid}`, '1', 'EX', 40);
      const payload = { professional_id: String(pid), lat, lng, ts: now };
      // Fan-out a su zona (clientes del mapa/radar).
      socket.to(`zone:${zone}`).emit('zone:update', [payload]);
      // + a sus bookings activos (tracking 1:1, sin broadcast global).
      try {
        const bids = await redis.smembers(`prof_bookings:${pid}`);
        const targets = new Set<string>(bids);
        // Reenvío extra solo si la reserva le pertenece (cliente, pro o admin).
        if (booking_id !== undefined && booking_id !== null) {
          const bid = await resolveBookingAccess(pool, me, booking_id);
          if (bid === null) {
            stats.locInvalid += 1;
          } else targets.add(String(bid));
        }
        for (const bid of targets) {
          io.to(`booking:${bid}`).emit('pro:location', { ...payload, booking_id: bid });
        }
      } catch (e) {
        logErr('forward booking rooms', { err: String(e) });
      }
    });

    socket.on('booking:join', async ({ booking_id, professional_id }) => {
      // Entrar a la room exige pertenencia: cliente dueño, pro asignado o admin.
      const bid = await resolveBookingAccess(pool, me, booking_id);
      if (bid === null) {
        forbidden('booking:join');
        return;
      }
      socket.join(`booking:${bid}`);
      // Si declara professional_id debe ser el propio para vincular (tracking
      // 1:1). Si es otro (ej. el cliente reenviando el pro de su reserva), se
      // ignora en silencio: el join ya es válido y no se filtra nada.
      if (professional_id !== undefined && professional_id !== null) {
        if (me.isAdmin) {
          const pid = await professionalExists(pool, professional_id);
          if (pid !== null) await attachBooking(redis, String(pid), String(bid));
        } else {
          const ownPro = await resolveOwnProfessionalId(pool, me.userId);
          if (ownPro !== null && String(professional_id) === String(ownPro)) {
            await attachBooking(redis, String(ownPro), String(bid));
          }
        }
      }
    });

    // El pro llama esto al aceptar: a partir de aquí su GPS va a booking:{id}.
    // Solo si la reserva está sin asignar (claim) o asignada a él (o admin).
    socket.on('booking:attach', async ({ booking_id, professional_id }) => {
      if (!isValidId(booking_id)) return;
      let pid: number;
      if (me.isAdmin) {
        const exists = await professionalExists(pool, professional_id);
        if (exists === null) {
          forbidden('booking:attach');
          return;
        }
        pid = exists;
      } else {
        const ownPro = await resolveOwnProfessionalId(pool, me.userId);
        if (ownPro === null) {
          forbidden('booking:attach');
          return;
        }
        pid = ownPro;
      }
      const bid = await resolveAttachableBooking(pool, me, booking_id);
      if (bid === null) {
        forbidden('booking:attach');
        return;
      }
      await attachBooking(redis, String(pid), String(bid));
      socket.join(`booking:${bid}`);
    });

    // La reserva vive en Directus; aquí solo se anuncia la recién creada por su
    // propio cliente. Sin broadcast global: va al pro asignado + sala admins
    // (el admin refresca vía API; ya no se filtran datos a todos los conectados).
    socket.on('booking:new', async ({ booking_id }) => {
      const b = await resolveOwnNewBooking(pool, me, booking_id);
      if (!b) {
        forbidden('booking:new');
        return;
      }
      const payload: Record<string, unknown> = { booking_id: String(b.id) };
      if (b.professional !== null && b.professional !== undefined) {
        payload.professional_id = String(b.professional);
        io.to(`prof:${b.professional}`).emit('booking:new', payload);
      }
      io.to('admins').emit('booking:new', payload);
    });

    // Compat FASE 3 (app/(client)/map): alias simple de join a booking room.
    socket.on('join:booking', async ({ booking_id }) => {
      const bid = await resolveBookingAccess(pool, me, booking_id);
      if (bid === null) {
        forbidden('join:booking');
        return;
      }
      socket.join(`booking:${bid}`);
    });

    socket.on('leave:booking', ({ booking_id }) => {
      if (booking_id) socket.leave(`booking:${booking_id}`);
    });

    socket.on('join:prof', async ({ professional_id }) => {
      // Solo el propio profesional (o admin) escucha su room prof:{id}.
      if (me.isAdmin) {
        if (!isValidId(professional_id)) return;
        socket.join(`prof:${professional_id}`);
        return;
      }
      const ownPro = await resolveOwnProfessionalId(pool, me.userId);
      if (ownPro === null || String(professional_id) !== String(ownPro)) {
        forbidden('join:prof');
        return;
      }
      socket.join(`prof:${ownPro}`);
    });

    socket.on('leave:prof', ({ professional_id }) => {
      if (professional_id) socket.leave(`prof:${professional_id}`);
    });

    // Cliente se une a zona geográfica para recibir updates en tiempo real
    socket.on('join:zone', ({ lat, lng }) => {
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const zone = geohash5(lat, lng);
      socket.join(`zone:${zone}`);
      log('join:zone', { socket: socket.id, zone, user: me.userId });
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
            AND p.verification_status = 'verified'
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

        const professionals = result.rows.map((row) => ({
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
        logErr('nearby:request error', { err: String(e) });
        socket.emit('nearby:response', []);
      }
    });

    socket.on('booking:status', async ({ booking_id, status }) => {
      if (typeof status !== 'string' || status.length > 32) return;
      // Solo cliente dueño, pro asignado o admin pueden anunciar cambios.
      const bid = await resolveBookingAccess(pool, me, booking_id);
      if (bid === null) {
        forbidden('booking:status');
        return;
      }
      io.to(`booking:${bid}`).emit('booking:status', { booking_id: String(bid), status });
    });

    socket.on('disconnect', () => {
      stats.connectionsCurrent = Math.max(0, stats.connectionsCurrent - 1);
      lastLoc.delete(socket.id);
      violations.delete(socket.id);
      bannedUntil.delete(socket.id);
    });
  });
}
