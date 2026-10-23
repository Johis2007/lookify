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
// .env raíz, nunca en el repo) y SOLO se usa al crear cuentas que faltan: el
// script nunca sobrescribe la contraseña de una cuenta existente. El admin se
// crea (si falta) con ADMIN_PASSWORD, nunca con DEMO_PASSWORD.
//
// Uso: npm run seed:demo
//   Requiere: docker compose up -d postgres redis directus
//             npm run db:setup && npm run db:migrate (esquema)
import { loadRootEnv } from '../scripts/dotenv-mini.mjs';
import pg from 'pg';

loadRootEnv(import.meta.url);

const BASE_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

const CLIENT_EMAIL = 'cliente.demo@lookify.app';
const PRO_EMAIL = 'pro.demo@lookify.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@lookify.app';
const PRO_DISPLAY_NAME = 'Pro Demo';
const PRO_SERVICE_NAME = 'Corte + peinado';
const ADDITIONAL_PROS = [
  {
    email: 'pro.demo2@lookify.app',
    displayName: 'Pro Demo 2',
    bio: 'Profesional de demostracion (corte y peinado).',
    distanceM: 450,
    bearingDeg: 45,
  },
  {
    email: 'pro.demo3@lookify.app',
    displayName: 'Pro Demo 3',
    bio: 'Profesional de demostracion (corte y peinado).',
    distanceM: 650,
    bearingDeg: 225,
  },
];

const fail = (what, detail) => {
  console.error(`ERROR en ${what}: ${detail}`);
  process.exit(1);
};

function parseCoord(name, min, max) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) fail(name, 'Falta en el .env raiz (ver .env.example)');
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(name, `Valor fuera de rango [${min}, ${max}]: ${raw}`);
  }
  return value;
}

const DEMO_LAT = parseCoord('DEMO_LAT', -90, 90);
const DEMO_LNG = parseCoord('DEMO_LNG', -180, 180);

function destination(lat, lng, distanceM, bearingDeg) {
  const R = 6371000;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const angular = distanceM / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (((lng2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

// Guardas 4C-1: este seed crea cuentas con contraseña conocida, así que solo
// puede correr contra una instancia de desarrollo local o de red privada.
function isLocalOrPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (h === '::' || h.endsWith('.localhost')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  // IPv6 ULA (fc00::/7) y link-local (fe80::/10).
  return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
}

function assertSafeEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    fail('entorno', 'seed:demo no puede ejecutarse con NODE_ENV=production');
  }
  for (const name of ['DIRECTUS_URL', 'PUBLIC_URL']) {
    const raw = process.env[name];
    if (!raw) continue;
    let host;
    try {
      host = new URL(raw).hostname;
    } catch {
      fail('entorno', `${name} no es una URL válida: ${raw}`);
    }
    if (!isLocalOrPrivateHost(host)) {
      fail(
        'entorno',
        `${name} apunta a "${host}" (no local/privada). Este seed solo corre contra localhost o IP privada.`,
      );
    }
  }
}

assertSafeEnvironment();

if (!DEMO_PASSWORD) {
  console.error(
    'Falta DEMO_PASSWORD en el .env raíz. Agrega una contraseña de desarrollo ' +
      '(ver .env.example) y vuelve a ejecutar: npm run seed:demo'
  );
  process.exit(1);
}

let TOKEN = '';
const headers = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN });

