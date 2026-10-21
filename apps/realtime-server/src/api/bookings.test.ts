import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createBookingsRouter } from './bookings.js';
import { errorHandler } from './http.js';

// Tests del BFF de reservas (Paso 2B). Corren contra el Postgres local real:
// crean fixtures propias y las borran al final. El JWT se firma con el mismo
// DIRECTUS_SECRET, igual que Directus. Si no hay DATABASE_URL, se saltan.
const DATABASE_URL = process.env.DATABASE_URL;
const SECRET = process.env.DIRECTUS_SECRET;

const maybe = DATABASE_URL && SECRET ? test : test.skip;

let pool: pg.Pool;
let server: Server;
let baseUrl: string;

// Fixtures
let clientA: string;
let clientB: string;
let proUser: string;
let proId: number;
let foreignProUser: string;
let foreignProId: number;
let serviceId: number;
let pendingBookingId: number;

function token(userId: string, isAdmin = false): string {
  return jwt.sign({ id: userId, role: 'app-role', admin_access: isAdmin }, SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

async function api(
  method: string,
  path: string,
  userId: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token(userId)}`,
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
  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use(
    '/api/bookings',
    createBookingsRouter({
      pool,
      emitNew: () => {},
      emitStatus: () => {},
    }),
  );
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  // Fixtures: dos clientes, un profesional verificado y un servicio activo.
  const a = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, first_name, email, status)
     VALUES (gen_random_uuid(), 'Test A', 'test-a@lookify.app', 'active') RETURNING id`,
  );
  clientA = a.rows[0].id;
  const b = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, first_name, email, status)
     VALUES (gen_random_uuid(), 'Test B', 'test-b@lookify.app', 'active') RETURNING id`,
  );
  clientB = b.rows[0].id;
  const u = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, first_name, email, status)
     VALUES (gen_random_uuid(), 'Test Pro', 'test-pro@lookify.app', 'active') RETURNING id`,
  );
  proUser = u.rows[0].id;
  const p = await pool.query<{ id: number }>(
    `INSERT INTO beauty_professionals (\"user\", display_name, verification_status, is_online)
     VALUES ($1, 'Test Pro', 'verified', false) RETURNING id`,
    [proUser],
  );
  proId = p.rows[0].id;
  const foreign = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, first_name, email, status)
     VALUES (gen_random_uuid(), 'Test Pro 2', 'test-pro2@lookify.app', 'active') RETURNING id`,
  );
  foreignProUser = foreign.rows[0].id;
  const fp = await pool.query<{ id: number }>(
    `INSERT INTO beauty_professionals (\"user\", display_name, verification_status, is_online)
     VALUES ($1, 'Test Pro 2', 'verified', false) RETURNING id`,
    [foreignProUser],
  );
  foreignProId = fp.rows[0].id;
  const s = await pool.query<{ id: number }>(
    `INSERT INTO beauty_services (name, price_base, duration_min, is_active)
     VALUES ('Test Service', 42000, 40, true) RETURNING id`,
  );
  serviceId = s.rows[0].id;
  // El pro debe ofrecer el servicio para poder asignársele reservas.
  await pool.query(
    `INSERT INTO professional_services (professional_id, service_id) VALUES ($1, $2), ($3, $2)`,
    [proId, serviceId, foreignProId],
  );
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await pool.query('DELETE FROM booking_events WHERE booking IN (SELECT id FROM bookings WHERE client = ANY($1))', [[clientA, clientB]]);
  await pool.query('DELETE FROM bookings WHERE client = ANY($1)', [[clientA, clientB]]);
  await pool.query('DELETE FROM professional_services WHERE service_id = $1', [serviceId]);
  await pool.query('DELETE FROM beauty_services WHERE id = $1', [serviceId]);
  await pool.query('DELETE FROM beauty_professionals WHERE id = ANY($1)', [[proId, foreignProId]]);
  await pool.query('DELETE FROM directus_users WHERE id = ANY($1)', [[clientA, clientB, proUser, foreignProUser]]);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

maybe('crea reserva con precio del servidor e ignora el precio enviado', async () => {
  const res = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 1',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
    // Intento de manipulación: precio bajo.
    price: 1,
    price_snapshot: 1,
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.price, 42000);
  assert.equal(res.json.data.status, 'pending');
  assert.equal(res.json.data.clientId, clientA);
  pendingBookingId = res.json.data.id;
});

maybe('el profesional acepta (pending -> accepted)', async () => {
  const res = await api('POST', `/api/bookings/${pendingBookingId}/accept`, proUser);
  assert.equal(res.status, 200);
  assert.equal(res.json.data.status, 'accepted');
});

maybe('transición inválida (start desde accepted ya no; repetir accept) -> 409', async () => {
  // accept otra vez desde 'accepted' no está permitido.
  const res = await api('POST', `/api/bookings/${pendingBookingId}/accept`, proUser);
  assert.equal(res.status, 409);
});

maybe('doble aceptación concurrente: solo una gana', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 2',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  const [r1, r2] = await Promise.all([
    api('POST', `/api/bookings/${bid}/accept`, proUser),
    api('POST', `/api/bookings/${bid}/accept`, proUser),
  ]);
  const ok = [r1, r2].filter((r) => r.status === 200).length;
  const conflict = [r1, r2].filter((r) => r.status === 409).length;
  assert.equal(ok, 1, 'exactamente una aceptación gana');
  assert.equal(conflict, 1, 'la otra recibe 409');
  // Un solo evento de 'accepted' en booking_events.
  const ev = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM booking_events WHERE booking = $1 AND status = 'accepted'`,
    [bid],
  );
  assert.equal(ev.rows[0].count, '1');
});

