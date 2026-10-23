import { before, after } from 'node:test';
import { DATABASE_URL, SECRET, maybe } from '../infra.js';
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
// Pro a ~4,5 km: entra solo en la ronda 2 (radio 6 km), no en la ronda 1
// (radio 3 km). Sirve para probar el avance de rondas.
let midProUser: string;
let midProId: number;
let serviceId: number;
let pendingBookingId: number;

// Eventos emitidos por el router (para comprobar que no se duplican).
const emitted: {
  offer: { bookingId: number; professionalId: number }[];
  taken: { bookingId: number; professionalId: number }[];
  expired: number[];
  status: { bookingId: number; status: string }[];
} = { offer: [], taken: [], expired: [], status: [] };

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
      emitStatus: (bookingId, status) => {
        emitted.status.push({ bookingId, status });
      },
      emitOffer: (bookingId, professionalId) => {
        emitted.offer.push({ bookingId, professionalId });
      },
      emitTaken: (bookingId, professionalId) => {
        emitted.taken.push({ bookingId, professionalId });
      },
      emitExpired: (bookingId) => {
        emitted.expired.push(bookingId);
      },
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
    `INSERT INTO beauty_professionals ("user", display_name, verification_status, is_online, rating_avg)
     VALUES ($1, 'Test Pro', 'verified', false, 4.7) RETURNING id`,
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
  // Pro intermedio a ~4,5 km (solo entra en la ronda 2).
  const mu = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, first_name, email, status)
     VALUES (gen_random_uuid(), 'Test Pro Mid', 'test-pro-mid@lookify.app', 'active') RETURNING id`,
  );
  midProUser = mu.rows[0].id;
  const mp = await pool.query<{ id: number }>(
    `INSERT INTO beauty_professionals ("user", display_name, verification_status, is_online, rating_avg)
     VALUES ($1, 'Test Pro Mid', 'verified', false, 4.8) RETURNING id`,
    [midProUser],
  );
  midProId = mp.rows[0].id;
  const s = await pool.query<{ id: number }>(
    `INSERT INTO beauty_services (name, price_base, duration_min, is_active)
     VALUES ('Test Service', 42000, 40, true) RETURNING id`,
  );
  serviceId = s.rows[0].id;
  // El pro debe ofrecer el servicio para poder asignársele reservas.
  await pool.query(
    `INSERT INTO professional_services (professional_id, service_id) VALUES ($1, $2), ($3, $2), ($4, $2)`,
    [proId, serviceId, foreignProId, midProId],
  );
  // Ubicaciones para el modelo "claim" (cerca del punto de prueba 4.7,-74.0;
  // el intermedio ~4,5 km entra solo en la ronda 2; el lejano ~11 km queda
  // fuera de ambos radios).
  await pool.query(
    `INSERT INTO professional_locations (professional_id, geom, updated_at)
     VALUES ($1, ST_SetSRID(ST_MakePoint(-74.0, 4.7),4326), NOW()),
            ($2, ST_SetSRID(ST_MakePoint(-73.9, 4.7),4326), NOW()),
            ($3, ST_SetSRID(ST_MakePoint(-73.9594, 4.7),4326), NOW())
     ON CONFLICT (professional_id) DO UPDATE SET geom = EXCLUDED.geom, updated_at = NOW()`,
    [proId, foreignProId, midProId],
  );
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await pool.query('DELETE FROM booking_events WHERE booking IN (SELECT id FROM bookings WHERE client = ANY($1))', [[clientA, clientB]]);
  await pool.query('DELETE FROM booking_candidates WHERE booking_id IN (SELECT id FROM bookings WHERE client = ANY($1))', [[clientA, clientB]]);
  await pool.query('DELETE FROM bookings WHERE client = ANY($1)', [[clientA, clientB]]);
  await pool.query('DELETE FROM professional_locations WHERE professional_id = ANY($1)', [[proId, foreignProId, midProId]]);
  await pool.query('DELETE FROM professional_services WHERE service_id = $1', [serviceId]);
  await pool.query('DELETE FROM beauty_services WHERE id = $1', [serviceId]);
  await pool.query('DELETE FROM beauty_professionals WHERE id = ANY($1)', [[proId, foreignProId, midProId]]);
  await pool.query('DELETE FROM directus_users WHERE id = ANY($1)', [[clientA, clientB, proUser, foreignProUser, midProUser]]);
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

// ---------------------------------------------------------------------------
// Modelo "claim": reservas sin profesional asignado.
// ---------------------------------------------------------------------------

async function makeClaimBooking(lat = 4.7, lng = -74.0): Promise<number> {
  // Sin professionalId -> claim. Los pros cercanos están online para ser
  // candidatos (el intermedio solo entra en la ronda 2).
  await pool.query(
    `UPDATE beauty_professionals SET is_online = true WHERE id = ANY($1)`,
    [[proId, midProId]],
  );
  const res = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle Claim',
    lat,
    lng,
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.status, 'pending');
  assert.equal(res.json.data.professionalId, null);
  return res.json.data.id as number;
}

maybe('claim: el pro cercano recibe la oferta (candidato ronda 1)', async () => {
  const bid = await makeClaimBooking();
  const cand = await pool.query<{ professional_id: number; round: number }>(
    `SELECT professional_id, round FROM booking_candidates WHERE booking_id = $1`,
    [bid],
  );
  const ids = cand.rows.map((r) => Number(r.professional_id));
  assert.ok(ids.includes(proId), 'el pro cercano es candidato');
  assert.ok(!ids.includes(foreignProId), 'el pro a 20 km no está en radio 3 km');
  assert.equal(Number(cand.rows[0].round), 1);
});

maybe('claim: GET /pro/available muestra la oferta y oculta la dirección exacta', async () => {
  const bid = await makeClaimBooking();
  const res = await api('GET', '/api/bookings/pro/available', proUser);
  assert.equal(res.status, 200);
  const offer = res.json.data.find((o: any) => o.id === String(bid));
  assert.ok(offer, 'la oferta aparece');
  assert.equal(offer.direccion, undefined, 'sin dirección exacta antes de aceptar');
  assert.equal(offer.telefono, undefined, 'sin teléfono antes de aceptar');
  assert.ok(offer.zona && typeof offer.zona.lat === 'number', 'zona aproximada presente');
  assert.equal(offer.clientePrimerNombre, 'Test');
});

maybe('claim: el primero en aceptar gana; el otro recibe 409', async () => {
  const bid = await makeClaimBooking();
  // Pro 2 no está en la oferta (fuera de radio) ni es elegible por oferta.
  const outsider = await api('POST', `/api/bookings/${bid}/accept`, foreignProUser);
  assert.equal(outsider.status, 409);
  const win = await api('POST', `/api/bookings/${bid}/accept`, proUser);
  assert.equal(win.status, 200);
  assert.equal(win.json.data.status, 'accepted');
  assert.equal(win.json.data.professionalId, proId);
  const again = await api('POST', `/api/bookings/${bid}/accept`, proUser);
  assert.equal(again.status, 409);
});

maybe('claim: tras aceptar, la oferta desaparece de /pro/available', async () => {
  const bid = await makeClaimBooking();
  await api('POST', `/api/bookings/${bid}/accept`, proUser);
  const res = await api('GET', '/api/bookings/pro/available', proUser);
  assert.ok(!res.json.data.some((o: any) => o.id === String(bid)), 'ya no está disponible');
});

maybe('claim: rechazar solo quita la oferta (reserva sigue pending)', async () => {
  const bid = await makeClaimBooking();
  const rej = await api('POST', `/api/bookings/${bid}/reject`, proUser);
  assert.equal(rej.status, 200);
  const ev = await pool.query<{ status: string }>(`SELECT status FROM bookings WHERE id = $1`, [bid]);
  assert.equal(ev.rows[0].status, 'pending');
  const cand = await pool.query<{ status: string }>(
    `SELECT status FROM booking_candidates WHERE booking_id = $1 AND professional_id = $2`,
    [bid, proId],
  );
  assert.equal(cand.rows[0].status, 'declined');
});

maybe('claim: pro no verificado no puede aceptar aunque sea candidato', async () => {
  const bid = await makeClaimBooking();
  await pool.query(`UPDATE beauty_professionals SET verification_status = 'pending' WHERE id = $1`, [proId]);
  const res = await api('POST', `/api/bookings/${bid}/accept`, proUser);
  assert.equal(res.status, 403);
  await pool.query(`UPDATE beauty_professionals SET verification_status = 'verified' WHERE id = $1`, [proId]);
});

maybe('claim: no participante no ve la reserva ni la acepta (404)', async () => {
  const bid = await makeClaimBooking();
  const view = await api('GET', `/api/bookings/${bid}`, clientB);
  assert.equal(view.status, 404);
  const acc = await api('POST', `/api/bookings/${bid}/accept`, clientB);
  assert.equal(acc.status, 404);
});

maybe('claim: el barrido amplía a 6 km y expira tras dos rondas', async () => {
  const { sweepMatching } = await import('../matching.js');
  const bid = await makeClaimBooking();
  // Vencer la ronda 1.
  await pool.query(`UPDATE bookings SET expires_at = NOW() - interval '1 second' WHERE id = $1`, [bid]);
  const n1 = await sweepMatching({ pool, emitOffer: () => {}, emitExpired: () => {} });
  assert.ok(n1 >= 1);
  const r2 = await pool.query<{ match_round: number; status: string }>(
    `SELECT match_round, status FROM bookings WHERE id = $1`,
    [bid],
  );
  assert.equal(r2.rows[0].match_round, 2);
  assert.equal(r2.rows[0].status, 'pending');
  // La ronda 2 ofrece al pro de ~4,5 km (en la ronda 1 quedaba fuera de radio).
  const cand2 = await pool.query<{ professional_id: number }>(
    `SELECT professional_id FROM booking_candidates WHERE booking_id = $1 AND round = 2`,
    [bid],
  );
  assert.deepEqual(cand2.rows.map((r) => Number(r.professional_id)), [midProId]);
  // No se re-ofrece al pro de la ronda 1 y el lejano (~11 km) sigue fuera.
  const all = await pool.query<{ professional_id: number; round: number }>(
    `SELECT professional_id, round FROM booking_candidates WHERE booking_id = $1`,
    [bid],
  );
  assert.ok(!all.rows.some((r) => Number(r.professional_id) === foreignProId));
  assert.equal(all.rows.filter((r) => Number(r.professional_id) === proId).length, 1);
  // Vencer la ronda 2 -> expired.
  await pool.query(`UPDATE bookings SET expires_at = NOW() - interval '1 second' WHERE id = $1`, [bid]);
  await sweepMatching({ pool, emitOffer: () => {}, emitExpired: () => {} });
  const r3 = await pool.query<{ status: string }>(`SELECT status FROM bookings WHERE id = $1`, [bid]);
  assert.equal(r3.rows[0].status, 'expired');
  const ev = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM booking_events WHERE booking = $1 AND status = 'expired'`,
    [bid],
  );
  assert.equal(ev.rows[0].count, '1');
});

