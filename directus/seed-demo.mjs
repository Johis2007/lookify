// Seed de demostración (4C-0): deja la instancia lista para probar con login
// REAL de Directus (sin tokens firmados a mano).
//
// Crea / asegura (idempotente, re-ejecutable sin duplicar):
//   - cliente.demo@lookify.app   (rol App User)
//   - pro.demo@lookify.app       (rol App User, perfil VERIFICADO y online,
//                                 ubicación PostGIS y un servicio ofrecido)
//   - admin@lookify.app          (Administrator; lo crea Directus al arrancar)
//
// La contraseña de los usuarios demo se lee de DEMO_PASSWORD (definida en el
// .env raíz, nunca en el repo). El script la reaplica en cada ejecución para
// que el entorno de desarrollo sea reproducible.
//
// Uso: npm run seed:demo
//   Requiere: docker compose up -d postgres redis directus
//             npm run db:setup && npm run db:migrate (esquema)
import { loadRootEnv } from '../scripts/dotenv-mini.mjs';
import pg from 'pg';

loadRootEnv(import.meta.url);

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

const CLIENT_EMAIL = 'cliente.demo@lookify.app';
const PRO_EMAIL = 'pro.demo@lookify.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@lookify.app';
const PRO_DISPLAY_NAME = 'Pro Demo';
const PRO_LAT = 4.6545;
const PRO_LNG = -74.0615;
const PRO_SERVICE_NAME = 'Corte + peinado';

if (!DEMO_PASSWORD) {
  console.error(
    'Falta DEMO_PASSWORD en el .env raíz. Agrega una contraseña de desarrollo ' +
      '(ver .env.example) y vuelve a ejecutar: npm run seed:demo'
  );
  process.exit(1);
}

const fail = (what, detail) => {
  console.error(`ERROR en ${what}: ${detail}`);
  process.exit(1);
};

let TOKEN = '';
const headers = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN });

async function api(method, path, body) {
  const r = await fetch(URL + path, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await r.json();
  } catch {
    /* 204 sin body */
  }
  return { status: r.status, data };
}

async function waitReady(tries = 60) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(`${URL}/server/ping`);
      if (r.ok && (await r.text()).includes('pong')) {
        console.log(`Directus listo (${i} intento(s))`);
        return;
      }
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  fail('waitReady', `Directus no responde en ${URL}`);
}