maybe('cliente 2 no puede ver la reserva del cliente 1 (404)', async () => {
  const res = await api('GET', `/api/bookings/${pendingBookingId}`, clientB);
  assert.equal(res.status, 404);
});

maybe('cliente 2 no puede aceptar la reserva del cliente 1 (404)', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 3',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  const res = await api('POST', `/api/bookings/${bid}/accept`, clientB);
  assert.equal(res.status, 404);
});

maybe('profesional no verificado no puede aceptar (403)', async () => {
  // Crear mientras está verificado, luego pasar a pending y rechazar el accept.
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 4',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  await pool.query(`UPDATE beauty_professionals SET verification_status = 'pending' WHERE id = $1`, [proId]);
  const res = await api('POST', `/api/bookings/${bid}/accept`, proUser);
  assert.equal(res.status, 403);
  assert.equal(res.json.error, 'professional_not_verified');
  await pool.query(`UPDATE beauty_professionals SET verification_status = 'verified' WHERE id = $1`, [proId]);
});

maybe('crear reserva con profesional no verificado -> 400', async () => {
  await pool.query(`UPDATE beauty_professionals SET verification_status = 'pending' WHERE id = $1`, [proId]);
  const res = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 5',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'professional_not_verified');
  await pool.query(`UPDATE beauty_professionals SET verification_status = 'verified' WHERE id = $1`, [proId]);
});

maybe('crear reserva con profesional que no ofrece el servicio -> 400', async () => {
  const other = await pool.query<{ id: number }>(
    `INSERT INTO beauty_services (name, price_base, duration_min, is_active)
     VALUES ('Otro servicio', 1000, 10, true) RETURNING id`,
  );
  const otherServiceId = other.rows[0].id;
  try {
    const res = await api('POST', '/api/bookings', clientA, {
      serviceId: otherServiceId, // el pro no lo ofrece
      addressText: 'Calle 6',
      lat: 4.7,
      lng: -74.0,
      professionalId: proId,
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'professional_does_not_offer_service');
  } finally {
    await pool.query('DELETE FROM beauty_services WHERE id = $1', [otherServiceId]);
  }
});

maybe('cliente no puede accept/start/complete una reserva ajena (suya) -> 403/404', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 7',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  for (const action of ['accept', 'start', 'complete']) {
    const res = await api('POST', `/api/bookings/${bid}/${action}`, clientA);
    // El cliente es dueño pero no profesional -> 404 (no es participante pro).
    assert.equal(res.status, 404, `cliente no debería poder ${action}`);
  }
});

maybe('profesional ajeno no puede accept/start/complete -> 404', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 8',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  for (const action of ['accept', 'start', 'complete']) {
    const res = await api('POST', `/api/bookings/${bid}/${action}`, foreignProUser);
    assert.equal(res.status, 404, `pro ajeno no debería poder ${action}`);
  }
});

maybe('el cliente cancela desde pending (válido)', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 9',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  const res = await api('POST', `/api/bookings/${bid}/cancel`, clientA);
  assert.equal(res.status, 200);
  assert.equal(res.json.data.status, 'cancelled');
});

maybe('no se puede cancelar una reserva completed -> 409', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 10',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  await api('POST', `/api/bookings/${bid}/accept`, proUser);
  await api('POST', `/api/bookings/${bid}/start`, proUser);
  await api('POST', `/api/bookings/${bid}/complete`, proUser);
  const res = await api('POST', `/api/bookings/${bid}/cancel`, clientA);
  assert.equal(res.status, 409);
});

maybe('sin token -> 401', async () => {
  const res = await fetch(`${baseUrl}/api/bookings/mine`);
  assert.equal(res.status, 401);
});

maybe('GET /mine solo devuelve las reservas del cliente del token', async () => {
  const res = await api('GET', '/api/bookings/mine', clientA);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.data));
  assert.ok(res.json.data.every((b: any) => b.clientId === clientA));
});