// ---------------------------------------------------------------------------
// 4A-bis: rondas atómicas, avance temprano y ficha pública.
// ---------------------------------------------------------------------------

maybe('4A-bis: dos barridos simultáneos procesan la reserva una sola vez', async () => {
  const { sweepMatching } = await import('../matching.js');
  const bid = await makeClaimBooking();
  await pool.query(`UPDATE bookings SET expires_at = NOW() - interval '1 second' WHERE id = $1`, [bid]);
  const offers: number[] = [];
  const expired: number[] = [];
  const deps = () => ({
    pool,
    emitOffer: (_bookingId: number, professionalId: number) => {
      offers.push(professionalId);
    },
    emitExpired: (bookingId: number) => {
      expired.push(bookingId);
    },
  });
  await Promise.all([sweepMatching(deps()), sweepMatching(deps())]);
  // La oferta de la ronda 2 se anuncia UNA sola vez (no duplicada).
  assert.equal(offers.filter((p) => p === midProId).length, 1, 'oferta emitida una sola vez');
  assert.equal(expired.length, 0, 'no expira (tiene candidatos en la ronda 2)');
  // Y en la base queda una sola fila de candidato para la ronda 2.
  const rows = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM booking_candidates WHERE booking_id = $1 AND round = 2`,
    [bid],
  );
  assert.equal(rows.rows[0].n, '1');
  const b = await pool.query<{ match_round: number; status: string }>(
    `SELECT match_round, status FROM bookings WHERE id = $1`,
    [bid],
  );
  assert.equal(b.rows[0].match_round, 2);
  assert.equal(b.rows[0].status, 'pending');
});

maybe('4A-bis: sin candidatos en la ronda 1 se pasa de inmediato a la ronda 2', async () => {
  // Punto a ~5 km del pro cercano: fuera del radio de la ronda 1 (3 km) y
  // dentro del de la ronda 2 (6 km). No se espera al TTL.
  const res = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle Ronda 2',
    lat: 4.7,
    lng: -74.045,
  });
  assert.equal(res.status, 201);
  const bid = res.json.data.id;
  const b = await pool.query<{ match_round: number; status: string }>(
    `SELECT match_round, status FROM bookings WHERE id = $1`,
    [bid],
  );
  assert.equal(b.rows[0].match_round, 2, 'pasa de inmediato a la ronda 2');
  assert.equal(b.rows[0].status, 'pending');
  const cand = await pool.query<{ professional_id: number; round: number }>(
    `SELECT professional_id, round FROM booking_candidates WHERE booking_id = $1`,
    [bid],
  );
  assert.deepEqual(cand.rows.map((r) => Number(r.professional_id)), [proId]);
  assert.ok(cand.rows.every((r) => Number(r.round) === 2), 'sin ofertas en la ronda 1');
});

maybe('4A-bis: si todos los candidatos rechazan, se avanza de inmediato', async () => {
  const bid = await makeClaimBooking();
  const rej = await api('POST', `/api/bookings/${bid}/reject`, proUser);
  assert.equal(rej.status, 200);
  const b = await pool.query<{ match_round: number; status: string }>(
    `SELECT match_round, status FROM bookings WHERE id = $1`,
    [bid],
  );
  assert.equal(b.rows[0].match_round, 2, 'avanza de inmediato a la ronda 2');
  assert.equal(b.rows[0].status, 'pending');
  const cand = await pool.query<{ professional_id: number }>(
    `SELECT professional_id FROM booking_candidates WHERE booking_id = $1 AND round = 2`,
    [bid],
  );
  assert.deepEqual(cand.rows.map((r) => Number(r.professional_id)), [midProId]);
});

maybe('4A-bis: sin candidatos en ninguna ronda la reserva expira de inmediato', async () => {
  const res = await api('POST', '/api/bookings', clientA, {
    serviceId,
    addressText: 'Calle Lejos',
    lat: 5.5,
    lng: -75.0,
  });
  assert.equal(res.status, 201);
  const bid = res.json.data.id;
  assert.equal(res.json.data.status, 'expired', 'la respuesta ya refleja la expiración');
  const b = await pool.query<{ status: string }>(`SELECT status FROM bookings WHERE id = $1`, [bid]);
  assert.equal(b.rows[0].status, 'expired');
  const ev = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM booking_events WHERE booking = $1 AND status = 'expired'`,
    [bid],
  );
  assert.equal(ev.rows[0].n, '1', 'un único evento expired');
});

