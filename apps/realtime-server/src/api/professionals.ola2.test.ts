import { before, after } from 'node:test';
import { DATABASE_URL, SECRET, maybe } from '../infra.js';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createProfessionalsRouter } from './professionals.js';
import { errorHandler } from './http.js';

// Ola 2b: perfil público, servicios y documentos solo por BFF. Contra el
// Postgres local; crea sus usuarios y profesionales temporales y limpia al final.
let proId: number;

let pool: pg.Pool;
let server: Server;
let baseUrl: string;
let proUser: string;
let clientUser: string;
let pro2Id: number;
let pro2User: string;
const portfolioFiles: string[] = [];

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
  const stamp = Date.now();
  const pro = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, email, first_name)
     VALUES (gen_random_uuid(), $1, 'Pro Ola2') RETURNING id`,
    [`pro.ola2-${stamp}@lookify.app`],
  );
  proUser = pro.rows[0].id;
  const proRow = await pool.query<{ id: number }>(
    `INSERT INTO beauty_professionals ("user", display_name, verification_status, is_online, activated_at)
     VALUES ($1, 'Pro Ola2', 'verified', false, NOW()) RETURNING id`,
    [proUser],
  );
  proId = proRow.rows[0].id;
  await pool.query('INSERT INTO professional_services (professional_id, service_id) VALUES ($1, 4)', [
    proId,
  ]);

  const client = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, email, first_name)
     VALUES (gen_random_uuid(), $1, 'Cliente Ola2') RETURNING id`,
    [`client.ola2-${stamp}@lookify.app`],
  );
  clientUser = client.rows[0].id;

  const temp = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, email, first_name)
     VALUES (gen_random_uuid(), $1, 'Pro Dos')
     RETURNING id`,
    [`pro2.ola2b-${stamp}@lookify.app`],
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
  await pool.query('DELETE FROM professional_services WHERE professional_id = ANY($1::int[])', [
    [proId, pro2Id],
  ]);
  await pool.query('DELETE FROM professional_documents WHERE professional = ANY($1::int[])', [
    [proId, pro2Id],
  ]);
  await pool.query('DELETE FROM beauty_professionals WHERE id = ANY($1::int[])', [
    [proId, pro2Id],
  ]);
  if (portfolioFiles.length) {
    await pool.query('DELETE FROM directus_files WHERE id = ANY($1::uuid[])', [portfolioFiles]);
  }
  await pool.query('DELETE FROM directus_users WHERE id = ANY($1::uuid[])', [
    [proUser, clientUser, pro2User],
  ]);
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
  const r = await api('GET', `/api/professionals/${proId}/public`, clientUser);
  assert.equal(r.status, 200);
  assert.ok(r.json.data.displayName);
  assert.ok(Array.isArray(r.json.data.services));
  const body = JSON.stringify(r.json);
  assert.equal(body.includes('@'), false);
  assert.equal(body.includes('"user"'), false);
  assert.equal(body.includes('phone'), false);
});

maybe('GET /me/earnings suma solo completed y aplica COMMISSION_RATE', async () => {
  const previous = process.env.COMMISSION_RATE;
  process.env.COMMISSION_RATE = '0.2';
  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO bookings (client, professional, service, status, price_snapshot, created_at, completed_at)
     VALUES ($1, $2, 4, 'completed', 10000, NOW(), NOW()),
            ($1, $2, 4, 'completed', 5000, NOW(), NOW()),
            ($1, $2, 4, 'cancelled', 9999, NOW(), NULL)
     RETURNING id`,
    [clientUser, proId],
  );
  try {
    const r = await api('GET', '/api/professionals/me/earnings', proUser);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.data, {
      commissionRate: 0.2,
      grossCop: 15000,
      commissionCop: 3000,
      netCop: 12000,
      completedBookings: 2,
    });
  } finally {
    await pool.query('DELETE FROM bookings WHERE id = ANY($1::int[])', [
      inserted.rows.map((row) => row.id),
    ]);
    if (previous === undefined) delete process.env.COMMISSION_RATE;
    else process.env.COMMISSION_RATE = previous;
  }
});

