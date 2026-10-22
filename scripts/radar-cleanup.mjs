// db:cleanup:radar — borra el historial de radar_searches más viejo que N días.
// Retención propuesta: 90 días (RADAR_RETENTION_DAYS o --days N). Es analítica
// interna: el App User ya no tiene acceso directo a esta colección.
// Uso: npm run db:cleanup:radar [-- --days 90]
import { loadRootEnv } from './dotenv-mini.mjs';
import pg from 'pg';

loadRootEnv(import.meta.url);

const argDays = process.argv.find((a) => a.startsWith('--days='));
const envDays = process.env.RADAR_RETENTION_DAYS;
const days = Number(argDays ? argDays.split('=')[1] : envDays ?? 90);
if (!Number.isInteger(days) || days <= 0) {
  console.error('RADAR_RETENTION_DAYS/--days debe ser un entero positivo.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en el .env raíz.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rowCount } = await pool.query(
    `DELETE FROM radar_searches
      WHERE created_at < NOW() - ($1::int * interval '1 day')`,
    [days],
  );
  console.log(`Radar cleanup OK — ${rowCount ?? 0} búsqueda(s) con más de ${days} días eliminadas.`);
} catch (e) {
  console.error(`Radar cleanup falló: ${e?.message || e}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
