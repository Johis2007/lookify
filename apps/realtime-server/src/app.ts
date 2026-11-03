import type { IncomingMessage } from 'node:http';
import express, { type Express, type Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { verifyAccessToken, type AuthedUser } from './auth.js';
import { createBookingsRouter } from './api/bookings.js';
import { createClientsRouter } from './api/clients.js';
import { createFilesRouter } from './api/files.js';
import { createProfessionalsRouter } from './api/professionals.js';
import { createRegisterRouter } from './api/register.js';
import { createUsersRouter } from './api/users.js';
import { errorHandler } from './api/http.js';
import {
  createRoleGuard,
  createRolePolicy,
  type RolePolicy,
} from './api/roleGuard.js';
import { isValidLatLng } from './socket.js';

// Construye el BFF HTTP completo sin abrir puertos ni crear clientes de
// infraestructura. `index.ts` lo usa en producción y los tests de cableado lo
// usan para comprobar el ORDEN real de montaje (guard antes de los routers).

export type BffStats = {
  startedAt: number;
  connectionsTotal: number;
  connectionsCurrent: number;
  locAccepted: number;
  locRateLimited: number;
  locBanned: number;
  locInvalid: number;
  trackRelayed: number;
  trackRateLimited: number;
  nearbyQueries: number;
  nearbyErrors: number;
  batchRuns: number;
  batchErrors: number;
  batchRows: number;
  authRejected: number;
};

export const BFF_MOUNT_MARKER = Symbol.for('lookify.bffMount');

export type BffAppDeps = {
  pool: Pool;
  redis: Redis;
  stats: BffStats;
  directusSecret: string;
  appRoleId?: string | null;
  corsOpen: boolean;
  logErr: (msg: string, extra?: Record<string, unknown>) => void;
  getIo: () => Server;
  rolePolicy?: RolePolicy;
  roleCacheTtlMs?: number;
  now?: () => number;
};

export type BffApplication = {
  app: Express;
  rolePolicy: RolePolicy;
};

function mount(app: Express, path: string, router: Router): void {
  Object.defineProperty(router, BFF_MOUNT_MARKER, { value: path });
  app.use(path, router);
}

export function createBffApp(deps: BffAppDeps): BffApplication {
  const {
    pool,
    redis,
    stats,
    directusSecret,
    corsOpen,
    logErr,
    getIo,
  } = deps;

  const rolePolicy =
    deps.rolePolicy ??
    createRolePolicy({
      pool,
      appRoleId: deps.appRoleId,
      cacheTtlMs: deps.roleCacheTtlMs,
      now: deps.now,
    });

  function httpBearer(req: IncomingMessage): AuthedUser | null {
    const h = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(h.trim());
    if (!m) return null;
    try {
      return verifyAccessToken(m[1], directusSecret);
    } catch {
      return null;
    }
  }

  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '64kb' }));
  app.locals.directusSecret = directusSecret;

  app.get('/health', (_req, res) => {
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
        cors: corsOpen ? 'open-dev' : 'restricted',
        stats,
      });
    })();
  });

  app.use(createRoleGuard({ policy: rolePolicy, directusSecret }));

  app.get('/realtime/nearby', (req, res) => {
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

  mount(
    app,
    '/api/bookings',
    createBookingsRouter({
      pool,
      emitNew: (bookingId, professionalId, clientId) => {
        const payload: Record<string, unknown> = { booking_id: String(bookingId), client_id: clientId };
        if (professionalId !== null && professionalId !== undefined) {
          payload.professional_id = String(professionalId);
          getIo().to(`prof:${professionalId}`).emit('booking:new', payload);
        }
        getIo().to('admins').emit('booking:new', payload);
      },
      emitStatus: (bookingId, status) => {
        getIo().to(`booking:${bookingId}`).emit('booking:status', { booking_id: String(bookingId), status });
      },
      emitOffer: (bookingId, professionalId, clientId) => {
        getIo().to(`prof:${professionalId}`).emit('booking:new', {
          booking_id: String(bookingId),
          client_id: clientId,
          offer: true,
        });
      },
      emitTaken: (bookingId, professionalId) => {
        getIo().to(`prof:${professionalId}`).emit('booking:taken', { booking_id: String(bookingId) });
      },
      emitExpired: (bookingId) => {
        getIo().to(`booking:${bookingId}`).emit('booking:status', {
          booking_id: String(bookingId),
          status: 'expired',
        });
      },
      redis,
      emitEvent: (bookingId, event) => {
        getIo().to(`booking:${bookingId}`).emit('booking:event', {
          booking_id: String(bookingId),
          ...event,
        });
      },
    }),
  );
  mount(app, '/api/auth', createRegisterRouter({ appRoleId: deps.appRoleId ?? undefined, pool }));
  mount(app, '/api/clients', createClientsRouter(pool));
  mount(app, '/api/professionals', createProfessionalsRouter(pool));
  mount(app, '/api/files', createFilesRouter(pool));
  mount(app, '/api/users', createUsersRouter(pool));
  app.use(errorHandler);

  return { app, rolePolicy };
}
