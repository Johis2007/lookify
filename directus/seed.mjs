// Seed MVP: crea catálogo base de beauty_services en Directus.
// Uso: DIRECTUS_URL=http://localhost:8055 ADMIN_TOKEN=xxx node directus/seed.mjs
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error('Falta ADMIN_TOKEN (Directus > User > Token)');
  process.exit(1);
}
const services = [
  { name: 'Manicura clásica', category: 'uñas', price_base: 250, duration_min: 45, is_active: true },
  { name: 'Uñas acrílicas', category: 'uñas', price_base: 450, duration_min: 90, is_active: true },
  { name: 'Maquillaje social', category: 'maquillaje', price_base: 600, duration_min: 60, is_active: true },
  { name: 'Corte + peinado', category: 'peluquería', price_base: 350, duration_min: 60, is_active: true },
  { name: 'Barba + corte', category: 'barbería', price_base: 300, duration_min: 45, is_active: true },
  { name: 'Limpieza facial', category: 'skincare', price_base: 500, duration_min: 60, is_active: true },
];
for (const s of services) {
  const r = await fetch(`${URL}/items/beauty_services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(s),
  });
  console.log(r.status, s.name);
}
