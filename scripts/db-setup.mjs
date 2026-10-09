// db:setup — aplica el esquema Directus vía API en el orden correcto.
// Idempotente: cada script omite lo que ya existe.
//   1. setup.mjs               (colecciones base + registro público)
//   2. setup-lookify-full.mjs  (clientes, categorías, radar, reviews, verificación…)
//   3. setup-permissions.mjs   (rol App User + matriz de permisos segura)
//   4. setup-signup-flow.mjs   (flow: asigna rol App al registrarse)
// Uso: npm run db:setup   (después de: docker compose up -d postgres redis directus)
// Requiere ADMIN_TOKEN o ADMIN_EMAIL/ADMIN_PASSWORD (del .env raíz).
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from './dotenv-mini.mjs';

loadRootEnv(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';

async function waitReady(tries = 60) {
  for (let i = 1; i <= tries; i++) {
    try {
      // /server/ping es el liveness público (/server/health da 403 con
      // permisos endurecidos).
      const r = await fetch(`${URL}/server/ping`);
      if (r.ok && (await r.text()).includes('pong')) {
        console.log(`Directus listo (${i} intento(s))`);
        return;
      }
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.error(`Directus no responde en ${URL}. ¿Levantaste la infra? (docker compose up -d postgres redis directus)`);
  process.exit(1);
}

async function resolveToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
  if (!email || !password) {
    console.error('Falta ADMIN_TOKEN y no hay ADMIN_EMAIL/ADMIN_PASSWORD en el .env');
    process.exit(1);
  }
  const r = await fetch(`${URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.data?.access_token) {
    console.error(`Login admin falló (${r.status}). Verifica ADMIN_EMAIL/ADMIN_PASSWORD.`);
    process.exit(1);
  }
  console.log('Auth: login admin OK (token de sesión)');
  return j.data.access_token;
}

await waitReady();
const token = await resolveToken();
const env = { ...process.env, DIRECTUS_URL: URL, ADMIN_TOKEN: token };

for (const script of [
  'directus/setup.mjs',
  'directus/setup-lookify-full.mjs',
  'directus/setup-permissions.mjs',
  'directus/setup-signup-flow.mjs',
]) {
  console.log(`\n=== ${script} ===`);
  const r = spawnSync(process.execPath, [join(root, script)], { stdio: 'inherit', env });
  if (r.status !== 0) {
    console.error(`Falló ${script} (exit ${r.status}). Corrige el error y reintenta: es idempotente.`);
    process.exit(r.status ?? 1);
  }
}
console.log('\nDB:SETUP OK — esquema, roles, permisos y flows listos');
