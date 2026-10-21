import type pg from 'pg';

// Helpers de transacción del BFF. El Pool lo crea index.ts (una sola fuente de
// conexión, compartida con el socket) y se inyecta aquí.

// Ejecuta fn dentro de una transacción, con commit/rollback garantizados.
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Si el rollback falla, propagamos el error original.
    }
    throw e;
  } finally {
    client.release();
  }
}