async function api(method, path, body) {
  const r = await fetch(BASE_URL + path, {
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
      const r = await fetch(`${BASE_URL}/server/ping`);
      if (r.ok && (await r.text()).includes('pong')) {
        console.log(`Directus listo (${i} intento(s))`);
        return;
      }
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  fail('waitReady', `Directus no responde en ${BASE_URL}`);
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
  const r = await fetch(`${BASE_URL}/auth/login`, {
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
    // No se toca: ni contraseña, ni rol, ni estado. Re-ejecutar el seed jamás
    // debe cambiar credenciales de una cuenta ya existente (4C-1).
    console.log(`= usuario ${email} (${existing.id}, existente sin cambios)`);
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
  // El admin NO es una cuenta demo: conserva ADMIN_PASSWORD y, si ya existe,
  // no se modifica (ni contraseña ni rol).
  const adm = await findOne(`/users?filter[email][_eq]=${encodeURIComponent(ADMIN_EMAIL)}&fields=id,email&limit=1`);
  if (adm) {
    console.log(`= admin ${ADMIN_EMAIL} (${adm.id}, existente sin cambios)`);
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

async function ensureProProfile(userId, displayName = PRO_DISPLAY_NAME) {
  const existing = await findOne(
    `/items/beauty_professionals?filter[user][_eq]=${encodeURIComponent(userId)}&fields=id,verification_status,is_online&limit=1`
  );
  const body = {
    display_name: displayName,
    bio: 'Profesional de demostración (barbería y peluquería).',
    verification_status: 'verified',
    is_online: true,
    rating_avg: 4.8,
    years_exp: 6,
  };
  if (existing) {
    const u = await api('PATCH', `/items/beauty_professionals/${existing.id}`, body);
    if (u.status !== 200) fail('PATCH perfil demo', `HTTP ${u.status} ${JSON.stringify(u.data)?.slice(0, 200)}`);
    console.log(`= perfil ${displayName} (id ${existing.id}, verificado y online)`);
    return Number(existing.id);
  }
  const c = await api('POST', '/items/beauty_professionals', { user: userId, ...body });
  if (![200, 201].includes(c.status) || !c.data?.data?.id) {
    fail('POST perfil demo', `HTTP ${c.status} ${JSON.stringify(c.data)?.slice(0, 200)}`);
  }
  console.log(`+ perfil ${displayName} (id ${c.data.data.id}, verificado y online)`);
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

async function ensureLocation(pool, professionalId, lat, lng) {
  await pool.query(
    `INSERT INTO professional_locations (professional_id, geom, updated_at)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), NOW())
     ON CONFLICT (professional_id) DO UPDATE SET geom = EXCLUDED.geom, updated_at = NOW()`,
    [professionalId, lng, lat]
  );
  console.log(`= ubicación del pro demo (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
}

await waitReady();
await ensureAuth();

const roleId = await ensureRole('App User');
const adminId = await ensureAdmin();
const clientId = await ensureUser({ email: CLIENT_EMAIL, firstName: 'Cliente', role: roleId });
const proUserId = await ensureUser({ email: PRO_EMAIL, firstName: 'Pro', role: roleId });
const professionalId = await ensureProProfile(proUserId);

const additionalPros = [];
for (const spec of ADDITIONAL_PROS) {
  const point = destination(DEMO_LAT, DEMO_LNG, spec.distanceM, spec.bearingDeg);
  const userId = await ensureUser({ email: spec.email, firstName: 'Pro', role: roleId });
  const profileId = await ensureProProfile(userId, spec.displayName);
  additionalPros.push({ ...spec, userId, professionalId: profileId, lat: point.lat, lng: point.lng });
}

if (!process.env.DATABASE_URL) fail('DATABASE_URL', 'Falta en el .env raíz');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const pros = [
    {
      email: PRO_EMAIL,
      userId: proUserId,
      professionalId,
      lat: DEMO_LAT,
      lng: DEMO_LNG,
      distanceM: 0,
    },
    ...additionalPros,
  ];
  for (const pro of pros) {
    const service = await ensureServiceOffered(pool, pro.professionalId);
    await ensureLocation(pool, pro.professionalId, pro.lat, pro.lng);
    console.log(
      `  ${pro.email}: perfil ${pro.professionalId}, servicio ${service.id}, ` +
        `${pro.distanceM} m (${pro.lat.toFixed(6)}, ${pro.lng.toFixed(6)})`,
    );
  }
  console.log('');
  console.log('SEED:DEMO OK');
  console.log(`  cliente: ${CLIENT_EMAIL} (${clientId})`);
  console.log(`  admin:   ${ADMIN_EMAIL}${adminId ? ` (${adminId})` : ''}`);
  console.log('  contraseña: el valor de DEMO_PASSWORD del .env');
} finally {
  await pool.end();
}
