import { before, after } from 'node:test';
import { DATABASE_URL, SECRET, maybe } from './infra.js';
import assert from 'node:assert/strict';
import pg from 'pg';
import { resolveOwnVerifiedProfessionalId } from './auth.js';

// Tests 2B-ter del lado realtime: los gates de "verificado" y "activado"
// deben aplicar en el servidor (no solo en la app). Cubre:
//  - resolveOwnVerifiedProfessionalId: solo devuelve id si el perfil est�
//    'verified' y tiene activated_at.
//  - La consulta de /realtime/nearby (id�ntica a app.ts) excluye a los
//    profesionales no verificados o sin activar aunque estan online y con GPS.

let pool: pg.Pool;
let verifiedUser: string;
let verifiedPro: number;
let inactiveUser: string;
let inactivePro: number;
let pendingUser: string;
let pendingPro: number;

before(async () => {
  if (!DATABASE_URL || !SECRET) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL });

  const mkUser = async (email: string) => {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO directus_users (id, first_name, email, status)
       VALUES (gen_random_uuid(), 'RT', $1, 'active') RETURNING id`,
      [email],
    );
    return r.rows[0].id;
  };
  const mkPro = async (userId: string, status: string, activated = status === 'verified') => {
    const r = await pool.query<{ id: number }>(
      `INSERT INTO beauty_professionals
         ("user", display_name, is_online, verification_status, activated_at)
       VALUES ($1, 'RT Pro', true, $2, CASE WHEN $3 THEN NOW() ELSE NULL END) RETURNING id`,
      [userId, status, activated],
    );
    return r.rows[0].id;
  };

  verifiedUser = await mkUser(`rt-verified-${Date.now()}@lookify.app`);
  verifiedPro = await mkPro(verifiedUser, 'verified');
  inactiveUser = await mkUser(`rt-inactive-${Date.now()}@lookify.app`);
  inactivePro = await mkPro(inactiveUser, 'verified', false);
  pendingUser = await mkUser(`rt-pending-${Date.now()}@lookify.app`);
  pendingPro = await mkPro(pendingUser, 'pending');

  // Todos reportan GPS (una ubicaci�n cualquiera) para probar el filtro.
  for (const pid of [verifiedPro, inactivePro, pendingPro]) {
    await pool.query(
      `INSERT INTO professional_locations (professional_id, geom, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(-74.0721, 4.7110),4326), NOW())
       ON CONFLICT (professional_id) DO UPDATE SET geom=EXCLUDED.geom, updated_at=NOW()`,
      [pid],
    );
  }
});

after(async () => {
  if (!DATABASE_URL || !SECRET) return;
  await pool.query('DELETE FROM professional_locations WHERE professional_id = ANY($1)', [
    [verifiedPro, inactivePro, pendingPro],
  ]);
  await pool.query('DELETE FROM beauty_professionals WHERE "user" = ANY($1)', [
    [verifiedUser, inactiveUser, pendingUser],
  ]);
  await pool.query('DELETE FROM directus_users WHERE id = ANY($1)', [
    [verifiedUser, inactiveUser, pendingUser],
  ]);
  await pool.end();
});

maybe('resolveOwnVerifiedProfessionalId: activo -> id, inactivo/pending -> null', async () => {
  const v = await resolveOwnVerifiedProfessionalId(pool, verifiedUser);
  assert.equal(v, verifiedPro);
  const i = await resolveOwnVerifiedProfessionalId(pool, inactiveUser);
  assert.equal(i, null);
  const p = await resolveOwnVerifiedProfessionalId(pool, pendingUser);
  assert.equal(p, null);
});

maybe('/realtime/nearby excluye profesionales no verificados', async () => {
  // Consulta idéntica a la de index.ts (mismo filtro de verificación).
  const { rows } = await pool.query(
    `SELECT pl.professional_id
       FROM professional_locations pl
       JOIN beauty_professionals bp ON bp.id = pl.professional_id
      WHERE bp.is_online = true
        AND bp.verification_status = 'verified'
        AND bp.activated_at IS NOT NULL
        AND ST_DWithin(pl.geom::geography, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, $3)
      LIMIT 50`,
    [4.711, -74.0721, 5000],
  );
  const ids = rows.map((r) => r.professional_id);
  assert.ok(ids.includes(verifiedPro), 'debe incluir al pro verificado y activo');
  assert.ok(!ids.includes(inactivePro), 'NO debe incluir al pro verificado sin activar');
  assert.ok(!ids.includes(pendingPro), 'NO debe incluir al pro en pending');
});

maybe('batch GPS: solo persiste ubicación de profesionales verificados', async () => {
  // Igual que el batch de index.ts: el INSERT ... SELECT ... WHERE EXISTS solo
  // escribe si el pro está verificado. Probamos con un pro en pending.
  for (const target of [pendingPro, inactivePro]) {
    await pool.query('DELETE FROM professional_locations WHERE professional_id = $1', [target]);
    await pool.query(
      `INSERT INTO professional_locations (professional_id, geom, updated_at)
       SELECT $1, ST_SetSRID(ST_MakePoint($2,$3),4326), NOW()
       WHERE EXISTS (
         SELECT 1 FROM beauty_professionals
         WHERE id = $1 AND verification_status = 'verified' AND activated_at IS NOT NULL
       )
       ON CONFLICT (professional_id) DO UPDATE SET geom=EXCLUDED.geom, updated_at=NOW()`,
      [target, -74.0721, 4.711],
    );
    const after1 = await pool.query('SELECT 1 FROM professional_locations WHERE professional_id = $1', [
      target,
    ]);
    assert.equal(after1.rowCount, 0, 'un pro inactivo/pending no debe tener ubicacion persistida');
  }
});
