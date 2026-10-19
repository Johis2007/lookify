// Setup MVP Lookify: crea colecciones + campos + settings + permisos base.
// Uso: DIRECTUS_URL=http://localhost:8055 ADMIN_TOKEN=xxx node directus/setup.mjs
// Idempotente: omite lo que ya existe.
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error('Falta ADMIN_TOKEN');
  process.exit(1);
}
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

async function api(method, path, body) {
  const r = await fetch(URL + path, {
    method,
    headers: H,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch { /* sin body */ }
  return { status: r.status, data };
}

async function ensureCollection(name, note) {
  const cur = await api('GET', '/collections/' + name);
  if (cur.status === 200) { console.log('= collection', name); return; }
  const r = await api('POST', '/collections', {
    collection: name,
    meta: { collection: name, icon: 'star', note: note || null },
    schema: {},
  });
  console.log(r.status, 'collection', name);
  if (r.status !== 200 && r.status !== 201) throw new Error('collection ' + name + ': ' + JSON.stringify(r.data));
}

async function ensureField(collection, field) {
  const cur = await api('GET', '/fields/' + collection + '/' + field.field);
  if (cur.status === 200) return;
  const r = await api('POST', '/fields/' + collection, field);
  console.log(r.status, 'field', collection + '.' + field.field);
  if (r.status !== 200 && r.status !== 201) throw new Error('field ' + collection + '.' + field.field + ': ' + JSON.stringify(r.data));
}

const str = (field, req) => ({
  field, type: 'string',
  meta: { interface: 'input', required: !!req, width: 'half' },
});
const txt = (field) => ({
  field, type: 'text',
  meta: { interface: 'input-multiline', width: 'full' },
});
const int = (field, req) => ({
  field, type: 'integer',
  meta: { interface: 'input', required: !!req, width: 'half' },
});
const flt = (field) => ({
  field, type: 'float',
  meta: { interface: 'input', width: 'half' },
});
const dec = (field, req) => ({
  field, type: 'decimal',
  meta: { interface: 'input', required: !!req, width: 'half' },
  schema: { numeric_precision: 10, numeric_scale: 2 },
});
const boolean = (field, def) => ({
  field, type: 'boolean',
  meta: { interface: 'boolean', width: 'half' },
  schema: { default_value: def },
});
const ts = (field) => ({
  field, type: 'timestamp',
  meta: { interface: 'datetime', width: 'half' },
});
const m2oInt = (field, table, req) => ({
  field, type: 'integer',
  meta: {
    interface: 'select-dropdown-m2o', required: !!req, width: 'half',
    special: ['m2o'],
  },
  schema: { foreign_key_table: table, foreign_key_column: 'id' },
});
const m2oUuid = (field, table, req) => ({
  field, type: 'uuid',
  meta: {
    interface: 'select-dropdown-m2o', required: !!req, width: 'half',
    special: ['m2o'],
  },
  schema: { foreign_key_table: table, foreign_key_column: 'id' },
});

await ensureCollection('beauty_services', 'Catálogo de servicios');
for (const f of [
  str('name', true), str('category', false), dec('price_base', true),
  int('duration_min', true), boolean('is_active', true),
]) await ensureField('beauty_services', f);

await ensureCollection('beauty_professionals', 'Perfiles profesionales');
for (const f of [
  m2oUuid('user', 'directus_users', true),
  str('display_name', true), txt('bio'),
  m2oUuid('avatar', 'directus_files', false),
  boolean('is_online', false),
  flt('rating_avg'), str('geohash', false), flt('current_lat'), flt('current_lng'),
]) await ensureField('beauty_professionals', f);

await ensureCollection('professional_services', 'M2M profesional-servicio');
for (const f of [
  m2oInt('professional_id', 'beauty_professionals', true),
  m2oInt('service_id', 'beauty_services', true),
  dec('price_override', false),
]) await ensureField('professional_services', f);

await ensureCollection('professional_locations', 'Ubicación viva (1 fila por pro)');
for (const f of [
  m2oInt('professional_id', 'beauty_professionals', true), ts('updated_at'),
]) await ensureField('professional_locations', f);

await ensureCollection('bookings', 'Reservas on-demand');
for (const f of [
  m2oUuid('client', 'directus_users', true),
  m2oInt('professional', 'beauty_professionals', true),
  m2oInt('service', 'beauty_services', true),
  { field: 'status', type: 'string', meta: { interface: 'select-dropdown', required: true, width: 'half', options: { choices: ['pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled'].map((v) => ({ text: v, value: v })) } }, schema: { default_value: 'pending' } },
  dec('price_snapshot', true),
  str('address_text', false), flt('lat'), flt('lng'), ts('scheduled_at'),
  { field: 'created_at', type: 'timestamp', meta: { interface: 'datetime', readonly: true, width: 'half', special: ['date-created'] }, schema: {} },
]) await ensureField('bookings', f);

await ensureCollection('availability_slots', 'Disponibilidad opcional MVP');
for (const f of [
  m2oInt('professional_id', 'beauty_professionals', true),
  int('weekday', true), str('start', true), str('end', true),
]) await ensureField('availability_slots', f);

async function ensureRelation(collection, field, related) {
  const cur = await api('GET', `/relations/${collection}/${field}`);
  if (cur.status === 200) return;
  const r = await api('POST', '/relations', {
    collection, field, related_collection: related,
  });
  console.log(r.status, 'relation', `${collection}.${field} -> ${related}`);
  if (r.status !== 200 && r.status !== 201) throw new Error('relation ' + collection + '.' + field + ': ' + JSON.stringify(r.data));
}

for (const [c, f, rel] of [
  ['beauty_professionals', 'user', 'directus_users'],
  ['beauty_professionals', 'avatar', 'directus_files'],
  ['professional_services', 'professional_id', 'beauty_professionals'],
  ['professional_services', 'service_id', 'beauty_services'],
  ['professional_locations', 'professional_id', 'beauty_professionals'],
  ['bookings', 'client', 'directus_users'],
  ['bookings', 'professional', 'beauty_professionals'],
  ['bookings', 'service', 'beauty_services'],
  ['availability_slots', 'professional_id', 'beauty_professionals'],
]) await ensureRelation(c, f, rel);

// Settings: nombre + registro público (la app registra vía /users).
{
  const r = await api('PATCH', '/settings', { project_name: 'Lookify', public_registration: true });
  console.log(r.status, 'settings public_registration=true');
}

// Permisos base policy Public (sin filtros: la instancia community restringe
// custom_permission_rules). Lectura de catálogo/pros + registro vía /users.
const pub = await api('GET', "/policies?filter[name][_eq]=$t:public_label&fields=id");
const publicId = pub.data?.data?.[0]?.id;
if (publicId) {
  const grants = [
    { collection: 'beauty_services', action: 'read' },
    { collection: 'beauty_professionals', action: 'read' },
    { collection: 'directus_users', action: 'create' },
  ];
  for (const g of grants) {
    const exists = await api(
      'GET',
      `/permissions?filter[policy][_eq]=${publicId}&filter[collection][_eq]=${g.collection}&filter[action][_eq]=${g.action}&limit=1`
    );
    if (exists.data?.data?.length) { console.log('= perm public', g.collection, g.action); continue; }
    const r = await api('POST', '/permissions', {
      policy: publicId, collection: g.collection, action: g.action,
      permissions: {}, validation: null, presets: null, fields: ['*'],
    });
    console.log(r.status, 'perm public', g.collection, g.action);
  }
} else {
  console.log('WARN: sin policy Public, omito permisos');
}

console.log('SETUP OK');
