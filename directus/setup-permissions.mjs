// Permisos DEV abiertos (reglas granulares restringidas en esta instancia:
// "custom_permission_rules_enabled is a restricted resource").
// SOLO para desarrollo local. En prod: roles client/professional + reglas $CURRENT_USER.
// Uso: DIRECTUS_URL=http://localhost:8055 ADMIN_TOKEN=xxx node directus/setup-permissions.mjs
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error('Falta ADMIN_TOKEN'); process.exit(1); }
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

async function api(method, path, body) {
  const r = await fetch(URL + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

const pub = await api('GET', '/policies?filter[name][_eq]=$t:public_label&fields=id');
const publicId = pub.data?.data?.[0]?.id;
if (!publicId) throw new Error('Sin policy Public');

const wants = [
  ['beauty_services', 'read'], ['beauty_professionals', 'read'], ['service_categories', 'read'],
  ['beauty_professionals', 'create'], ['beauty_professionals', 'update'],
  ['bookings', 'create'], ['bookings', 'read'], ['bookings', 'update'],
  ['reviews', 'create'], ['reviews', 'read'],
  ['radar_searches', 'create'], ['radar_searches', 'read'], ['radar_searches', 'update'],
  ['booking_events', 'create'], ['booking_events', 'read'],
  ['client_profiles', 'create'], ['client_profiles', 'read'], ['client_profiles', 'update'],
  ['professional_documents', 'create'], ['professional_documents', 'read'],
  ['professional_services', 'read'], ['professional_services', 'create'],
  ['availability_slots', 'read'], ['availability_slots', 'create'],
  ['professional_locations', 'read'],
  ['directus_files', 'create'], ['directus_files', 'read'],
  ['directus_users', 'create'],
];

for (const [collection, action] of wants) {
  const q = `/permissions?filter[policy][_eq]=${publicId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1&fields=id`;
  const ex = await api('GET', q);
  const row = ex.data?.data?.[0];
  const payload = { policy: publicId, collection, action, permissions: {}, validation: null, presets: null, fields: ['*'] };
  if (row) {
    const r = await api('PATCH', `/permissions/${row.id}`, payload);
    console.log(r.status, '= ', collection, action);
  } else {
    const r = await api('POST', '/permissions', payload);
    console.log(r.status, '+', collection, action, r.status !== 200 && r.status !== 201 ? JSON.stringify(r.data) : '');
  }
}
console.log('PERMISSIONS OK (DEV abierto)');
