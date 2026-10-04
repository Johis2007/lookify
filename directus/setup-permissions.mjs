// Modelo SEGURO de permisos Lookify (reemplaza el DEV abierto).
// LÍMITES DE LA INSTANCIA (licencia Core gratuita):
// - Solo reglas estáticas (collection+action+fields ['*']). Todo lo dinámico
//   ($CURRENT_USER, presets, validation, recorte de campos) responde 403.
// - SEATS = 3: cada usuario con rol admin o App User ocupa uno. Superado el
//   tope, crear usuarios (registro) falla con LIMIT_EXCEEDED. Solución real:
//   licencia Directus (también desbloquea reglas granulares).
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
let appPolicy;
{
  appPolicy = await findByName('/policies', 'Lookify App');
  if (!appPolicy) {
    const c = await api('POST', '/policies', { name: 'Lookify App', app_access: true, admin_access: false, description: 'Permisos granulares de la app ($CURRENT_USER)' });
    if (c.status !== 200 && c.status !== 201 && c.status !== 204) fail('POST policies', c);
    appPolicy = c.data?.data?.id || (await findByName('/policies', 'Lookify App'));
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
  ['beauty_professionals', 'read'],
  ['professional_services', 'read'],
  // Perfil profesional (flujos propios; alcance por fila: residual).
  ['beauty_professionals', 'create'],
  ['beauty_professionals', 'update'],
  // Reservas (flujos cliente/pro/admin; alcance por fila: residual).
  ['bookings', 'read'],
  ['bookings', 'create'],
  ['bookings', 'update'],
  // Reseñas: ver y crear.
  ['reviews', 'read'],
  ['reviews', 'create'],
  // Radar + eventos.
  ['radar_searches', 'create'],
  ['booking_events', 'create'],
  ['booking_events', 'read'],
  // Servicios del profesional (precios visibles; vínculo propio).
  ['professional_services', 'create'],
  ['professional_services', 'update'],
  // Archivos: subir avatar y ver (URLs del marketplace).
  ['directus_files', 'create'],
  ['directus_files', 'read'],
  // Usuarios: lectura autenticada (Directus nunca expone password/token).
  // (Sin reglas por fila: cualquier autenticado podría enumerar id/nombre/
  // email. Residual documentado; mitigación real: licencia o endpoint propio.)
  ['directus_users', 'read'],
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
console.log('PERMISSIONS OK (modelo seguro)');
