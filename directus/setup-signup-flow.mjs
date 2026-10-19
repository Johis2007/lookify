// Crea el Flow "Asignar rol App al registrarse" (idempotente).
// Como el registro público (POST /users anónimo) no pasa por registerUser,
// este Flow asigna el rol App User a cada usuario creado sin rol.
// Requiere: rol "App User" existente (ver setup-permissions.mjs).
// Uso: ADMIN_TOKEN=xxx node directus/setup-signup-flow.mjs
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error('Falta ADMIN_TOKEN'); process.exit(1); }
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

// Los IDs de rol cambian en cada instancia: se resuelven por nombre en vez de
// ir hardcodeados (en otro entorno los UUID son distintos y el flow quedaría roto).
async function api(method, path, body) {
  const r = await fetch(URL + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function findRoleId(filterDesc, filterQs) {
  const g = await api('GET', `/roles?${filterQs}&fields=id&limit=5`);
  const id = g.data?.data?.[0]?.id;
  if (!id) throw new Error(`No se encontró el rol (${filterDesc}). ¿Corriste setup-permissions.mjs antes?`);
  return id;
}

// El flag admin_access vive en policies (no en roles): el rol admin se
// resuelve por nombre "Administrator" o, en su defecto, por el access que
// apunta a una policy con admin_access=true.
async function findAdminRoleId() {
  const byName = await api('GET', '/roles?filter[name][_eq]=Administrator&fields=id&limit=1');
  if (byName.data?.data?.[0]?.id) return byName.data.data[0].id;
  const pol = await api('GET', '/policies?filter[admin_access][_eq]=true&fields=id&limit=5');
  for (const p of pol.data?.data ?? []) {
    const acc = await api('GET', `/access?filter[policy][_eq]=${p.id}&fields=role&limit=5`);
    const role = (acc.data?.data ?? []).find((a) => a.role)?.role;
    if (role) return role;
  }
  throw new Error('No se encontró el rol admin (ni por nombre ni por policy).');
}

const APP_ROLE = await findRoleId('App User', 'filter[name][_eq]=App User');
const ADMIN_ROLE = await findAdminRoleId();
console.log('roles:', { APP_ROLE, ADMIN_ROLE });

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
