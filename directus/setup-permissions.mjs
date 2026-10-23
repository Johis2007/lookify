// Modelo SEGURO de permisos Lookify (reemplaza el DEV abierto).
// LÍMITES DE LA INSTANCIA (licencia Core gratuita):
// - Solo reglas estáticas (collection+action+fields ['*']). Todo lo dinámico
//   ($CURRENT_USER, presets, validation, recorte de campos) responde 403.
// - SEATS: la licencia Core solo cuenta usuarios con App Access o Admin Access
//   (los que entran a Directus Studio). Un rol/policy SIN app_access no consume
//   seat: sus usuarios usan la API con su token pero no pueden entrar al panel.
//   Por eso la policy "Lookify App" se crea con app_access=false y no cuenta.
//   (Si la instancia cayera en LIMIT_EXCEEDED, la solución real es licencia
//   Directus, que además desbloquea reglas granulares.)
// Por eso:
// - Public (sin login): SOLO crear usuarios para registro. El rol se asigna
//   vía settings.public_registration_role (forzado por Directus, probado en
//   código fuente: el payload no puede escalar a admin).
// - Rol "App User": catálogo + flujos propios (lecturas/escrituras que la app
//   necesita). El alcance por fila NO se puede forzar aquí:
//   - Lecturas sensibles (address/GPS) las limita el canal realtime (ACL real).
//   - Escrituras cruzadas entre autenticados quedan como RIESGO RESIDUAL
//     documentado (requiere cuenta + API; ya no Internet abierto).
//   - Camino definitivo: licencia con reglas custom o proxy BFF.
// - Admin (admin_access): omite estas reglas, sin cambios.
// - Registro público asigna el rol App User y los sin-rol se migran (si seats
//   lo permite; si no, ver SQL en el paso 6).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error('Falta ADMIN_TOKEN'); process.exit(1); }
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