maybe('GET /pro/mine devuelve reservas del pro del token (con servicio embebido)', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 11',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const res = await api('GET', '/api/bookings/pro/mine?status=pending', proUser);
  assert.equal(res.status, 200);
  const found = res.json.data.find((b: any) => b.id === created.json.data.id);
  assert.ok(found, 'la reserva del pro debe aparecer');
  assert.equal(found.professional, proId);
  assert.equal(typeof found.service, 'object');
  assert.equal(found.service.id, serviceId);
  assert.equal(typeof found.clientFirstName, 'string');
});

maybe('GET /pro/mine no expone reservas de otro profesional', async () => {
  const res = await api('GET', '/api/bookings/pro/mine', foreignProUser);
  assert.equal(res.status, 200);
  assert.ok(res.json.data.every((b: any) => b.professional === foreignProId));
});

maybe('GET /pro/mine sin perfil profesional -> 404', async () => {
  const res = await api('GET', '/api/bookings/pro/mine', clientB);
  assert.equal(res.status, 404);
});

maybe('GET /pro/mine con status inválido -> 400', async () => {
  const res = await api('GET', '/api/bookings/pro/mine?status=lol', proUser);
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'invalid_status');
});

maybe('GET /:id/events solo para participantes (ajeno -> 404)', async () => {
  const res = await api('GET', `/api/bookings/${pendingBookingId}/events`, clientB);
  assert.equal(res.status, 404);
});

maybe('POST /:id/events registra un evento (participante pro)', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 12',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  await api('POST', `/api/bookings/${bid}/accept`, proUser);
  const res = await api('POST', `/api/bookings/${bid}/events`, proUser, {
    status: 'llegada',
    note: 'llegada:123',
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.status, 'llegada');
  assert.equal(res.json.data.note, 'llegada:123');
  // El evento es visible para el pro participante.
  const list = await api('GET', `/api/bookings/${bid}/events`, proUser);
  assert.equal(list.status, 200);
  assert.ok(list.json.data.some((e: any) => e.status === 'llegada'));
});

maybe('POST /:id/events con status no permitido -> 400', async () => {
  const res = await api('POST', `/api/bookings/${pendingBookingId}/events`, proUser, {
    status: 'hacked',
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'invalid_body');
});

maybe('POST /:id/events: el cliente solo puede escribir "nota"', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 20',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  // nota permitida para el cliente.
  const nota = await api('POST', `/api/bookings/${bid}/events`, clientA, { status: 'nota', note: 'hola' });
  assert.equal(nota.status, 201);
  // llegada NO permitida para el cliente (aunque esté accepted).
  await api('POST', `/api/bookings/${bid}/accept`, proUser);
  const llegada = await api('POST', `/api/bookings/${bid}/events`, clientA, { status: 'llegada' });
  assert.equal(llegada.status, 403);
  assert.equal(llegada.json.error, 'forbidden_event');
});

maybe('POST /:id/events: el pro escribe "llegada" solo si está accepted', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 21',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  // pending: 'llegada' no permitida todavía.
  const temprano = await api('POST', `/api/bookings/${bid}/events`, proUser, { status: 'llegada' });
  assert.equal(temprano.status, 403);
  // accepted: 'llegada' permitida.
  await api('POST', `/api/bookings/${bid}/accept`, proUser);
  const ok = await api('POST', `/api/bookings/${bid}/events`, proUser, {
    status: 'llegada',
    note: 'llegada:999',
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.data.status, 'llegada');
});

maybe('POST /:id/events: estados de servidor (iniciado/finalizado/cancelado) -> 403', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 22',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  await api('POST', `/api/bookings/${bid}/accept`, proUser);
  for (const status of ['iniciado', 'finalizado', 'cancelado_por_profesional']) {
    const res = await api('POST', `/api/bookings/${bid}/events`, proUser, { status });
    assert.equal(res.status, 403, `pro no puede escribir ${status}`);
    assert.equal(res.json.error, 'forbidden_event');
  }
});

maybe('las transiciones escriben eventos semánticos (iniciado/finalizado)', async () => {
  const created = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle 23',
    lat: 4.7,
    lng: -74.0,
    professionalId: proId,
  });
  const bid = created.json.data.id;
  await api('POST', `/api/bookings/${bid}/accept`, proUser);
  await api('POST', `/api/bookings/${bid}/start`, proUser);
  await api('POST', `/api/bookings/${bid}/complete`, proUser);
  const list = await api('GET', `/api/bookings/${bid}/events`, clientA);
  const statuses = list.json.data.map((e: any) => e.status);
  assert.ok(statuses.includes('accepted'), 'evento accepted');
  assert.ok(statuses.includes('iniciado'), 'evento iniciado (no in_progress)');
  assert.ok(statuses.includes('finalizado'), 'evento finalizado (no completed)');
  assert.ok(!statuses.includes('in_progress'), 'sin evento crudo in_progress');
  assert.ok(!statuses.includes('completed'), 'sin evento crudo completed');
});