maybe('GET /me/earnings sin reservas devuelve ceros y comisión por defecto', async () => {
  const previous = process.env.COMMISSION_RATE;
  process.env.COMMISSION_RATE = '';
  try {
    const r = await api('GET', '/api/professionals/me/earnings', proUser);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.data, {
      commissionRate: 0.15,
      grossCop: 0,
      commissionCop: 0,
      netCop: 0,
      completedBookings: 0,
    });
  } finally {
    if (previous === undefined) delete process.env.COMMISSION_RATE;
    else process.env.COMMISSION_RATE = previous;
  }
});

async function fixtureFile(owner: string, type: string, filename: string): Promise<string> {
  const row = await pool.query<{ id: string }>(
    `INSERT INTO directus_files (id, storage, filename_download, type, filesize, uploaded_by, description)
     VALUES (gen_random_uuid(), 'local', $1, $2, 16, $3, 'lookify:portfolio')
     RETURNING id`,
    [filename, type, owner],
  );
  portfolioFiles.push(row.rows[0].id);
  return row.rows[0].id;
}

maybe('portafolio: alta, edición, portada, orden, reemplazo y borrado', async () => {
  const photo1 = await fixtureFile(proUser, 'image/png', 'p1.png');
  const photo2 = await fixtureFile(proUser, 'image/png', 'p2.png');
  const video1 = await fixtureFile(proUser, 'video/mp4', 'v1.mp4');
  const video2 = await fixtureFile(proUser, 'video/mp4', 'v2.mp4');

  const item1 = await api('POST', '/api/professionals/me/portfolio', proUser, {
    file: photo1,
    kind: 'photo',
  });
  assert.equal(item1.status, 201);
  const item2 = await api('POST', '/api/professionals/me/portfolio', proUser, {
    file: photo2,
    kind: 'photo',
  });
  assert.equal(item2.status, 201);
  const videoItem = await api('POST', '/api/professionals/me/portfolio', proUser, {
    file: video1,
    kind: 'video',
    durationSec: 10,
  });
  assert.equal(videoItem.status, 201);
  assert.equal(videoItem.json.data.kind, 'video');

  const list = await api('GET', '/api/professionals/me/portfolio', proUser);
  assert.equal(list.status, 200);
  assert.equal(list.json.data.length, 3);

  const patch = await api(
    'PATCH',
    `/api/professionals/me/portfolio/${item2.json.data.id}`,
    proUser,
    { caption: 'Portada', serviceId: 4 },
  );
  assert.equal(patch.status, 200);
  assert.equal(patch.json.data.caption, 'Portada');
  assert.equal(patch.json.data.serviceId, 4);

  const cover = await api(
    'POST',
    `/api/professionals/me/portfolio/${item2.json.data.id}/cover`,
    proUser,
  );
  assert.equal(cover.status, 200);
  assert.equal(cover.json.data.filter((i: any) => i.kind === 'photo')[0].id, item2.json.data.id);

  const move = await api(
    'POST',
    `/api/professionals/me/portfolio/${item1.json.data.id}/move`,
    proUser,
    { direction: 'up' },
  );
  assert.equal(move.status, 200);
  assert.equal(move.json.data.filter((i: any) => i.kind === 'photo')[0].id, item1.json.data.id);

  const replace = await api(
    'PUT',
    `/api/professionals/me/portfolio/${videoItem.json.data.id}/file`,
    proUser,
    { file: video2, durationSec: 20 },
  );
  assert.equal(replace.status, 200);
  assert.equal(replace.json.data.file, video2);
  assert.equal(replace.json.data.durationSec, 20);

  const ajeno = await api('POST', '/api/professionals/me/portfolio', pro2User, {
    file: photo1,
    kind: 'photo',
  });
  assert.equal(ajeno.status, 400);

  const del = await api(
    'DELETE',
    `/api/professionals/me/portfolio/${item1.json.data.id}`,
    proUser,
  );
  assert.equal(del.status, 204);

  const finalList = await api('GET', '/api/professionals/me/portfolio', proUser);
  assert.equal(finalList.json.data.length, 2);

  const publicList = await api('GET', `/api/professionals/${proId}/portfolio`, clientUser);
  assert.equal(publicList.status, 200);
  assert.equal(publicList.json.data.length, 2);
});