async function ensureAuth() {
  if (process.env.ADMIN_TOKEN) {
    TOKEN = process.env.ADMIN_TOKEN;
    const me = await api('GET', '/users/me?fields=id');
    if (me.status === 200) {
      console.log('Auth: ADMIN_TOKEN válido');
      return;
    }
    console.log('Auth: ADMIN_TOKEN inválido, intento login admin…');
  }
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    fail('auth', 'Define ADMIN_TOKEN o ADMIN_EMAIL/ADMIN_PASSWORD en el .env');
  }
  const r = await fetch(`${URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.data?.access_token) {
    fail('auth', `Login admin falló (${r.status}). Revisa ADMIN_EMAIL/ADMIN_PASSWORD.`);
  }
  TOKEN = j.data.access_token;
  console.log('Auth: login admin OK');
}

async function findOne(path) {
  const r = await api('GET', path);
  if (r.status !== 200) fail(`GET ${path}`, `HTTP ${r.status}`);
  return (r.data?.data ?? [])[0] ?? null;
}

async function ensureRole(name) {
  const role = await findOne(`/roles?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name&limit=1`);
  if (!role) fail('rol', `No existe el rol "${name}". Corre primero: npm run db:setup`);
  return role.id;
}

async function ensureUser({ email, firstName, role }) {
  const existing = await findOne(
    `/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=id,email&limit=1`
  );
  if (existing) {
    const u = await api('PATCH', `/users/${existing.id}`, {
      password: DEMO_PASSWORD,
      role,
      status: 'active',
    });
    if (u.status !== 200) fail(`PATCH user ${email}`, `HTTP ${u.status} ${JSON.stringify(u.data)?.slice(0, 200)}`);
    console.log(`= usuario ${email} (${existing.id})`);
    return existing.id;
  }
  const c = await api('POST', '/users', {
    email,
    password: DEMO_PASSWORD,
    first_name: firstName,
    last_name: 'Demo',
    role,
    status: 'active',
  });
  if (![200, 201].includes(c.status) || !c.data?.data?.id) {
    fail(`POST user ${email}`, `HTTP ${c.status} ${JSON.stringify(c.data)?.slice(0, 200)}`);
  }
  console.log(`+ usuario ${email} (${c.data.data.id})`);
  return c.data.data.id;
}

async function ensureAdmin() {
  const adm = await findOne(`/users?filter[email][_eq]=${encodeURIComponent(ADMIN_EMAIL)}&fields=id,email&limit=1`);
  if (adm) {
    console.log(`= admin ${ADMIN_EMAIL} (${adm.id})`);
    return adm.id;
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.log(`Aviso: no existe ${ADMIN_EMAIL} y no hay ADMIN_PASSWORD para crearlo.`);
    return null;
  }
  const role = await findOne('/roles?filter[name][_eq]=Administrator&fields=id&limit=1');
  if (!role) fail('admin', 'No existe el rol Administrator');
  const c = await api('POST', '/users', {
    email: ADMIN_EMAIL,
    password,
    first_name: 'Admin',
    role: role.id,
    status: 'active',
  });
  if (![200, 201].includes(c.status)) {
    fail('POST admin', `HTTP ${c.status} ${JSON.stringify(c.data)?.slice(0, 200)}`);
  }
  console.log(`+ admin ${ADMIN_EMAIL}`);
  return c.data.data.id;
}

async function ensureProProfile(userId) {
  const existing = await findOne(
    `/items/beauty_professionals?filter[user][_eq]=${encodeURIComponent(userId)}&fields=id,verification_status,is_online&limit=1`
  );
  const body = {
    display_name: PRO_DISPLAY_NAME,
    bio: 'Profesional de demostración (barbería y peluquería).',
    verification_status: 'verified',
    is_online: true,
    rating_avg: 4.8,
    years_exp: 6,
  };
  if (existing) {
    const u = await api('PATCH', `/items/beauty_professionals/${existing.id}`, body);
    if (u.status !== 200) fail('PATCH perfil demo', `HTTP ${u.status} ${JSON.stringify(u.data)?.slice(0, 200)}`);
    console.log(`= perfil pro demo (id ${existing.id}, verificado y online)`);
    return Number(existing.id);
  }
  const c = await api('POST', '/items/beauty_professionals', { user: userId, ...body });
  if (![200, 201].includes(c.status) || !c.data?.data?.id) {
    fail('POST perfil demo', `HTTP ${c.status} ${JSON.stringify(c.data)?.slice(0, 200)}`);
  }
  console.log(`+ perfil pro demo (id ${c.data.data.id}, verificado y online)`);
  return Number(c.data.data.id);
}

async function ensureServiceOffered(pool, professionalId) {
  let service = await findOne(
    `/items/beauty_services?filter[name][_eq]=${encodeURIComponent(PRO_SERVICE_NAME)}&fields=id,name&limit=1`
  );
  if (!service) {
    service = await findOne('/items/beauty_services?filter[is_active][_eq]=true&fields=id,name&limit=1');
    if (!service) fail('servicio', `No hay servicios. Corre primero: npm run db:seed`);
    console.log(`Aviso: "${PRO_SERVICE_NAME}" no existe; se usa "${service.name}".`);
  }
  const q = await pool.query(
    'SELECT 1 FROM professional_services WHERE professional_id = $1 AND service_id = $2 LIMIT 1',
    [professionalId, service.id]
  );
  if (q.rowCount === 0) {
    await pool.query('INSERT INTO professional_services (professional_id, service_id) VALUES ($1, $2)', [
      professionalId,
      service.id,
    ]);
    console.log(`+ servicio ofrecido "${service.name}" (id ${service.id})`);
  } else {
    console.log(`= servicio ofrecido "${service.name}" (id ${service.id})`);
  }
  return service;
}

async function ensureLocation(pool, professionalId) {
  await pool.query(
    `INSERT INTO professional_locations (professional_id, geom, updated_at)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), NOW())
     ON CONFLICT (professional_id) DO UPDATE SET geom = EXCLUDED.geom, updated_at = NOW()`,
    [professionalId, PRO_LNG, PRO_LAT]
  );
  console.log(`= ubicación del pro demo (${PRO_LAT}, ${PRO_LNG})`);
}

await waitReady();
await ensureAuth();

const roleId = await ensureRole('App User');
const adminId = await ensureAdmin();
const clientId = await ensureUser({ email: CLIENT_EMAIL, firstName: 'Cliente', role: roleId });
const proUserId = await ensureUser({ email: PRO_EMAIL, firstName: 'Pro', role: roleId });
const professionalId = await ensureProProfile(proUserId);

if (!process.env.DATABASE_URL) fail('DATABASE_URL', 'Falta en el .env raíz');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const service = await ensureServiceOffered(pool, professionalId);
  await ensureLocation(pool, professionalId);
  console.log('');
  console.log('SEED:DEMO OK');
  console.log(`  cliente: ${CLIENT_EMAIL} (${clientId})`);
  console.log(`  pro:     ${PRO_EMAIL} (${proUserId}) -> perfil ${professionalId}, servicio ${service.id}`);
  console.log(`  admin:   ${ADMIN_EMAIL}${adminId ? ` (${adminId})` : ''}`);
  console.log('  contraseña: el valor de DEMO_PASSWORD del .env');
} finally {
  await pool.end();
}
