import type pg from 'pg';

// Modelo "claim": reserva sin profesional asignado que se ofrece a candidatos
// cercanos. Ronda 1 = 3 km; ronda 2 = 6 km.
//
// Reglas de avance (4A-bis):
// - Si en una ronda NO hay candidatos, se pasa de inmediato a la ronda
//   siguiente (sin esperar al vencimiento).
// - Si en una ronda TODOS los candidatos rechazan, se avanza de inmediato.
// - Si la ronda 2 tampoco tiene candidatos, la reserva queda 'expired' sin
//   esperar.
//
// Todas las transiciones (ronda y expiración) son ATÓMICAS: se hacen con
// `UPDATE ... WHERE <estado esperado> ... RETURNING` dentro de una
// transacción, y el barrido reclama las reservas vencidas con
// `FOR UPDATE SKIP LOCKED`. Así dos barridos simultáneos nunca procesan la
// misma reserva (ni duplican eventos ni ofertas).

export const MATCH_RADIUS_M = [3000, 6000] as const;
export const MATCH_OFFER_TTL_MS = 60_000;
export const MATCH_MAX_CANDIDATES = 5;
export const MATCH_SWEEP_INTERVAL_MS = 10_000;
/** Rondas de difusión (1 = 3 km, 2 = 6 km). */
export const MATCH_MAX_ROUNDS = MATCH_RADIUS_M.length;

export type Candidate = { professional_id: number; distance_m: number };

// Estado mínimo de la reserva para decidir la ronda y los excluidos.
export type MatchBooking = {
  id: number;
  client: string;
  service: number | null;
  lat: number | null;
  lng: number | null;
  match_round: number;
  /** Profesionales ya ofertados en rondas anteriores (no se re-ofertan). */
  offered: number[];
};

export type MatchResult =
  | { tipo: 'ronda'; ronda: number; ofertas: number[] }
  | { tipo: 'expirada' }
  | { tipo: 'nada' };

export type MatchSweepDeps = {
  pool: pg.Pool;
  // Avisa a un candidato de una nueva oferta (room prof:{id}).
  emitOffer?: (bookingId: number, professionalId: number, clientId: string) => void;
  // Avisa al cliente que la reserva expiró.
  emitExpired?: (bookingId: number, clientId: string) => void;
};

// Candidatos elegibles para una reserva en una ronda: verificados, online,
// ofrecen el servicio, dentro del radio, no ofrecidos antes, más cercanos.
export async function findCandidates(
  pool: pg.Pool,
  serviceId: number | null,
  lat: number,
  lng: number,
  radiusM: number,
  excludeProfessionalIds: number[] = [],
): Promise<Candidate[]> {
  if (serviceId === null) return [];
  const { rows } = await pool.query<Candidate>(
    `SELECT bp.id AS professional_id,
            ST_Distance(pl.geom::geography, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography) AS distance_m
       FROM beauty_professionals bp
       JOIN professional_locations pl ON pl.professional_id = bp.id
       JOIN professional_services ps ON ps.professional_id = bp.id AND ps.service_id = $3
      WHERE bp.is_online = true
        AND bp.verification_status = 'verified'
        AND NOT (bp.id = ANY($6::int[]))
        AND ST_DWithin(pl.geom::geography, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, $4)
      ORDER BY distance_m ASC
      LIMIT $5`,
    [lat, lng, serviceId, radiusM, MATCH_MAX_CANDIDATES, excludeProfessionalIds],
  );
  return rows.map((r) => ({ professional_id: Number(r.professional_id), distance_m: Number(r.distance_m) }));
}

