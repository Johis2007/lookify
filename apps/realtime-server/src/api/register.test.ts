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
const CONSENTS = {
  terms: { version: 'terms-qa-v1' },
  privacy: { version: 'privacy-qa-v1' },
};

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
    createRegisterRouter({
      appRoleId: APP_ROLE_ID,
      maxPerWindow: 1000,
      windowMs: 60_000,
      pool,
    }),
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
    consents: CONSENTS,
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

  const consents = await pool.query<{
    document: string;
    version: string;
    accepted_at: Date;
    ip: string | null;
    user_agent: string | null;
  }>(
    `SELECT c.document, c.version, c.accepted_at, c.ip, c.user_agent
       FROM legal_consents c
       JOIN directus_users u ON u.id = c.user_id
      WHERE u.email = $1
      ORDER BY c.document`,
    [email],
  );
  assert.deepEqual(
    consents.rows.map((row) => [row.document, row.version]),
    [
      ['privacy', CONSENTS.privacy.version],
      ['terms', CONSENTS.terms.version],
    ],
  );
  assert.ok(consents.rows.every((row) => row.accepted_at instanceof Date && row.ip));

  const duplicate = await post(baseUrl, {
    email,
    password: 'Password123!',
    firstName: 'QA Register',
    consents: CONSENTS,
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json?.error, 'email_duplicate');
});

maybe('rechaza registro sin consentimientos y no crea usuario', async () => {
  const email = emailFor('sin-consentimientos');
  const r = await post(baseUrl, {
    email,
    password: 'Password123!',
    firstName: 'QA Sin Consentimientos',
  });
  assert.equal(r.status, 400);
  assert.equal(r.json?.error, 'invalid_body');
  const user = await pool.query('SELECT 1 FROM directus_users WHERE email = $1', [email]);
  assert.equal(user.rowCount, 0);
});

maybe('rechaza documento ya registrado ANTES de crear el usuario', async () => {
  const ownerEmail = `qa-identity-owner-${randomUUID()}@lookify.app`;
  const documentNumber = `DOC${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, email, first_name, status)
     VALUES (gen_random_uuid(), $1, 'QA Identity', 'active') RETURNING id`,
    [ownerEmail],
  );
  const ownerId = owner.rows[0].id;
  await pool.query(
    `INSERT INTO client_profiles ("user", display_name, document_type, document_number, nationality, birth_date)
     VALUES ($1, 'QA Identity', 'CC', $2, 'Colombiana', '1990-01-01')`,
    [ownerId, documentNumber],
  );

  try {
    // Mismo documento que ya existe en client_profiles → 409 y SIN usuario nuevo.
    const email = emailFor('documento-duplicado');
    const duplicate = await post(baseUrl, {
      email,
      password: 'Password123!',
      firstName: 'QA Documento',
      consents: CONSENTS,
      documentType: 'CC',
      documentNumber,
      nationality: 'Colombiana',
      birthDate: '1992-05-05',
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.json?.error, 'document_duplicate');
    const created = await pool.query('SELECT 1 FROM directus_users WHERE email = $1', [email]);
    assert.equal(created.rowCount, 0);

    // Documento distinto → el registro sigue funcionando.
    const okEmail = emailFor('documento-ok');
    createdEmails.push(okEmail);
    const ok = await post(baseUrl, {
      email: okEmail,
      password: 'Password123!',
      firstName: 'QA Documento Ok',
      consents: CONSENTS,
      documentType: 'Pasaporte',
      documentNumber: `P${documentNumber}`.slice(0, 40),
      nationality: 'Colombiana',
      birthDate: '1992-05-05',
    });
    assert.equal(ok.status, 201);
  } finally {
    await pool.query('DELETE FROM client_profiles WHERE "user" = $1', [ownerId]);
    await pool.query('DELETE FROM directus_users WHERE id = $1', [ownerId]);
  }
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
