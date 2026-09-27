// Seed categorías + vincula servicios. Uso: DIRECTUS_URL=... ADMIN_TOKEN=... node directus/seed-categories.mjs
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN;
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };
const cats = [
  { name: 'Uñas', slug: 'unas', icon: '💅', color: '#E85D7A', is_active: true },
  { name: 'Maquillaje', slug: 'maquillaje', icon: '💄', color: '#B565D8', is_active: true },
  { name: 'Peluquería', slug: 'peluqueria', icon: '💇', color: '#E9A23B', is_active: true },
  { name: 'Barbería', slug: 'barberia', icon: '💈', color: '#3B82F6', is_active: true },
  { name: 'Skincare', slug: 'skincare', icon: '✨', color: '#22C55E', is_active: true },
];
const catIds = {};
for (const c of cats) {
  const q = await fetch(`${URL}/items/service_categories?filter[slug][_eq]=${c.slug}&limit=1`, { headers: H }).then(r => r.json());
  if (q.data?.length) { catIds[c.slug] = q.data[0].id; console.log('= cat', c.slug); continue; }
  const r = await fetch(`${URL}/items/service_categories`, { method: 'POST', headers: H, body: JSON.stringify(c) }).then(r => r.json());
  catIds[c.slug] = r.data.id; console.log('+ cat', c.slug, r.data.id);
}
const map = { 'uñas': 'unas', 'unas': 'unas', 'maquillaje': 'maquillaje', 'peluquería': 'peluqueria', 'peluqueria': 'peluqueria', 'barbería': 'barberia', 'barberia': 'barberia', 'skincare': 'skincare' };
const svcs = await fetch(`${URL}/items/beauty_services?limit=100&fields=id,category`, { headers: H }).then(r => r.json());
for (const s of svcs.data || []) {
  const slug = map[(s.category || '').toLowerCase()];
  if (slug && catIds[slug]) {
    await fetch(`${URL}/items/beauty_services/${s.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ category_id: catIds[slug] }) });
    console.log('link svc', s.id, '->', slug);
  }
}
// PostGIS: asegura geom + índice para professional_locations
console.log('OK categories. Recuerda ejecutar SQL PostGIS si falta geom:');
console.log('CREATE EXTENSION IF NOT EXISTS postgis; ALTER TABLE professional_locations ADD COLUMN IF NOT EXISTS geom geometry(Point,4326); CREATE INDEX IF NOT EXISTS idx_prof_loc_geom ON professional_locations USING GIST (geom);');
