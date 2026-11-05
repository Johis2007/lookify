import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Server as SocketServer } from 'socket.io';
import { createBffApp, type BffStats } from './app.js';

// El BFF debe responder a los preflights del navegador (web admin / Expo web)
// sin comprometer el modo restringido por CORS_ORIGIN.

const SECRET = 'qa-cors-secret';
const APP_ROLE_ID = '11111111-1111-4111-8111-111111111111';

function baseStats(): BffStats {
  return {
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
}

const fakeRedis = { ping: async () => 'PONG' } as unknown as Redis;
const fakePool = { query: async () => ({ rows: [] }) } as unknown as Pool;

function fakeIo(): SocketServer {
  return { to: () => ({ emit: () => undefined }) } as unknown as SocketServer;
}

function makeApp(corsOpen: boolean, corsOrigins: string[] = []): Express {
  const { app } = createBffApp({
    pool: fakePool,
    redis: fakeRedis,
    stats: baseStats(),
    directusSecret: SECRET,
    appRoleId: APP_ROLE_ID,
    corsOpen,
    corsOrigins,
    logErr: () => undefined,
    getIo: fakeIo,
  });
  return app;
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('sin puerto efímero');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function preflightHeaders(origin: string): Record<string, string> {
  return {
    Origin: origin,
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization,content-type',
  };
}

test('CORS abierto: preflight y GET responden con Allow-Origin *', async () => {
  const { server, baseUrl } = await listen(makeApp(true));
  try {
    const options = await fetch(`${baseUrl}/api/users/me`, {
      method: 'OPTIONS',
      headers: preflightHeaders('http://localhost:8090'),
    });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), '*');
    assert.match(options.headers.get('access-control-allow-methods') ?? '', /GET/);
    assert.match(options.headers.get('access-control-allow-headers') ?? '', /authorization/);
    assert.ok(options.headers.get('access-control-max-age'));

    const get = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://localhost:8090' },
    });
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('access-control-allow-origin'), '*');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('CORS restringido: solo los orígenes listados reciben Allow-Origin', async () => {
  const { server, baseUrl } = await listen(makeApp(false, ['http://admin.local']));
  try {
    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://admin.local' },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://admin.local');

    const allowedPreflight = await fetch(`${baseUrl}/api/users/me`, {
      method: 'OPTIONS',
      headers: preflightHeaders('http://admin.local'),
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(
      allowedPreflight.headers.get('access-control-allow-origin'),
      'http://admin.local',
    );

    const denied = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://evil.local' },
    });
    assert.equal(denied.status, 200);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);

    const deniedPreflight = await fetch(`${baseUrl}/api/users/me`, {
      method: 'OPTIONS',
      headers: preflightHeaders('http://evil.local'),
    });
    assert.equal(deniedPreflight.status, 204);
    assert.equal(deniedPreflight.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('CORS: sin Origin (app nativa) la respuesta no lleva cabeceras CORS', async () => {
  const { server, baseUrl } = await listen(makeApp(true));
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
