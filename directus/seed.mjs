// Seed Lookify: catálogos base (categorías + servicios) en Directus.
// IDEMPOTENTE: puede ejecutarse N veces sin duplicar (upsert por slug/nombre).
// NO crea usuarios demo: la licencia gratuita de Directus limita a 3 seats y
// crear usuarios de ejemplo podría bloquear el registro real. El admin inicial
// lo crea el propio Directus al arrancar (ADMIN_EMAIL/ADMIN_PASSWORD del .env).
//
// ORDEN CORRECTO en un entorno nuevo:
//   1. docker compose up -d postgres redis directus
//   2. npm run db:setup     (colecciones, campos, roles y permisos vía API)
//   3. npm run db:migrate   (SQL PostGIS + constraints vía psql)
//   4. npm run db:seed      (este script: catálogos + verificación)
//   o directamente: npm run db:fresh   (ejecuta 2+3+4 en orden)
//
// Uso: npm run db:seed
//   o: DIRECTUS_URL=http://localhost:8055 ADMIN_TOKEN=xxx node directus/seed.mjs
// Si ADMIN_TOKEN se omite, inicia sesión con ADMIN_EMAIL/ADMIN_PASSWORD del .env.
import { loadRootEnv } from '../scripts/dotenv-mini.mjs';

loadRootEnv(import.meta.url);

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
let TOKEN = process.env.ADMIN_TOKEN || '';

const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN });

async function api(method, path, body) {
  const r = await fetch(URL + path, {
    method,
    headers: H(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await r.json();
  } catch {
    /* sin body (204) */
  }
  return { status: r.status, data };
}

const fail = (what, detail) => {
  console.error(`ERROR en ${what}: ${detail}`);
  process.exit(1);
};

// 0. Espera a Directus (en un entorno nuevo el primer arranque tarda).
// OJO: /server/health responde 403 en instancias con permisos endurecidos;
// /server/ping es el liveness público y estable entre versiones.
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
  fail('waitReady', `Directus no responde en ${URL} tras ${(tries * 5) / 60} min`);
}

// 1. Auth: token directo o login con credenciales del .env.
async function ensureAuth() {
  if (TOKEN) {
    const me = await api('GET', '/users/me?fields=id');
    if (me.status === 200) {
      console.log('Auth: ADMIN_TOKEN válido');
      return;
    }
    console.log('Auth: ADMIN_TOKEN inválido, intento login con ADMIN_EMAIL…');
  }
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    fail(
      'auth',
      'Sin ADMIN_TOKEN válido ni ADMIN_EMAIL/ADMIN_PASSWORD. ' +
        'Copia .env.example a .env y define las credenciales del admin.'
    );
  }
  const r = await fetch(`${URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.data?.access_token) {
    fail('auth', `Login admin falló (${r.status}). ¿Directus arrancó con ese ADMIN_EMAIL?`);
  }
  TOKEN = j.data.access_token;
  console.log('Auth: login admin OK (token de sesión)');
}

// 2. Pre-chequeos: el esquema debe existir (db:setup antes que db:seed).
async function ensureSchema() {
  for (const col of ['service_categories', 'beauty_services']) {
    const r = await api('GET', `/collections/${col}`);
    if (r.status !== 200) {
      fail(
        'schema',
        `Falta la colección "${col}". Corre primero: npm run db:setup`
      );
    }
  }
  const f = await api('GET', '/fields/beauty_services/category_id');
  if (f.status !== 200) {
    fail(
      'schema',
      'Falta el campo beauty_services.category_id. Corre primero: npm run db:setup'
    );
  }
  console.log('Schema: colecciones y campos OK');
}

// 3. Categorías (upsert por slug).
const CATS = [
  { name: 'Uñas', slug: 'unas', icon: '💅', color: '#E85D7A', is_active: true },
  { name: 'Maquillaje', slug: 'maquillaje', icon: '💄', color: '#B565D8', is_active: true },
  { name: 'Peluquería', slug: 'peluqueria', icon: '💇', color: '#E9A23B', is_active: true },
  { name: 'Barbería', slug: 'barberia', icon: '💈', color: '#3B82F6', is_active: true },
  { name: 'Skincare', slug: 'skincare', icon: '✨', color: '#22C55E', is_active: true },
];

async function seedCategories() {
  const ids = {};
  for (const c of CATS) {
    const q = await api(
      'GET',
      `/items/service_categories?filter[slug][_eq]=${c.slug}&fields=id&limit=1`
    );
    if (q.status === 200 && q.data?.data?.length) {
      ids[c.slug] = q.data.data[0].id;
      console.log('= cat', c.slug);
      continue;
    }
    const r = await api('POST', '/items/service_categories', c);
    if (![200, 201].includes(r.status) || !r.data?.data?.id) {
      fail('categoría ' + c.slug, `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`);
    }
    ids[c.slug] = r.data.data.id;
    console.log('+ cat', c.slug, r.data.data.id);
  }
  return ids;
}

// 4. Servicios (upsert por nombre; precios COP realistas para Colombia).
const SERVICES = [
  { name: 'Manicura clásica', cat: 'unas', price_base: 35000, duration_min: 45 },
  { name: 'Uñas acrílicas', cat: 'unas', price_base: 65000, duration_min: 90 },
  { name: 'Maquillaje social', cat: 'maquillaje', price_base: 90000, duration_min: 60 },
  { name: 'Corte + peinado', cat: 'peluqueria', price_base: 60000, duration_min: 60 },
  { name: 'Barba + corte', cat: 'barberia', price_base: 45000, duration_min: 45 },
  { name: 'Limpieza facial', cat: 'skincare', price_base: 75000, duration_min: 60 },
];

async function seedServices(catIds) {
  for (const s of SERVICES) {
    const payload = {
      name: s.name,
      category: s.cat,
      price_base: s.price_base,
      duration_min: s.duration_min,
      is_active: true,
      category_id: catIds[s.cat] ?? null,
    };
    const q = await api(
      'GET',
      `/items/beauty_services?filter[name][_eq]=${encodeURIComponent(s.name)}&fields=id&limit=1`
    );
    if (q.status === 200 && q.data?.data?.length) {
      const id = q.data.data[0].id;
      const u = await api('PATCH', `/items/beauty_services/${id}`, payload);
      if (u.status !== 200) {
        fail('servicio ' + s.name, `HTTP ${u.status} ${JSON.stringify(u.data)?.slice(0, 200)}`);
      }
      console.log('= svc', s.name);
      continue;
    }
    const r = await api('POST', '/items/beauty_services', payload);
    if (![200, 201, 204].includes(r.status)) {
      fail('servicio ' + s.name, `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`);
    }
    console.log('+ svc', s.name);
  }
}

// 5. Verificación final (falla si el seed quedó incompleto).
// Solo exige los datos del propio seed: en un entorno con datos del negocio
// no debe fallar por servicios ajenos sin categoría.
async function verify() {
  const cats = await api('GET', '/items/service_categories?fields=id,slug&limit=100');
  const catSlugs = new Set((cats.data?.data ?? []).map((c) => c.slug));
  const missingCats = CATS.filter((c) => !catSlugs.has(c.slug)).map((c) => c.slug);
  const problems = [];
  if (missingCats.length) problems.push(`categorías faltantes: ${missingCats.join(', ')}`);
  for (const s of SERVICES) {
    const q = await api(
      'GET',
      `/items/beauty_services?filter[name][_eq]=${encodeURIComponent(s.name)}&fields=id,is_active,category_id&limit=1`
    );
    const row = q.status === 200 ? q.data?.data?.[0] : null;
    if (!row) problems.push(`servicio ausente: ${s.name}`);
    else if (!row.is_active) problems.push(`servicio inactivo: ${s.name}`);
    else if (row.category_id == null) problems.push(`servicio sin categoría: ${s.name}`);
  }
  console.log(
    `Verificación: ${catSlugs.size} categorías totales, ` +
      `${SERVICES.length - problems.filter((p) => p.startsWith('servicio')).length}/${SERVICES.length} servicios del seed OK`
  );
  if (problems.length) {
    fail('verify', problems.join(' · ') + '. Revisa el token (debe ser admin) y reintenta.');
  }
  const email = process.env.ADMIN_EMAIL;
  if (email) {
    const adm = await api(
      'GET',
      `/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=id&limit=1`
    );
    // Si falla la lectura, se informa sin romper el seed (el admin lo crea
    // Directus en el arranque con ADMIN_EMAIL/ADMIN_PASSWORD del .env).
    if (adm.status === 200 && adm.data?.data?.length) {
      console.log('Admin inicial verificado:', email);
    } else if (adm.status === 200) {
      console.log(`Aviso: no existe un usuario ${email} en esta instancia; si es un entorno nuevo, Directus lo crea solo en el primer arranque con ADMIN_EMAIL/ADMIN_PASSWORD.`);
    } else {
      console.log(`Aviso: no se pudo consultar el admin (HTTP ${adm.status}); el seed del catálogo quedó OK de todos modos.`);
    }
  }
}

await waitReady();
await ensureAuth();
await ensureSchema();
const catIds = await seedCategories();
await seedServices(catIds);
await verify();
console.log('SEED OK: catálogo listo, idempotente (re-ejecutable sin duplicar)');