// Registra los candidatos de una ronda y devuelve los ids ofertados.
export async function offerToCandidates(
  client: pg.Pool | pg.PoolClient,
  bookingId: number,
  round: number,
  candidates: Candidate[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const c of candidates) {
    const { rowCount } = await client.query(
      `INSERT INTO booking_candidates (booking_id, professional_id, round, distance_m, status, created_at)
       VALUES ($1,$2,$3,$4,'offered',NOW())
       ON CONFLICT (booking_id, professional_id, round) DO NOTHING`,
      [bookingId, c.professional_id, round, c.distance_m],
    );
    if (rowCount && rowCount > 0) ids.push(c.professional_id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Transiciones atómicas
// ---------------------------------------------------------------------------

// Paso de ronda: solo gana quien vea la ronda esperada. `RETURNING` + el
// guard `match_round = $2` hacen que un segundo barrido simultáneo no pueda
// volver a avanzar la misma reserva.
export async function avanzarRonda(
  client: pg.PoolClient,
  bookingId: number,
  rondaActual: number,
  nuevaRonda: number,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE bookings
        SET match_round = $3,
            expires_at = NOW() + ($4::int * interval '1 millisecond')
      WHERE id = $1
        AND status = 'pending'
        AND professional IS NULL
        AND match_round = $2
      RETURNING id`,
    [bookingId, rondaActual, nuevaRonda, MATCH_OFFER_TTL_MS],
  );
  return (rowCount ?? 0) > 0;
}

// Expiración: solo gana quien vea la reserva todavía 'pending' y sin
// profesional. El evento se escribe en la misma transacción (un solo evento
// 'expired' aunque dos barridos coincidan).
export async function expirarReserva(client: pg.PoolClient, bookingId: number): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE bookings
        SET status = 'expired'
      WHERE id = $1 AND status = 'pending' AND professional IS NULL
      RETURNING id`,
    [bookingId],
  );
  if (!rowCount) return false;
  await client.query(
    `INSERT INTO booking_events (booking, status, note, created_at)
     VALUES ($1, 'expired', 'expired', NOW())`,
    [bookingId],
  );
  return true;
}

// Estado de la reserva para el motor de rondas (incluye a quién se le ha
// ofertado antes).
export async function loadMatchState(
  client: pg.Pool | pg.PoolClient,
  bookingId: number,
): Promise<MatchBooking | null> {
  const { rows } = await client.query<MatchBooking>(
    `SELECT b.id, b.client, b.service, b.lat, b.lng, b.match_round,
            COALESCE(
              array_agg(DISTINCT bc.professional_id) FILTER (WHERE bc.professional_id IS NOT NULL),
              '{}'
            ) AS offered
       FROM bookings b
       LEFT JOIN booking_candidates bc ON bc.booking_id = b.id
      WHERE b.id = $1
      GROUP BY b.id`,
    [bookingId],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, offered: (row.offered ?? []).map(Number) };
}

// Núcleo del matching: desde la ronda actual, busca candidatos de la ronda
// siguiente. Si no hay, sigue a la siguiente de inmediato; si se agotan las
// rondas, expira la reserva. La transición (avanzar o expirar) es atómica:
// solo un proceso concurrente puede ganar; el que pierde devuelve 'nada'.
export async function avanzarOExpirar(
  deps: MatchSweepDeps,
  client: pg.PoolClient,
  b: MatchBooking,
): Promise<MatchResult> {
  const { pool } = deps;
  if (b.lat === null || b.lng === null) {
    const ok = await expirarReserva(client, b.id);
    return ok ? { tipo: 'expirada' } : { tipo: 'nada' };
  }
  const excluidos = new Set<number>(b.offered ?? []);
  let siguiente = b.match_round + 1;
  while (siguiente <= MATCH_MAX_ROUNDS) {
    const radio = MATCH_RADIUS_M[siguiente - 1];
    const candidatos = await findCandidates(pool, b.service, b.lat, b.lng, radio, [...excluidos]);
    if (candidatos.length > 0) {
      // Transición atómica de ronda. Si otro proceso ganó primero, no seguimos.
      const ok = await avanzarRonda(client, b.id, b.match_round, siguiente);
      if (!ok) return { tipo: 'nada' };
      const ids = await offerToCandidates(client, b.id, siguiente, candidatos);
      for (const id of ids) excluidos.add(id);
      return { tipo: 'ronda', ronda: siguiente, ofertas: ids };
    }
    // Ronda sin candidatos: se pasa de inmediato a la siguiente.
    siguiente += 1;
  }
  const ok = await expirarReserva(client, b.id);
  return ok ? { tipo: 'expirada' } : { tipo: 'nada' };
}

// ---------------------------------------------------------------------------
// Barrido
// ---------------------------------------------------------------------------

// Una pasada del barrido: reservas sin asignar vencidas -> ampliar radio o
// expirar. Idempotente y segura ante reinicios: el estado vive en la base.
// Dos barridos simultáneos no procesan la misma reserva (SKIP LOCKED + UPDATE
// con guard de ronda).
export async function sweepMatching(deps: MatchSweepDeps): Promise<number> {
  const { pool } = deps;
  const conn = await pool.connect();
  const nuevasOfertas: { bookingId: number; professionalId: number; clientId: string }[] = [];
  const expiradas: { bookingId: number; clientId: string }[] = [];
  let processed = 0;
  try {
    await conn.query('BEGIN');
    // Reclamo exclusivo: otra pasada concurrente se salta estas filas.
    const { rows } = await conn.query<{ id: number }>(
      `SELECT id
         FROM bookings
        WHERE status = 'pending'
          AND professional IS NULL
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        ORDER BY expires_at
        LIMIT 50
        FOR UPDATE SKIP LOCKED`,
    );
    for (const row of rows) {
      const b = await loadMatchState(conn, row.id);
      if (!b) continue;
      const res = await avanzarOExpirar(deps, conn, b);
      if (res.tipo === 'nada') continue;
      processed += 1;
      if (res.tipo === 'ronda') {
        for (const professionalId of res.ofertas) {
          nuevasOfertas.push({ bookingId: b.id, professionalId, clientId: b.client });
        }
      } else {
        expiradas.push({ bookingId: b.id, clientId: b.client });
      }
    }
    await conn.query('COMMIT');
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
  // Los avisos salen DESPUÉS del commit: si la transacción falla, el
  // cliente no ve una ronda que en realidad no ocurrió.
  for (const o of nuevasOfertas) deps.emitOffer?.(o.bookingId, o.professionalId, o.clientId);
  for (const e of expiradas) deps.emitExpired?.(e.bookingId, e.clientId);
  return processed;
}

// Avance inmediato: pasa a la ronda siguiente (o expira) sin esperar al
// vencimiento. Se usa cuando la ronda actual se quedó sin candidatos.
// Transición atómica: solo un proceso concurrente puede ganar.
export async function avanzarAhora(
  deps: MatchSweepDeps,
  bookingId: number,
): Promise<MatchResult> {
  return conTransaccionMatch(deps, bookingId, async (conn, b) => avanzarOExpirar(deps, conn, b));
}

// Avance temprano por rechazo: si en la ronda actual ya no queda ninguna
// oferta viva (todos la rechazaron), se pasa de inmediato a la ronda
// siguiente; si no hay candidatos, la reserva expira sin esperar.
export async function avanzarSiTodosRechazaron(
  deps: MatchSweepDeps,
  bookingId: number,
): Promise<MatchResult> {
  return conTransaccionMatch(deps, bookingId, async (conn, b) => {
    const { rows } = await conn.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM booking_candidates
        WHERE booking_id = $1 AND round = $2 AND status = 'offered'`,
      [bookingId, b.match_round],
    );
    const vivas = Number(rows[0]?.n ?? '0');
    if (vivas > 0) return { tipo: 'nada' } as MatchResult;
    return avanzarOExpirar(deps, conn, b);
  });
}

// Transacción única para las transiciones de ronda: la transición es
// atómica y los avisos al socket salen solo después del commit.
async function conTransaccionMatch(
  deps: MatchSweepDeps,
  bookingId: number,
  accion: (conn: pg.PoolClient, b: MatchBooking) => Promise<MatchResult>,
): Promise<MatchResult> {
  const { pool } = deps;
  const conn = await pool.connect();
  const nuevasOfertas: { bookingId: number; professionalId: number; clientId: string }[] = [];
  const expiradas: { bookingId: number; clientId: string }[] = [];
  let result: MatchResult = { tipo: 'nada' };
  try {
    await conn.query('BEGIN');
    const b = await loadMatchState(conn, bookingId);
    if (b) {
      result = await accion(conn, b);
      if (result.tipo === 'ronda') {
        for (const professionalId of result.ofertas) {
          nuevasOfertas.push({ bookingId: b.id, professionalId, clientId: b.client });
        }
      } else if (result.tipo === 'expirada') {
        expiradas.push({ bookingId: b.id, clientId: b.client });
      }
    }
    await conn.query('COMMIT');
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
  for (const o of nuevasOfertas) deps.emitOffer?.(o.bookingId, o.professionalId, o.clientId);
  for (const e of expiradas) deps.emitExpired?.(e.bookingId, e.clientId);
  return result;
}
