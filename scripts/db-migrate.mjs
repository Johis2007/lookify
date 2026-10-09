// db:migrate — aplica el SQL de directus/migrations/ en el postgres del compose.
// Idempotente: todos los archivos usan IF NOT EXISTS.
// ORDEN: correr DESPUÉS de `npm run db:setup` (las tablas las crea Directus vía API).
// Uso: npm run db:migrate   (con la infra arriba: docker compose up -d postgres)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from './dotenv-mini.mjs';

loadRootEnv(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_USER = process.env.DB_USER || 'lookify';
const DB_NAME = process.env.DB_DATABASE || 'lookify';
const FILES = ['directus/migrations/001_postgis.sql', 'directus/migrations/002_constraints.sql'];

for (const file of FILES) {
  console.log(`=== ${file} ===`);
  const sql = readFileSync(join(root, file), 'utf8');
  const r = spawnSync(
    'docker',
    [
      'compose', 'exec', '-T', 'postgres',
      'psql', '-U', DB_USER, '-d', DB_NAME,
      '-v', 'ON_ERROR_STOP=1',
    ],
    { input: sql, stdio: ['pipe', 'inherit', 'inherit'], cwd: root }
  );
  if (r.status !== 0) {
    console.error(`Falló ${file}. ¿Está arriba postgres? (docker compose up -d postgres)`);
    process.exit(r.status ?? 1);
  }
}
console.log('DB:MIGRATE OK — PostGIS + constraints aplicados');
