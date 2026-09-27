// Setup FULL Lookify — cubre las 12 pantallas Stitch.
// Uso: DIRECTUS_URL=http://localhost:8055 ADMIN_TOKEN=xxx node directus/setup-lookify-full.mjs
// Idempotente. Extiende setup.mjs base + colecciones para:
//  - Registro y Onboarding (client_profiles)
//  - Selección Servicios + Servicios y tarifas (service_categories + extends beauty_services)
//  - Búsqueda Radar y Match (radar_searches)
//  - Seguimiento en Vivo (booking_events)
//  - Calificación y Resumen (reviews)
//  - Verificación Profesionales (professional_documents + verification_status)
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error('Falta ADMIN_TOKEN'); process.exit(1); }
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

async function api(method, path, body) {
  const r = await fetch(URL + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function ensureCollection(name, note) {
  const cur = await api('GET', '/collections/' + name);
  if (cur.status === 200) { console.log('= collection', name); return; }
  const r = await api('POST', '/collections', { collection: name, meta: { collection: name, icon: 'star', note: note || null }, schema: {} });
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
async function ensureRelation(collection, field, related) {
  const cur = await api('GET', `/relations/${collection}/${field}`);
  if (cur.status === 200) return;
  const r = await api('POST', '/relations', { collection, field, related_collection: related });
  console.log(r.status, 'relation', `${collection}.${field} -> ${related}`);
}

const str = (field, req) => ({ field, type: 'string', meta: { interface: 'input', required: !!req, width: 'half' } });
const txt = (field) => ({ field, type: 'text', meta: { interface: 'input-multiline', width: 'full' } });
const int = (field, req) => ({ field, type: 'integer', meta: { interface: 'input', required: !!req, width: 'half' } });
const flt = (field) => ({ field, type: 'float', meta: { interface: 'input', width: 'half' } });
const dec = (field, req) => ({ field, type: 'decimal', meta: { interface: 'input', required: !!req, width: 'half' }, schema: { numeric_precision: 10, numeric_scale: 2 } });
const boolean = (field, def) => ({ field, type: 'boolean', meta: { interface: 'boolean', width: 'half' }, schema: { default_value: def } });
const ts = (field) => ({ field, type: 'timestamp', meta: { interface: 'datetime', width: 'half' } });
const created = () => ({ field: 'created_at', type: 'timestamp', meta: { interface: 'datetime', readonly: true, width: 'half', special: ['date-created'] }, schema: {} });
const m2oInt = (field, table, req) => ({ field, type: 'integer', meta: { interface: 'select-dropdown-m2o', required: !!req, width: 'half', special: ['m2o'] }, schema: { foreign_key_table: table, foreign_key_column: 'id' } });
const m2oUuid = (field, table, req) => ({ field, type: 'uuid', meta: { interface: 'select-dropdown-m2o', required: !!req, width: 'half', special: ['m2o'] }, schema: { foreign_key_table: table, foreign_key_column: 'id' } });
const statusField = (field, choices, def) => ({ field, type: 'string', meta: { interface: 'select-dropdown', required: true, width: 'half', options: { choices: choices.map((v) => ({ text: v, value: v })) } }, schema: { default_value: def || choices[0] } });

// ---------- 1. service_categories (Admin Servicios y tarifas / Selección Servicios) ----------
await ensureCollection('service_categories', 'Categorías: uñas, maquillaje, peluquería, barbería, skincare');
for (const f of [str('name', true), str('slug', true), str('icon', false), str('color', false), boolean('is_active', true)]) await ensureField('service_categories', f);

// ---------- 2. client_profiles (Registro y Onboarding cliente) ----------
await ensureCollection('client_profiles', 'Perfil cliente: onboarding + avatar + ubicación base');
for (const f of [
  m2oUuid('user', 'directus_users', true),
  str('display_name', true), str('phone', false),
  m2oUuid('avatar', 'directus_files', false),
  str('address_text', false), flt('lat'), flt('lng'),
]) await ensureField('client_profiles', f);
await ensureField('client_profiles', created());
for (const [c, f, rel] of [['client_profiles', 'user', 'directus_users'], ['client_profiles', 'avatar', 'directus_files']]) await ensureRelation(c, f, rel);

// ---------- 3. Extiende beauty_professionals (Verificación + ficha pro) ----------
for (const f of [
  statusField('verification_status', ['pending', 'verified', 'rejected'], 'pending'),
  txt('verification_note'),
  int('years_exp', false),
  txt('specialties'),
  str('phone', false),
]) await ensureField('beauty_professionals', f);

// ---------- 4. Extiende beauty_services (tarifas + imagen) ----------
for (const f of [txt('description'), m2oInt('category_id', 'service_categories', false), boolean('is_featured', false)]) await ensureField('beauty_services', f);
await ensureRelation('beauty_services', 'category_id', 'service_categories');
// avatar imagen servicio via directus_files
await ensureField('beauty_services', m2oUuid('image', 'directus_files', false));
await ensureRelation('beauty_services', 'image', 'directus_files');

// ---------- 5. Extiende bookings (resumen + tracking + calificación inline) ----------
for (const f of [
  str('cancel_reason', false), int('eta_min', false),
  int('rating', false), txt('review_comment'),
  { field: 'completed_at', type: 'timestamp', meta: { interface: 'datetime', width: 'half' } },
  str('payment_method', false),
]) await ensureField('bookings', f);

// ---------- 6. reviews (Calificación y Resumen) ----------
await ensureCollection('reviews', 'Calificaciones 1-5 por booking completado');
for (const f of [
  m2oInt('booking', 'bookings', true),
  m2oUuid('client', 'directus_users', true),
  m2oInt('professional', 'beauty_professionals', true),
  int('rating', true), txt('comment'),
]) await ensureField('reviews', f);
await ensureField('reviews', created());
for (const [c, f, rel] of [['reviews', 'booking', 'bookings'], ['reviews', 'client', 'directus_users'], ['reviews', 'professional', 'beauty_professionals']]) await ensureRelation(c, f, rel);

// ---------- 7. professional_documents (Verificación de Profesionales) ----------
await ensureCollection('professional_documents', 'DNI / títulos / certificados para verificación admin');
for (const f of [
  m2oInt('professional', 'beauty_professionals', true),
  m2oUuid('file', 'directus_files', true),
  statusField('doc_type', ['dni', 'titulo', 'certificado', 'portafolio', 'otro'], 'dni'),
  statusField('status', ['pending', 'verified', 'rejected'], 'pending'),
  txt('note'),
]) await ensureField('professional_documents', f);
await ensureField('professional_documents', created());
for (const [c, f, rel] of [['professional_documents', 'professional', 'beauty_professionals'], ['professional_documents', 'file', 'directus_files']]) await ensureRelation(c, f, rel);

// ---------- 8. booking_events (Seguimiento en Vivo timeline) ----------
await ensureCollection('booking_events', 'Timeline GPS + cambios estado por reserva');
for (const f of [
  m2oInt('booking', 'bookings', true),
  statusField('status', ['pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled', 'location'], 'location'),
  flt('lat'), flt('lng'), txt('note'),
]) await ensureField('booking_events', f);
await ensureField('booking_events', created());
await ensureRelation('booking_events', 'booking', 'bookings');

// ---------- 9. radar_searches (Búsqueda Radar y Match) ----------
await ensureCollection('radar_searches', 'Historial radar cliente: radio + match');
for (const f of [
  m2oUuid('client', 'directus_users', true),
  flt('lat'), flt('lng'), int('radius_m', true),
  m2oInt('service', 'beauty_services', false),
  statusField('status', ['pending', 'matched', 'cancelled', 'expired'], 'pending'),
  m2oInt('matched_professional', 'beauty_professionals', false),
]) await ensureField('radar_searches', f);
await ensureField('radar_searches', created());
for (const [c, f, rel] of [['radar_searches', 'client', 'directus_users'], ['radar_searches', 'service', 'beauty_services'], ['radar_searches', 'matched_professional', 'beauty_professionals']]) await ensureRelation(c, f, rel);

// ---------- Permisos Public: catálogo + categorías ----------
{
  const pub = await api('GET', "/policies?filter[name][_eq]=$t:public_label&fields=id");
  const publicId = pub.data?.data?.[0]?.id;
  if (publicId) {
    for (const col of ['service_categories', 'beauty_services', 'beauty_professionals']) {
      const exists = await api('GET', `/permissions?filter[policy][_eq]=${publicId}&filter[collection][_eq]=${col}&filter[action][_eq]=read&limit=1`);
      if (exists.data?.data?.length) { console.log('= perm public', col, 'read'); continue; }
      await api('POST', '/permissions', { policy: publicId, collection: col, action: 'read', permissions: {}, validation: null, presets: null, fields: ['*'] });
      console.log('perm public', col, 'read');
    }
  }
}

console.log('SETUP FULL OK — 12 pantallas cubiertas');
