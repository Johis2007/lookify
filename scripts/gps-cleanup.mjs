// db:cleanup:gps — borra el histórico GPS de tracking más viejo que N días.
// Retención propuesta: 30 días (GPS_RETENTION_DAYS o --days N).
// Uso: npm run db:cleanup:gps [-- --days 30]
// Programar con cron/Task Scheduler en producción; en dev se corre a mano.
import { loadRootEnv } from './dotenv-mini.mjs';
import pg from 'pg';

loadRootEnv(import.meta.url);

const argDays = process.argv.find((a) => a.startsWith('--days='));
const envDays = process.env.GPS_RETENTION_DAYS;
const days = Number(argDays ? argDays.split('=')[1] : envDays ?? 30);
if (!Number.isInteger(days) || days <= 0) {
  console.error('GPS_RETENTION_DAYS/--days debe ser un entero positivo.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en el .env raíz.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rowCount } = await pool.query(
    `DELETE FROM booking_location_history
      WHERE recorded_at < NOW() - ($1::int * interval '1 day')`,
    [days],
  );
  console.log(`GPS cleanup OK — ${rowCount ?? 0} muestra(s) con más de ${days} días eliminadas.`);
} catch (e) {
  console.error(`GPS cleanup falló: ${e?.message || e}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
