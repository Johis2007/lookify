import type pg from 'pg';

// Modelo "claim": reserva sin profesional asignado que se ofrece a candidatos
// cercanos. Ronda 1 difunde a 3 km; si nadie acepta en 60 s, ronda 2 a 6 km;
// si nadie acepta en otros 60 s, la reserva queda 'expired'.

export const MATCH_RADIUS_M = [3000, 6000] as const;
export const MATCH_OFFER_TTL_MS = 60_000;
export const MATCH_MAX_CANDIDATES = 5;
export const MATCH_SWEEP_INTERVAL_MS = 10_000;

export type Candidate = { professional_id: number; distance_m: number };

// Candidatos elegibles para una reserva en una ronda: verificados, online,
// ofrecen el servicio, dentro del radio, no ofrecidos antes, más cercanos.
export async function findCandidates(
  pool: pg.Pool,
  serviceId: number,
  lat: number,
  lng: number,
  radiusM: number,
  excludeProfessionalIds: number[] = [],
): Promise<Candidate[]> {
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

export type MatchSweepDeps = {
  pool: pg.Pool;
  // Avisa a un candidato de una nueva oferta (room prof:{id}).
  emitOffer: (bookingId: number, professionalId: number, clientId: string) => void;
  // Avisa al cliente que la reserva expiró.
  emitExpired: (bookingId: number, clientId: string) => void;
};

// Una pasada del barrido: reservas sin asignar vencidas -> ampliar radio o expirar.
// Idempotente y segura ante reinicios: el estado vive en la base.
export async function sweepMatching(deps: MatchSweepDeps): Promise<number> {
  const { pool } = deps;
  const { rows } = await pool.query<{
    id: number;
    client: string;
    service: number;
    lat: number | null;
    lng: number | null;
    match_round: number;
    offered: number[];
  }>(
    `SELECT b.id, b.client, b.service, b.lat, b.lng, b.match_round,
            COALESCE(array_agg(DISTINCT bc.professional_id) FILTER (WHERE bc.professional_id IS NOT NULL), '{}') AS offered
       FROM bookings b
       LEFT JOIN booking_candidates bc ON bc.booking_id = b.id
      WHERE b.status = 'pending'
        AND b.professional IS NULL
        AND b.expires_at IS NOT NULL
        AND b.expires_at < NOW()
      GROUP BY b.id
      LIMIT 50`,
  );

  let processed = 0;
  for (const b of rows) {
    if (b.lat === null || b.lng === null) {
      await expireBooking(deps, b.id, b.client);
      processed += 1;
      continue;
    }
    if (b.match_round < 2) {
      const round = 2;
      const candidates = await findCandidates(pool, b.service, b.lat, b.lng, MATCH_RADIUS_M[1], b.offered);
      const ids = await offerToCandidates(pool, b.id, round, candidates);
      await pool.query(
        `UPDATE bookings SET match_round = $2, expires_at = NOW() + ($3::int * interval '1 millisecond')
          WHERE id = $1 AND status = 'pending' AND professional IS NULL`,
        [b.id, round, MATCH_OFFER_TTL_MS],
      );
      for (const pid of ids) deps.emitOffer(b.id, pid, b.client);
      processed += 1;
    } else {
      await expireBooking(deps, b.id, b.client);
      processed += 1;
    }
  }
  return processed;
}

async function expireBooking(deps: MatchSweepDeps, bookingId: number, clientId: string): Promise<void> {
  const { pool } = deps;
  const { rowCount } = await pool.query(
    `UPDATE bookings SET status = 'expired'
      WHERE id = $1 AND status = 'pending' AND professional IS NULL`,
    [bookingId],
  );
  if (rowCount && rowCount > 0) {
    await pool.query(
      `INSERT INTO booking_events (booking, status, note, created_at)
       VALUES ($1, 'expired', 'expired', NOW())`,
      [bookingId],
    );
    deps.emitExpired(bookingId, clientId);
  }
}