async function api(method, path, body) {
  const r = await fetch(URL + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const fail = (what, r) => {
  throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`);
};
// Filtros como JSON codificado (los corchetes con %20 fallan en esta instancia).
const FQ = (obj) => 'filter=' + encodeURIComponent(JSON.stringify(obj));
// Búsqueda determinista en listas pequeñas (evita rarezas de filtros).
async function findByName(path, name) {
  const g = await api('GET', `${path}?fields=id,name&limit=100`);
  if (g.status !== 200) fail(`GET ${path}`, g);
  return (g.data?.data ?? []).find((x) => x.name === name)?.id;
}

// 1. Rol App User (idempotente).
let roleId;
{
  const foundRole = await findByName('/roles', 'App User');
  roleId = foundRole;
  if (!roleId) {
    const c = await api('POST', '/roles', { name: 'App User', description: 'Usuarios de la app Lookify (cliente o profesional)' });
    if (c.status !== 200 && c.status !== 201 && c.status !== 204) fail('POST roles', c);
    roleId = c.data?.data?.id || (await findByName('/roles', 'App User'));
  }
  if (!roleId) throw new Error('Sin rol App User');
  console.log('rol App User:', roleId);
}

// 2. Policy Lookify App + acceso al rol.
// app_access:false -> los usuarios de la app NO ocupan seat (solo API, sin
// panel). Idempotente: si la policy ya existe, se fuerza el valor actualizado.
const APP_POLICY_BODY = {
  name: 'Lookify App',
  app_access: false,
  admin_access: false,
  description: 'Permisos granulares de la app (solo API; no consume seat)',
};
let appPolicy;
{
  appPolicy = await findByName('/policies', 'Lookify App');
  if (!appPolicy) {
    const c = await api('POST', '/policies', APP_POLICY_BODY);
    if (c.status !== 200 && c.status !== 201 && c.status !== 204) fail('POST policies', c);
    appPolicy = c.data?.data?.id || (await findByName('/policies', 'Lookify App'));
  } else {
    const u = await api('PATCH', `/policies/${appPolicy}`, APP_POLICY_BODY);
    if (u.status !== 200) fail('PATCH policy Lookify App', u);
  }
  if (!appPolicy) throw new Error('Sin policy Lookify App');
  const a = await api('GET', `/access?filter[policy][_eq]=${appPolicy}&fields=id,role&limit=100`);
  if (a.status !== 200) fail('GET access', a);
  const hasAccess = (a.data?.data ?? []).some((x) => x.role === roleId);
  if (!hasAccess) {
    const c = await api('POST', '/access', { policy: appPolicy, role: roleId });
    if (c.status !== 200 && c.status !== 201 && c.status !== 204) fail('POST access', c);
  }
  console.log('policy Lookify App:', appPolicy);
}

// 3. Policy Public existente.
let publicId;
{
  const g = await api('GET', '/policies?filter[name][_eq]=$t:public_label&fields=id&limit=1');
  if (g.status !== 200) fail('GET public policy', g);
  publicId = g.data?.data?.[0]?.id;
  if (!publicId) throw new Error('Sin policy Public');
}

// 4. PUBLIC: cerrar todo, dejar solo registro (presets fuerzan role+status).
{
  const g = await api('GET', `/permissions?filter[policy][_eq]=${publicId}&fields=id&limit=100`);
  if (g.status !== 200) fail('GET public perms', g);
  for (const row of g.data?.data ?? []) {
    const d = await api('DELETE', `/permissions/${row.id}`);
    if (d.status !== 200 && d.status !== 204) fail('DELETE public perm', d);
  }
  console.log('public: permisos abiertos eliminados');
  const c = await api('POST', '/permissions', {
    policy: publicId,
    collection: 'directus_users',
    action: 'create',
    fields: ['*'], // la instancia solo acepta wildcard (ver header)
  });
  if (![200, 201, 204].includes(c.status)) fail('POST public users create', c);
  console.log('public: solo registro (POST /users; rol por public_registration_role)');
}

// 5. APP: matriz mínima. TODO plano ['*']: esta instancia rechaza listas de
// campos a medida (mismo gate que las reglas dinámicas). Recorte real de PII
// (phone) pendiente de licencia o endpoint propio.
const MATRIX = [
  // Catálogo: lectura autenticada.
  ['beauty_services', 'read'],
  ['service_categories', 'read'],
  // Perfil profesional, servicios ofrecidos y documentos: TODO pasa por el BFF
  // (/api/professionals/me*, /api/professionals/:id/public). El App User no
  // lee ni escribe directo (ver REVOKE).
  // Reservas y eventos: TODO pasa por el BFF (/api/bookings*). El admin ve
  // reservas con su token.
  // Reseñas, perfiles de cliente y radar: solo por BFF / uso analítico interno.
  // Archivos: TODO por BFF (/api/files), el App User no toca directus_files.
  // Usuarios: TODO por BFF (/api/users/me), sin enumeración de correos.
];

for (const [collection, action] of MATRIX) {
  const q = `/permissions?filter[policy][_eq]=${appPolicy}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1&fields=id`;
  const ex = await api('GET', q);
  if (ex.status !== 200) fail(`GET perm ${collection} ${action}`, ex);
  const row = ex.data?.data?.[0];
  const payload = {
    policy: appPolicy,
    collection,
    action,
    fields: ['*'],
  };
  if (row) {
    const r = await api('PATCH', `/permissions/${row.id}`, payload);
    if (r.status !== 200) fail(`PATCH perm ${collection} ${action}`, r);
  } else {
    const r = await api('POST', '/permissions', payload);
    if (![200, 201, 204].includes(r.status)) fail(`POST perm ${collection} ${action}`, r);
  }
}
console.log(`app: ${MATRIX.length} permisos aplicados`);

// 5b. REVOCACIÓN (idempotente): quitar al App User cualquier permiso directo
// que el BFF ya cubre. Paso 2B-bis: create/update sobre beauty_professionals
// (perfil profesional vía /api/professionals/me, sin auto-verificación).
// Paso 2D: todo acceso a bookings/booking_events pasa por el BFF.
const REVOKE = [
  // Ola 2a: datos personales solo por BFF.
  ['client_profiles', 'read'],
  ['client_profiles', 'create'],
  ['client_profiles', 'update'],
  ['client_profiles', 'delete'],
  ['radar_searches', 'read'],
  ['radar_searches', 'create'],
  ['radar_searches', 'update'],
  ['radar_searches', 'delete'],
  ['reviews', 'read'],
  ['reviews', 'create'],
  ['reviews', 'update'],
  ['reviews', 'delete'],
  // Ola 2b: perfil público, servicios y documentos solo por BFF.
  ['beauty_professionals', 'read'],
  ['beauty_professionals', 'create'],
  ['beauty_professionals', 'update'],
  ['beauty_professionals', 'delete'],
  ['professional_services', 'read'],
  ['professional_services', 'create'],
  ['professional_services', 'update'],
  ['professional_services', 'delete'],
  ['professional_documents', 'read'],
  ['professional_documents', 'create'],
  ['professional_documents', 'update'],
  ['professional_documents', 'delete'],
  ['bookings', 'read'],
  ['bookings', 'create'],
  ['bookings', 'update'],
  ['bookings', 'delete'],
  ['booking_events', 'read'],
  ['booking_events', 'create'],
  ['booking_events', 'update'],
  ['booking_events', 'delete'],
  // Ola 2c: archivos y usuarios solo por BFF.
  ['directus_files', 'read'],
  ['directus_files', 'create'],
  ['directus_files', 'update'],
  ['directus_files', 'delete'],
  ['directus_users', 'read'],
  ['directus_users', 'create'],
  ['directus_users', 'update'],
  ['directus_users', 'delete'],
];
for (const [collection, action] of REVOKE) {
  const q = `/permissions?filter[policy][_eq]=${appPolicy}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=100&fields=id`;
  const ex = await api('GET', q);
  if (ex.status !== 200) fail(`GET revoke ${collection} ${action}`, ex);
  for (const row of ex.data?.data ?? []) {
    const d = await api('DELETE', `/permissions/${row.id}`);
    if (![200, 204].includes(d.status)) fail(`DELETE revoke ${collection} ${action}`, d);
    console.log(`revocado: ${collection} ${action} (${row.id})`);
  }
}

// 6. Registro público asigna el rol + migrar usuarios sin rol.
// NOTA seats: esta instancia limita usuarios por licencia; si el API responde
// LIMIT_EXCEEDED, migra por SQL:
//   UPDATE directus_users SET role='<roleId>' WHERE role IS NULL;
{
  const s = await api('PATCH', '/settings', { public_registration_role: roleId });
  if (s.status !== 200) fail('PATCH settings', s);
  const g = await api('GET', '/users?filter[role][_null]=true&fields=id&limit=500');
  if (g.status !== 200) fail('GET users sin rol', g);
  const ids = (g.data?.data ?? []).map((u) => u.id);
  if (ids.length) {
    const b = await api('PATCH', '/users', { keys: ids, data: { role: roleId } });
    if (b.status !== 200 && b.status !== 204) {
      const limited = JSON.stringify(b.data).includes('LIMIT_EXCEEDED');
      console.log(
        limited
          ? `AVISO seats: no se pudo migrar por API (${ids.length} pendientes). Usa el SQL de arriba.`
          : fail('PATCH users rol', b)
      );
    } else {
      console.log(`migrados ${ids.length} usuarios al rol App User`);
    }
  }
  console.log('registro público -> rol App User');
}

// 7. Servicio de mínimo privilegio para el BFF (directus_files únicamente).
// Se crea un usuario + policy propio, admin_access/app_access false, solo CRUD sobre directus_files.
// Se genera un token estático y se guarda SOLO en el .env raíz (DIRECTUS_TOKEN).
{
  const svcEmail = 'bff-service@lookify.internal';
  let svcUser = await findByName('/users?fields=id,email&limit=1000', svcEmail);
  if (!svcUser) {
    // Intentamos encontrar por email directo
    const gu = await api('GET', `/users?filter[email][_eq]=${encodeURIComponent(svcEmail)}&fields=id,email&limit=1`);
    svcUser = gu.data?.data?.[0]?.id;
  }
  if (!svcUser) {
    const cu = await api('POST', '/users', {
      email: svcEmail,
      first_name: 'BFF',
      last_name: 'Service',
      status: 'active',
    });
    if (![200, 201, 204].includes(cu.status)) fail('POST bff-service user', cu);
    const gu2 = await api('GET', `/users?filter[email][_eq]=${encodeURIComponent(svcEmail)}&fields=id,email&limit=1`);
    svcUser = gu2.data?.data?.[0]?.id;
  }
  if (!svcUser) throw new Error('Sin usuario bff-service');

  let svcPolicy = await findByName('/policies', 'Lookify BFF Service');
  if (!svcPolicy) {
    const cp = await api('POST', '/policies', {
      name: 'Lookify BFF Service',
      app_access: false,
      admin_access: false,
      description: 'Servicio mínimo para el BFF: solo directus_files',
    });
    if (![200, 201, 204].includes(cp.status)) fail('POST bff-service policy', cp);
    svcPolicy = cp.data?.data?.id || (await findByName('/policies', 'Lookify BFF Service'));
  }
  if (!svcPolicy) throw new Error('Sin policy Lookify BFF Service');

  const sa = await api('GET', `/access?filter[policy][_eq]=${svcPolicy}&filter[user][_eq]=${svcUser}&fields=id&limit=1`);
  if (sa.status !== 200) fail('GET access bff-service', sa);
  if (!(sa.data?.data ?? []).length) {
    const ca = await api('POST', '/access', { policy: svcPolicy, user: svcUser });
    if (![200, 201, 204].includes(ca.status)) fail('POST access bff-service', ca);
  }

  for (const action of ['read', 'create', 'update', 'delete']) {
    const q = `/permissions?filter[policy][_eq]=${svcPolicy}&filter[collection][_eq]=directus_files&filter[action][_eq]=${action}&limit=1&fields=id`;
    const ex = await api('GET', q);
    if (ex.status !== 200) fail(`GET perm bff-files ${action}`, ex);
    const row = ex.data?.data?.[0];
    const payload = { policy: svcPolicy, collection: 'directus_files', action, fields: ['*'] };
    if (row) {
      const r = await api('PATCH', `/permissions/${row.id}`, payload);
      if (r.status !== 200) fail(`PATCH perm bff-files ${action}`, r);
    } else {
      const r = await api('POST', '/permissions', payload);
      if (![200, 201, 204].includes(r.status)) fail(`POST perm bff-files ${action}`, r);
    }
  }

  // Generar token estático
  const gt = await api('POST', '/users/me/tokens', { name: 'bff-service-static', expires: null });
  if (![200, 201, 204].includes(gt.status)) {
    console.log('Aviso: no se pudo generar token estático vía API (puede requerir versión/permiso). Crea uno manualmente en Directus y ponlo en .env como DIRECTUS_TOKEN.');
  } else {
    const token = gt.data?.data?.token || gt.data?.token;
    if (token) {
      const root = join(dirname(fileURLToPath(import.meta.url)), '..');
      const envPath = join(root, '.env');
      const line = `DIRECTUS_TOKEN=${token}`;
      let lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
      let replaced = false;
      lines = lines.map((l) => {
        if (/^DIRECTUS_TOKEN=/.test(l)) { replaced = true; return line; }
        return l;
      });
      if (!replaced) lines.push(line);
      writeFileSync(envPath, lines.filter((l, i, a) => l !== '' || i === a.length - 1).join('\n'));
      console.log('DIRECTUS_TOKEN escrito en .env (bff-service)');
    }
  }
  console.log('bff-service: mínimo privilegio (solo directus_files CRUD)');
}

// 8. Sincronizar EXPO_PUBLIC_APP_ROLE_ID en apps/lookify-app/.env.
// Este rol cambia por instancia; sin esto habría que copiarlo a mano y el
// registro fallaría (rol inexistente). Upsert sin tocar el resto de líneas.
{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const envPath = join(root, 'apps', 'lookify-app', '.env');
  const line = `EXPO_PUBLIC_APP_ROLE_ID=${roleId}`;
  let lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  let replaced = false;
  lines = lines.map((l) => {
    if (/^EXPO_PUBLIC_APP_ROLE_ID=/.test(l)) {
      replaced = true;
      return line;
    }
    return l;
  });
  if (!replaced) lines.push(line);
  writeFileSync(envPath, lines.filter((l, i, a) => l !== '' || i === a.length - 1).join('\n'));
  console.log(`EXPO_PUBLIC_APP_ROLE_ID=${roleId} -> apps/lookify-app/.env`);
}
console.log('PERMISSIONS OK (modelo seguro)');
