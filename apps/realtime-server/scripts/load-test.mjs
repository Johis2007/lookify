// Fase 6: test de carga — 100 conexiones Socket.io simultáneas + p95 de /realtime/nearby.
// Fase 7: todo autenticado (login admin) y con reservas REALES en Directus.
// Uso: npm --workspace apps/realtime-server run load:test
// Env: DIRECTUS_URL, LOAD_EMAIL, LOAD_PASSWORD (defaults = admin local).
// Criterio DONE roadmap: p95 geo-query <300ms, sin errores con 100 conexiones.
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:4001';
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const EMAIL = process.env.LOAD_EMAIL || 'admin@lookify.app';
const PASSWORD = process.env.LOAD_PASSWORD || 'Lookify123!';
const N = Number(process.env.LOAD_N || 100);
const P95_BUDGET_MS = Number(process.env.P95_BUDGET_MS || 300);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, token, init) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Directus ${path}: HTTP ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

// 0. Login admin -> token para sockets + HTTP + fixtures.
console.log('Login en Directus...');
const login = await api('/auth/login', null, {
  method: 'POST',
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, mode: 'json' }),
});
const TOKEN = login.data.access_token;
const me = await api('/users/me?fields=id', TOKEN);
const ADMIN_ID = me.data.id;
const pro = await api('/items/beauty_professionals?limit=1&fields=id', TOKEN);
const svc = await api('/items/beauty_services?limit=1&fields=id', TOKEN);
if (!pro.data?.length || !svc.data?.length) {
  throw new Error('Sin fixtures: crea 1 beauty_professionals y 1 beauty_services en Directus');
}
console.log(`OK login (admin ${ADMIN_ID}), fixtures pro=${pro.data[0].id} svc=${svc.data[0].id}`);

// 0b. 10 reservas reales para el relay (se borran al final).
const bookingIds = [];
for (let r = 0; r < 10; r++) {
  const b = await api('/items/bookings', TOKEN, {
    method: 'POST',
    body: JSON.stringify({
      client: ADMIN_ID,
      professional: pro.data[0].id,
      service: svc.data[0].id,
      status: 'pending',
    }),
  });
  bookingIds.push(b.data.id);
}
console.log(`OK ${bookingIds.length} reservas de prueba creadas`);

function connect(i) {
  return new Promise((resolve, reject) => {
    const s = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
      auth: { token: TOKEN },
    });
    const to = setTimeout(() => { s.disconnect(); reject(new Error(`cli${i} connect timeout`)); }, 11000);
    s.on('connect', () => { clearTimeout(to); resolve(s); });
    s.on('connect_error', (e) => { clearTimeout(to); reject(new Error(`cli${i} ${e.message}`)); });
  });
}

let sockets = [];
try {
  // 1. 100 conexiones simultáneas (autenticadas)
  console.log(`Conectando ${N} clientes...`);
  const tConn0 = Date.now();
  sockets = await Promise.all(Array.from({ length: N }, (_, i) => connect(i)));
  console.log(`OK ${sockets.length}/${N} conectados en ${Date.now() - tConn0}ms`);

  // 2. join + status relay bajo carga (10 rooms reales, 10 watchers cada una)
  let relayOk = 0;
  const watchers = [];
  for (let r = 0; r < 10; r++) {
    const bid = String(bookingIds[r]);
    for (let k = 0; k < 10; k++) {
      const s = sockets[r * 10 + k];
      s.emit('booking:join', { booking_id: bid });
      watchers.push(new Promise((resolve) => {
        const h = (p) => {
          if (String(p?.booking_id) === bid && p?.status === 'in_progress') { s.off('booking:status', h); resolve(true); }
        };
        s.on('booking:status', h);
        setTimeout(() => { s.off('booking:status', h); resolve(false); }, 8000);
      }));
    }
  }
  await sleep(500);
  for (let r = 0; r < 10; r++) sockets[r].emit('booking:status', { booking_id: String(bookingIds[r]), status: 'in_progress' });
  const results = await Promise.all(watchers);
  relayOk = results.filter(Boolean).length;
  console.log(`Relay booking:status: ${relayOk}/${watchers.length} recibidos`);
  if (relayOk < watchers.length * 0.95) throw new Error(`relay insuficiente: ${relayOk}/${watchers.length}`);

  // 3. p95 de geo-query (100 requests secuenciales para no mezclar con socket)
  const lat = [];
  for (let i = 0; i < 100; i++) {
    const t0 = Date.now();
    const res = await fetch(`${SOCKET_URL}/realtime/nearby?lat=19.4326&lng=-99.1332&radius=5000&limit=20`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`nearby HTTP ${res.status}`);
    await res.json();
    lat.push(Date.now() - t0);
  }
  lat.sort((a, b) => a - b);
  const p50 = percentile(lat, 50);
  const p95 = percentile(lat, 95);
  const pmax = lat[lat.length - 1];
  console.log(`nearby latencia: p50=${p50}ms p95=${p95}ms max=${pmax}ms (budget p95<${P95_BUDGET_MS}ms)`);
  if (p95 >= P95_BUDGET_MS) throw new Error(`p95 ${p95}ms supera budget ${P95_BUDGET_MS}ms`);

  console.log(`LOAD TEST PASS: ${N} conexiones sin errores, relay ${relayOk}/${watchers.length}, p95=${p95}ms`);
} finally {
  for (const s of sockets) s.disconnect();
  // Limpieza: borra las reservas de prueba.
  for (const id of bookingIds) {
    try {
      await fetch(`${DIRECTUS_URL}/items/bookings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
    } catch { /* best-effort */ }
  }
  console.log('Reservas de prueba eliminadas');
}
process.exit(0);

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
