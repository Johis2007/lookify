import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Server as SocketServer } from 'socket.io';
import type { AuthedUser } from '../auth.js';
import { BFF_MOUNT_MARKER, createBffApp, type BffStats } from '../app.js';
import {
  ROLE_GUARD_MARKER,
  createRolePolicy,
  createSocketAuthGuard,
  isRoleGuardExemptPath,
} from './roleGuard.js';
import { requireAdmin, type AuthedRequest } from './http.js';

// QA-2.3: el BFF solo acepta App User (o admin). Estos tests no necesitan
// infraestructura: su objetivo es el CABLEADO (orden del guard) y la política.

const APP_ROLE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ROLE_ID = '22222222-2222-4222-8222-222222222222';
const SECRET = 'qa-role-guard-secret';

const TOKEN_NO_ROLE = jwt.sign(
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', admin_access: false },
  SECRET,
);
const TOKEN_APP_USER = jwt.sign(
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: APP_ROLE_ID, admin_access: false },
  SECRET,
);
const TOKEN_ADMIN = jwt.sign(
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', role: OTHER_ROLE_ID, admin_access: true },
  SECRET,
);

type QueryLog = { sql: string; params: unknown[] }[];

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

function fakePool(role: string | null): { pool: Pool; queries: QueryLog } {
  const queries: QueryLog = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      return { rows: role ? [{ role }] : [] };
    },
  } as unknown as Pool;
  return { pool, queries };
}

const fakeRedis = { ping: async () => 'PONG' } as unknown as Redis;

function fakeIo(): SocketServer {
  return { to: () => ({ emit: () => undefined }) } as unknown as SocketServer;
}

function makeApp(options: {
  role?: string | null;
  appRoleId?: string | null;
} = {}): { app: Express; queries: QueryLog } {
  const { pool, queries } = fakePool(options.role ?? null);
  const { app } = createBffApp({
    pool,
    redis: fakeRedis,
    stats: baseStats(),
    directusSecret: SECRET,
    appRoleId: options.appRoleId === undefined ? APP_ROLE_ID : options.appRoleId,
    corsOpen: true,
    logErr: () => undefined,
    getIo: fakeIo,
  });
  return { app, queries };
}

type Layer = {
  handle?: Record<PropertyKey, unknown>;
  route?: { path?: string };
};

function stackOf(app: Express): Layer[] {
  return ((app as unknown as { router: { stack: Layer[] } }).router.stack ?? []);
}

function mountsOf(app: Express): { path: string; index: number }[] {
  const mounts: { path: string; index: number }[] = [];
  stackOf(app).forEach((layer, index) => {
    const mountPath = layer.handle?.[BFF_MOUNT_MARKER];
    if (typeof mountPath === 'string') {
      mounts.push({ path: mountPath, index });
      return;
    }
    if (layer.route?.path) mounts.push({ path: layer.route.path, index });
  });
  return mounts;
}

