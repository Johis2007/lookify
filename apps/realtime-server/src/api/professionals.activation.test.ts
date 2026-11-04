import { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { DATABASE_URL, SECRET, maybe } from '../infra.js';
import type { MailMessage } from '../mailer.js';
import { createProfessionalsRouter } from './professionals.js';
import { errorHandler } from './http.js';

let pool: pg.Pool;
let server: Server;
let baseUrl: string;
const proUserIds: string[] = [];
const proIds: number[] = [];
const mails: MailMessage[] = [];

const adminUser = '00000000-0000-4000-8000-00000000ad01';

function token(userId: string, admin = false): string {
  return jwt.sign({ id: userId, role: 'app-role', admin_access: admin }, SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

async function api(
  method: string,
  path: string,
  userId: string | null,
  body?: unknown,
  admin = false,
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(userId ? { Authorization: `Bearer ${token(userId, admin)}` } : {}),
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

async function createPro(emailPrefix: string): Promise<{ userId: string; proId: number; email: string }> {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@lookify.app`;
  const user = await pool.query<{ id: string }>(
    `INSERT INTO directus_users (id, email, first_name)
     VALUES (gen_random_uuid(), $1, 'Pro Activación') RETURNING id`,
    [email],
  );
  const userId = user.rows[0].id;
  const pro = await pool.query<{ id: number }>(
    `INSERT INTO beauty_professionals ("user", display_name, verification_status)
     VALUES ($1, 'Pro Activación', 'pending') RETURNING id`,
    [userId],
  );
  proUserIds.push(userId);
  proIds.push(pro.rows[0].id);
  return { userId, proId: pro.rows[0].id, email };
}

async function approve(proId: number) {
  return api('PATCH', `/api/professionals/${proId}/verification`, adminUser, {
    status: 'verified',
    note: 'Aprobado en test',
  }, true);
}

function lastMailTo(email: string): MailMessage {
  const found = [...mails].reverse().find((mail) => mail.to === email);
  assert.ok(found, `No se envió correo a ${email}`);
  return found;
}

function activationCode(email: string): string {
  const mail = lastMailTo(email);
  const match = mail.text.match(/\b\d{6}\b/);
  assert.ok(match, 'El correo no contiene un código de 6 dígitos');
  return match[0];
}

function wrongCode(actual: string): string {
  const first = actual[0] === '0' ? '1' : '0';
  return `${first}${actual.slice(1)}`;
}

async function setLastSentPast(proId: number): Promise<void> {
  await pool.query(
    `UPDATE professional_activation_codes
        SET last_sent_at = NOW() - INTERVAL '61 seconds'
      WHERE professional = $1`,
    [proId],
  );
}

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  const app = express();
  app.use(express.json());
  app.locals.directusSecret = SECRET;
  app.use(
    '/api/professionals',
    createProfessionalsRouter(pool, {
      activationSecret: 'activation-test-secret',
      sendMail: async (mail) => {
        mails.push(mail);
      },
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
  await pool.query('DELETE FROM professional_activation_codes WHERE professional = ANY($1::int[])', [
    proIds,
  ]);
  await pool.query('DELETE FROM beauty_professionals WHERE id = ANY($1::int[])', [proIds]);
  await pool.query('DELETE FROM directus_users WHERE id = ANY($1::uuid[])', [proUserIds]);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

maybe('admin: solo admin aprueba y aprobar genera código sin activar', async () => {
  const pro = await createPro('activation-flow');
  const forbidden = await api('PATCH', `/api/professionals/${pro.proId}/verification`, pro.userId, {
    status: 'verified',
  });
  assert.equal(forbidden.status, 403);

  const approved = await approve(pro.proId);
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.json.data, {
    id: pro.proId,
    verificationStatus: 'verified',
    activated: false,
    emailSent: true,
  });

  const mail = lastMailTo(pro.email);
  assert.equal(mail.subject, 'Tu solicitud en Lookify PRO fue aprobada');
  assert.equal(/\b\d{6}\b/.test(mail.subject), false);
  assert.equal(/\b\d{6}\b/.test(mail.text), true);

  const db = await pool.query<{ verification_status: string; activated_at: Date | null }>(
    'SELECT verification_status, activated_at FROM beauty_professionals WHERE id = $1',
    [pro.proId],
  );
  assert.equal(db.rows[0].verification_status, 'verified');
  assert.equal(db.rows[0].activated_at, null);

  const state = await api('GET', '/api/professionals/me/activation', pro.userId);
  assert.equal(state.status, 200);
  assert.equal(state.json.data.activated, false);
  assert.equal(state.json.data.codigoExpirado, false);
  assert.equal(state.json.data.reenviosRestantes, 3);

  const me = await api('GET', '/api/professionals/me', pro.userId);
  assert.equal(me.json.data.verificationStatus, 'verified');
  assert.equal(me.json.data.activated, false);
});

maybe('activación: código incorrecto incrementa y el correcto activa', async () => {
  const pro = await createPro('activation-confirm');
  assert.equal((await approve(pro.proId)).status, 200);
  const code = activationCode(pro.email);

  const wrong = await api('POST', '/api/professionals/me/activation/confirm', pro.userId, {
    codigo: wrongCode(code),
  });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.json.error, 'codigo_invalido');

  const attempts = await pool.query<{ failed_attempts: number }>(
    'SELECT failed_attempts FROM professional_activation_codes WHERE professional = $1',
    [pro.proId],
  );
  assert.equal(attempts.rows[0].failed_attempts, 1);

  const ok = await api('POST', '/api/professionals/me/activation/confirm', pro.userId, {
    codigo: code,
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.data, { activated: true, professionalId: pro.proId });

  const db = await pool.query<{ activated_at: Date | null }>(
    'SELECT activated_at FROM beauty_professionals WHERE id = $1',
    [pro.proId],
  );
  assert.ok(db.rows[0].activated_at);
  const rows = await pool.query('SELECT 1 FROM professional_activation_codes WHERE professional = $1', [
    pro.proId,
  ]);
  assert.equal(rows.rowCount, 0);

  const me = await api('GET', '/api/professionals/me', pro.userId);
  assert.equal(me.json.data.activated, true);
  const state = await api('GET', '/api/professionals/me/activation', pro.userId);
  assert.equal(state.json.data.activated, true);

  const again = await api('POST', '/api/professionals/me/activation/confirm', pro.userId, {
    codigo: code,
  });
  assert.equal(again.status, 200);
  assert.equal(again.json.data.activated, true);

  const reapprove = await approve(pro.proId);
  assert.equal(reapprove.status, 200);
  assert.equal(reapprove.json.data.activated, true);
  assert.equal(reapprove.json.data.emailSent, false);
  assert.equal(reapprove.json.data.alreadyActivated, true);
});

maybe('reenvío: cooldown, máximo 3 y bloqueo de reenvíos agotados', async () => {
  const pro = await createPro('activation-resend');
  assert.equal((await approve(pro.proId)).status, 200);

  const tooSoon = await api('POST', '/api/professionals/me/activation/resend', pro.userId);
  assert.equal(tooSoon.status, 429);
  assert.equal(tooSoon.json.error, 'reenvio_cooldown');

  for (let remaining = 2; remaining >= 0; remaining -= 1) {
    await setLastSentPast(pro.proId);
    const sent = await api('POST', '/api/professionals/me/activation/resend', pro.userId);
    assert.equal(sent.status, 200);
    assert.equal(sent.json.data.reenviosRestantes, remaining);
  }

  await setLastSentPast(pro.proId);
  const exhausted = await api('POST', '/api/professionals/me/activation/resend', pro.userId);
  assert.equal(exhausted.status, 429);
  assert.equal(exhausted.json.error, 'reenvios_agotados');

  const state = await api('GET', '/api/professionals/me/activation', pro.userId);
  assert.equal(state.json.data.reenviosRestantes, 0);
  assert.equal(state.json.data.sinSalidaActivacion, false);
});

maybe('bloqueo: 5 fallos bloquean 15 min incluso con el código correcto', async () => {
  const pro = await createPro('activation-lock');
  assert.equal((await approve(pro.proId)).status, 200);
  const code = activationCode(pro.email);
  const bad = wrongCode(code);

  for (let i = 1; i <= 4; i += 1) {
    const r = await api('POST', '/api/professionals/me/activation/confirm', pro.userId, {
      codigo: bad,
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'codigo_invalido');
  }
  const fifth = await api('POST', '/api/professionals/me/activation/confirm', pro.userId, {
    codigo: bad,
  });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.json.error, 'demasiados_intentos');

  const blocked = await api('POST', '/api/professionals/me/activation/confirm', pro.userId, {
    codigo: code,
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.json.error, 'bloqueo_temporal');

  const state = await api('GET', '/api/professionals/me/activation', pro.userId);
  assert.ok(state.json.data.bloqueadoHastaMs);

  await pool.query(
    `UPDATE professional_activation_codes
        SET locked_until = NOW() - INTERVAL '1 second'
      WHERE professional = $1`,
    [pro.proId],
  );
  const ok = await api('POST', '/api/professionals/me/activation/confirm', pro.userId, {
    codigo: code,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.activated, true);
});

maybe('rechazo: limpia código y activación', async () => {
  const pro = await createPro('activation-reject');
  assert.equal((await approve(pro.proId)).status, 200);
  const rejected = await api(
    'PATCH',
    `/api/professionals/${pro.proId}/verification`,
    adminUser,
    { status: 'rejected', note: 'Documentación ilegible' },
    true,
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.json.data.verificationStatus, 'rejected');
  assert.equal(rejected.json.data.activated, false);

  const db = await pool.query<{ verification_status: string; activated_at: Date | null }>(
    'SELECT verification_status, activated_at FROM beauty_professionals WHERE id = $1',
    [pro.proId],
  );
  assert.equal(db.rows[0].verification_status, 'rejected');
  assert.equal(db.rows[0].activated_at, null);
  const rows = await pool.query('SELECT 1 FROM professional_activation_codes WHERE professional = $1', [
    pro.proId,
  ]);
  assert.equal(rows.rowCount, 0);

  const state = await api('GET', '/api/professionals/me/activation', pro.userId);
  assert.equal(state.status, 409);
  assert.equal(state.json.error, 'not_verified');
});
