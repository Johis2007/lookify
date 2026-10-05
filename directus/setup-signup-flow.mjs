// Crea el Flow "Asignar rol App al registrarse" (idempotente).
// Como el registro público (POST /users anónimo) no pasa por registerUser,
// este Flow asigna el rol App User a cada usuario creado sin rol.
// Requiere: rol "App User" existente (ver setup-permissions.mjs).
// Uso: ADMIN_TOKEN=xxx node directus/setup-signup-flow.mjs
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error('Falta ADMIN_TOKEN'); process.exit(1); }
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };
const APP_ROLE = '74617979-3ef8-4637-a84a-39c326fd1887';
const ADMIN_ROLE = '166edd6d-ee96-45d4-8983-23be8df442ce';

async function api(method, path, body) {
  const r = await fetch(URL + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

const NAME = 'Asignar rol App al registrarse';
// Limpia duplicados previos del mismo nombre.
{
  const g = await api('GET', '/flows?fields=id,name&limit=100');
  for (const f of g.data?.data ?? []) {
    if (f.name === NAME) await api('DELETE', `/flows/${f.id}`);
  }
}
const fl = await api('POST', '/flows', {
  name: NAME,
  icon: 'person_add',
  color: '#feae2c',
  description: 'A nuevos usuarios sin rol (registro público) les asigna App User.',
  status: 'active',
  trigger: 'event',
  accountability: ADMIN_ROLE,
  options: { scope: ['items.create'], collections: ['directus_users'] },
});
const FID = fl.data?.data?.id;
if (!FID) throw new Error('No se pudo crear el flow: ' + JSON.stringify(fl.data)?.slice(0, 200));
const op1 = await api('POST', '/operations', {
  flow: FID, key: 'solo-sin-rol', type: 'condition',
  position_x: 100, position_y: 100,
  options: { filter: { role: { _null: true } } },
});
const op2 = await api('POST', '/operations', {
  flow: FID, key: 'asignar-rol', type: 'item-update',
  position_x: 340, position_y: 100,
  options: { collection: 'directus_users', id: '{{$trigger.key}}', payload: { role: APP_ROLE } },
});
const OP1 = op1.data?.data?.id;
const OP2 = op2.data?.data?.id;
if (!OP1 || !OP2) throw new Error('No se pudieron crear las operaciones');
await api('PATCH', `/operations/${OP1}`, { resolve: OP2 });
await api('PATCH', `/flows/${FID}`, { operation: OP1 });
console.log('FLOW OK:', FID);
