import { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { DATABASE_URL, SECRET, maybe } from '../infra.js';
import { createRegisterRouter } from './register.js';
import { errorHandler } from './http.js';

const APP_ROLE_ID = process.env.APP_ROLE_ID;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

let pool: pg.Pool;
let server: Server;
let baseUrl: string;
const createdEmails: string[] = [];

function emailFor(label: string): string {
  return `qa-register-${label}-${randomUUID()}@lookify.app`;
}

async function post(base: string, body: unknown) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  if (!APP_ROLE_ID) throw new Error('Falta APP_ROLE_ID para register.test.ts');
  if (!DIRECTUS_TOKEN) throw new Error('Falta DIRECTUS_TOKEN para register.test.ts');
  pool = new pg.Pool({ connectionString: DATABASE_URL });

  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use(
    '/api/auth',
    createRegisterRouter({ appRoleId: APP_ROLE_ID, maxPerWindow: 1000, windowMs: 60_000 }),
  );
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  if (createdEmails.length) {
    await pool.query('DELETE FROM directus_users WHERE email = ANY($1::text[])', [createdEmails]);
  }
  await pool.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

maybe('rechaza campos de escalada (role, policies, token)', async () => {
  for (const extra of [
    { role: 'e6462f5f-6502-4c53-a24b-04fb76146d99' },
    { policies: ['26082c46-3e61-412f-9ec6-d78037a5b8dd'] },
    { token: 'abc' },
  ]) {
    const email = emailFor('extra');
    const r = await post(baseUrl, {
      email,
      password: 'Password123!',
      firstName: 'QA',
      ...extra,
    });
    assert.equal(r.status, 400);
    assert.equal(r.json?.error, 'invalid_body');
    const user = await pool.query('SELECT 1 FROM directus_users WHERE email = $1', [email]);
    assert.equal(user.rowCount, 0);
  }
});

maybe('crea usuario con rol del servidor y rechaza email duplicado', async () => {
  const email = emailFor('ok');
  createdEmails.push(email);
  const r = await post(baseUrl, {
    email,
    password: 'Password123!',
    firstName: 'QA Register',
  });
  assert.equal(r.status, 201);
  assert.equal(r.json?.data?.email, email);
  assert.equal(r.json?.data?.firstName, 'QA Register');

  const user = await pool.query<{ role: string; status: string }>(
    'SELECT role, status FROM directus_users WHERE email = $1',
    [email],
  );
  assert.equal(user.rows[0]?.role, APP_ROLE_ID);
  assert.equal(user.rows[0]?.status, 'active');

  const duplicate = await post(baseUrl, {
    email,
    password: 'Password123!',
    firstName: 'QA Register',
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json?.error, 'email_duplicate');
});

maybe('rate limit propio responde 429', async () => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/auth',
    createRegisterRouter({ appRoleId: APP_ROLE_ID, maxPerWindow: 2, windowMs: 60_000 }),
  );
  app.use(errorHandler);
  const limited = createServer(app);
  await new Promise<void>((resolve) => limited.listen(0, resolve));
  const addr = limited.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await post(base, {})).status, 400);
    assert.equal((await post(base, {})).status, 400);
    const third = await post(base, {});
    assert.equal(third.status, 429);
    assert.equal(third.json?.error, 'rate_limited');
  } finally {
    await new Promise<void>((resolve) => limited.close(() => resolve()));
  }
});