function isProtected(path: string): boolean {
  return (path === '/realtime/nearby' || path.startsWith('/api/')) && !isRoleGuardExemptPath(path);
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

test('QA-2.3 cableado: el guard se monta antes de TODA ruta protegida', () => {
  const { app } = makeApp({ role: null });
  const stack = stackOf(app);
  const guardIndex = stack.findIndex((layer) => layer.handle?.[ROLE_GUARD_MARKER] === true);
  assert.ok(guardIndex >= 0, 'no se encontró el guard en el stack');

  const mounts = mountsOf(app);
  const protectedMounts = mounts.filter(({ path }) => isProtected(path));
  assert.ok(protectedMounts.length >= 7, `rutas protegidas insuficientes: ${protectedMounts.length}`);
  for (const mount of protectedMounts) {
    assert.ok(
      mount.index > guardIndex,
      `${mount.path} está montado ANTES del guard (índice ${mount.index} <= ${guardIndex})`,
    );
  }

  const healthIndex = mounts.find(({ path }) => path === '/health')?.index;
  assert.ok(healthIndex !== undefined && healthIndex < guardIndex, '/health debe quedar exento antes del guard');
});

test('QA-2.3 HTTP: sin token 401 y con token sin rol 403 en todas las rutas /api y /realtime', async () => {
  const { app } = makeApp({ role: null });
  const { server, baseUrl } = await listen(app);
  try {
    const paths = Array.from(new Set(mountsOf(app).map(({ path }) => path).filter(isProtected)));
    for (const path of paths) {
      const withoutToken = await fetch(`${baseUrl}${path}`);
      assert.equal(withoutToken.status, 401, `sin token ${path}`);

      const withoutRole = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${TOKEN_NO_ROLE}` },
      });
      assert.equal(withoutRole.status, 403, `token sin rol ${path}`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('QA-2.3 exentos: /health y /api/auth/register no exigen rol', async () => {
  const { app } = makeApp({ role: null });
  const { server, baseUrl } = await listen(app);
  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(register.status, 400, 'registro exento: debe llegar a validación, no al guard');
    assert.notEqual(register.status, 401);
    assert.notEqual(register.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('QA-2.3 política: App User y admin permitidos; otro rol y APP_ROLE_ID ausente fallan cerrado', async () => {
  const allowed = createRolePolicy({
    pool: fakePool(APP_ROLE_ID).pool,
    appRoleId: APP_ROLE_ID,
  });
  assert.equal(
    await allowed.isAllowed({ userId: 'u-app', role: APP_ROLE_ID, isAdmin: false }),
    true,
  );
  assert.equal(
    await allowed.isAllowed({ userId: 'u-admin', role: OTHER_ROLE_ID, isAdmin: true }),
    true,
  );
  assert.equal(
    await allowed.isAllowed({ userId: 'u-other', role: OTHER_ROLE_ID, isAdmin: false }),
    false,
  );

  const unconfigured = createRolePolicy({ pool: fakePool(APP_ROLE_ID).pool, appRoleId: null });
  assert.equal(unconfigured.configured, false);
  assert.equal(
    await unconfigured.isAllowed({ userId: 'u-app', role: APP_ROLE_ID, isAdmin: false }),
    false,
  );
  assert.equal(
    await unconfigured.isAllowed({ userId: 'u-admin', role: OTHER_ROLE_ID, isAdmin: true }),
    false,
  );
});

test('QA-2.3 caché: el rol de directus_users se reutiliza 30 s', async () => {
  let now = 1_000;
  const { pool, queries } = fakePool(APP_ROLE_ID);
  const policy = createRolePolicy({
    pool,
    appRoleId: APP_ROLE_ID,
    cacheTtlMs: 30_000,
    now: () => now,
  });
  const user = { userId: 'u-cache', role: null, isAdmin: false };

  assert.equal(await policy.isAllowed(user), true);
  assert.equal(queries.length, 1);

  now += 29_999;
  assert.equal(await policy.isAllowed(user), true);
  assert.equal(queries.length, 1);

  now += 2;
  assert.equal(await policy.isAllowed(user), true);
  assert.equal(queries.length, 2);
});

test('QA-2.3 fail-closed HTTP: sin APP_ROLE_ID responde 503 incluso con rol válido', async () => {
  const { app } = makeApp({ role: APP_ROLE_ID, appRoleId: null });
  const { server, baseUrl } = await listen(app);
  try {
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${TOKEN_APP_USER}` },
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, 'role_guard_unconfigured');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function socketGuard(role: string | null, appRoleId: string | null = APP_ROLE_ID) {
  const rejects: string[] = [];
  const guard = createSocketAuthGuard({
    directusSecret: SECRET,
    policy: createRolePolicy({ pool: fakePool(role).pool, appRoleId }),
    onReject: (code) => rejects.push(code),
  });
  return { guard, rejects };
}

async function handshake(
  guard: ReturnType<typeof socketGuard>['guard'],
  token?: string,
): Promise<{ error?: Error; user?: AuthedUser }> {
  const socket = {
    handshake: { auth: token === undefined ? {} : { token } },
    data: {} as { user?: AuthedUser },
  };
  let error: Error | undefined;
  await guard(socket, (err) => { error = err; });
  return { error, user: socket.data.user };
}

test('QA-2.3 socket: handshake sin token/rol se rechaza y App User/admin pasan', async () => {
  const noRole = socketGuard(null);
  const noToken = await handshake(noRole.guard);
  assert.equal(noToken.error?.message, 'UNAUTHORIZED');

  const missingRole = await handshake(noRole.guard, TOKEN_NO_ROLE);
  assert.equal(missingRole.error?.message, 'FORBIDDEN');
  assert.deepEqual(noRole.rejects, ['UNAUTHORIZED', 'FORBIDDEN']);

  const appUser = socketGuard(APP_ROLE_ID);
  const allowed = await handshake(appUser.guard, TOKEN_APP_USER);
  assert.equal(allowed.error, undefined);
  assert.ok(allowed.user);

  const admin = socketGuard(null);
  const adminAllowed = await handshake(admin.guard, TOKEN_ADMIN);
  assert.equal(adminAllowed.error, undefined);

  const unconfigured = socketGuard(APP_ROLE_ID, null);
  const closed = await handshake(unconfigured.guard, TOKEN_APP_USER);
  assert.equal(closed.error?.message, 'FORBIDDEN');
  assert.deepEqual(unconfigured.rejects, ['ROLE_GUARD_UNCONFIGURED']);
});

test('S1 requireAdmin: exige usuario y isAdmin, nunca rol App User', () => {
  type Result = { status?: number; body?: unknown; next: boolean };
  function run(user?: AuthedUser): Result {
    const result: Result = { next: false };
    const req = { user } as AuthedRequest;
    const res = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      },
    };
    requireAdmin(req, res as never, () => {
      result.next = true;
    });
    return result;
  }

  assert.deepEqual(run(), { status: 401, body: { error: 'unauthorized' }, next: false });
  assert.deepEqual(
    run({ userId: 'app', role: APP_ROLE_ID, isAdmin: false }),
    { status: 403, body: { error: 'forbidden' }, next: false },
  );
  assert.deepEqual(
    run({ userId: 'admin', role: OTHER_ROLE_ID, isAdmin: true }),
    { next: true },
  );
});
