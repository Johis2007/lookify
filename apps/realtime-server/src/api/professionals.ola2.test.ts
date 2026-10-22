import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createProfessionalsRouter } from './professionals.js';
import { errorHandler } from './http.js';

// Ola 2b: perfil público, servicios y documentos solo por BFF. Contra el
// Postgres local; crea un segundo profesional temporal y limpia al final.
const DATABASE_URL = process.env.DATABASE_URL;
const SECRET = process.env.DIRECTUS_SECRET;
const maybe = DATABASE_URL && SECRET ? test : test.skip;
const PRO_ID = 121;

let pool: pg.Pool;
let server: Server;
let baseUrl: string;
let proUser: string;
let clientUser: string;
let pro2Id: number;
let pro2User: string;

function token(userId: string): string {
  return jwt.sign({ id: userId, role: 'app-role', admin_access: false }, SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

async function api(method: string, path: string, userId: string | null, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  const pro = await pool.query<{ user: string }>(
    'SELECT "user" FROM beauty_professionals WHERE id = $1',
    [PRO_ID],
  );
  proUser = pro.rows[0].user;
  const client = await pool.query<{ id: string }>(
    `SELECT id FROM directus_users WHERE email = 'cliente.demo@lookify.app'`,
  );
  clientUser = client.rows[0].id;

  const temp = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, email, first_name)
     VALUES (gen_random_uuid(), 'pro2.ola2b@lookify.app', 'Pro Dos')
     RETURNING id`,
  );
  pro2User = temp.rows[0].id;
  const pro2 = await pool.query<{ id: number }>(
    `INSERT INTO beauty_professionals ("user", display_name, verification_status)
     VALUES ($1, 'Pro Dos', 'pending') RETURNING id`,
    [pro2User],
  );
  pro2Id = pro2.rows[0].id;

  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use('/api/professionals', createProfessionalsRouter(pool));
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await pool.query('DELETE FROM professional_services WHERE professional_id = $1', [PRO_ID]);
  await pool.query('INSERT INTO professional_services (professional_id, service_id) VALUES ($1, 4)', [
    PRO_ID,
  ]);
  await pool.query('DELETE FROM professional_services WHERE professional_id = $1', [pro2Id]);
  await pool.query('DELETE FROM professional_documents WHERE professional = $1', [pro2Id]);
  await pool.query('DELETE FROM beauty_professionals WHERE id = $1', [pro2Id]);
  await pool.query('DELETE FROM directus_users WHERE id = $1', [pro2User]);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

maybe('GET /me/services devuelve solo los servicios del pro del token', async () => {
  const r = await api('GET', '/api/professionals/me/services', proUser);
  assert.equal(r.status, 200);
  assert.ok(r.json.data.some((s: any) => s.serviceId === 4));
  assert.ok(r.json.data.every((s: any) => typeof s.name === 'string'));
});

maybe('PUT /me/services reemplaza, valida catálogo y no toca a otro pro', async () => {
  const ok = await api('PUT', '/api/professionals/me/services', proUser, { serviceIds: [4, 5] });
  assert.equal(ok.status, 200);
  assert.deepEqual(
    ok.json.data.map((s: any) => s.serviceId).sort((a: number, b: number) => a - b),
    [4, 5],
  );

  const invalid = await api('PUT', '/api/professionals/me/services', proUser, {
    serviceIds: [4, 999999],
  });
  assert.equal(invalid.status, 400);
  const afterInvalid = await api('GET', '/api/professionals/me/services', proUser);
  assert.equal(afterInvalid.json.data.length, 2);

  const duplicado = await api('PUT', '/api/professionals/me/services', proUser, {
    serviceIds: [4, 4],
  });
  assert.equal(duplicado.status, 400);

  const otro = await api('PUT', '/api/professionals/me/services', pro2User, { serviceIds: [5] });
  assert.equal(otro.status, 200);
  const propio = await api('GET', '/api/professionals/me/services', proUser);
  assert.equal(propio.json.data.length, 2);

  await api('PUT', '/api/professionals/me/services', proUser, { serviceIds: [4] });
});

maybe('un cliente no entra a endpoints de profesional', async () => {
  for (const path of ['/api/professionals/me/services', '/api/professionals/me/documents']) {
    const r = await api('GET', path, clientUser);
    assert.equal(r.status, 404);
  }
});

maybe('documentos: archivo inexistente 400 y no se pueden editar los de otro pro', async () => {
  const invalid = await api('POST', '/api/professionals/me/documents', proUser, {
    file: '00000000-0000-4000-8000-000000000000',
  });
  assert.equal(invalid.status, 400);

  const doc = await pool.query<{ id: number }>(
    `INSERT INTO professional_documents (professional, file, doc_type, status, note)
     VALUES ($1, NULL, 'certificado', 'pending', 'fixture') RETURNING id`,
    [pro2Id],
  );
  const patch = await api('PATCH', `/api/professionals/me/documents/${doc.rows[0].id}`, proUser, {
    note: 'ajeno',
  });
  assert.equal(patch.status, 404);
  const del = await api('DELETE', `/api/professionals/me/documents/${doc.rows[0].id}`, proUser);
  assert.equal(del.status, 404);
});

maybe('perfil público no expone PII y trae servicios', async () => {
  const r = await api('GET', `/api/professionals/${PRO_ID}/public`, clientUser);
  assert.equal(r.status, 200);
  assert.ok(r.json.data.displayName);
  assert.ok(Array.isArray(r.json.data.services));
  const body = JSON.stringify(r.json);
  assert.equal(body.includes('@'), false);
  assert.equal(body.includes('"user"'), false);
  assert.equal(body.includes('phone'), false);
});