maybe('4A-bis: el cliente cancela una reserva sin asignar y cierra las ofertas', async () => {
  const bid = await makeClaimBooking();
  const takenBefore = emitted.taken.length;
  const res = await api('POST', `/api/bookings/${bid}/cancel`, clientA);
  assert.equal(res.status, 200);
  assert.equal(res.json.data.status, 'cancelled');
  const b = await pool.query<{ status: string }>(`SELECT status FROM bookings WHERE id = $1`, [bid]);
  assert.equal(b.rows[0].status, 'cancelled');
  const cand = await pool.query<{ status: string }>(
    `SELECT status FROM booking_candidates WHERE booking_id = $1 AND professional_id = $2`,
    [bid, proId],
  );
  assert.equal(cand.rows[0].status, 'declined', 'la oferta queda cerrada');
  const ev = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM booking_events WHERE booking = $1 AND status = 'cancelled'`,
    [bid],
  );
  assert.equal(ev.rows[0].n, '1');
  assert.ok(emitted.taken.length > takenBefore, 'se avisa a los candidatos (booking:taken)');
  const avail = await api('GET', '/api/bookings/pro/available', proUser);
  assert.ok(!avail.json.data.some((o: any) => o.id === String(bid)), 'ya no está disponible');
});

maybe('4A-bis: GET /:id devuelve expiresAt, matchRound y la ficha pública del profesional', async () => {
  const bid = await makeClaimBooking();
  const pending = await api('GET', `/api/bookings/${bid}`, clientA);
  assert.equal(pending.status, 200);
  assert.ok(pending.json.data.expiresAt, 'expiresAt presente mientras busca');
  assert.equal(pending.json.data.matchRound, 1);
  assert.equal(pending.json.data.professionalPublic, null, 'sin ficha pública todavía');
  await api('POST', `/api/bookings/${bid}/accept`, proUser);
  const accepted = await api('GET', `/api/bookings/${bid}`, clientA);
  assert.equal(accepted.status, 200);
  const pub = accepted.json.data.professionalPublic;
  assert.ok(pub, 'ficha pública del profesional');
  assert.equal(pub.id, proId);
  assert.equal(pub.displayName, 'Test Pro');
  assert.equal(typeof pub.rating, 'number');
  assert.equal(pub.phone, undefined, 'sin teléfono');
  assert.equal(pub.email, undefined, 'sin email');
  assert.ok(!JSON.stringify(accepted.json.data).includes('@lookify.app'), 'sin datos de contacto');
  assert.equal(accepted.json.data.expiresAt, null, 'sin vencimiento tras aceptar');
});

maybe('4A-bis: la distancia de la oferta se redondea a múltiplos de 100 m', async () => {
  const bid = await makeClaimBooking(4.7, -74.045);
  const res = await api('GET', '/api/bookings/pro/available', proUser);
  assert.equal(res.status, 200);
  const offer = res.json.data.find((o: any) => o.id === String(bid));
  assert.ok(offer, 'la oferta aparece');
  assert.equal(offer.distanciaM % 100, 0, 'distancia redondeada a 100 m');
  assert.ok(offer.distanciaM >= 4000 && offer.distanciaM <= 6000, 'distancia coherente');
});
