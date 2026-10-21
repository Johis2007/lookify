-- 003_matching.sql — modelo "claim" (reservas sin profesional asignado).
-- Idempotente (IF NOT EXISTS). Se aplica con `npm run db:migrate`.

-- Campos de matching en bookings: ronda de difusión (1=3 km, 2=6 km) y
-- vencimiento de la oferta. status pasa a permitir 'expired' (varchar, sin
-- check), así que no hace falta alterar el tipo.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS match_round integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Ofertas a candidatos: quién recibió la reserva y en qué quedó. Guarda la
-- ronda y la distancia para auditoría y para el "rechazar" (quitar la oferta).
CREATE TABLE IF NOT EXISTS booking_candidates (
  id              serial PRIMARY KEY,
  booking_id      integer NOT NULL REFERENCES bookings(id),
  professional_id integer NOT NULL REFERENCES beauty_professionals(id),
  round           integer NOT NULL DEFAULT 1,
  distance_m      real NOT NULL,
  status          varchar NOT NULL DEFAULT 'offered',
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

-- Un candidato por (reserva, ronda): no se re-ofrece al mismo pro en 3 km y 6 km.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_candidate
  ON booking_candidates (booking_id, professional_id, round);

-- Búsqueda de ofertas vigentes por profesional.
CREATE INDEX IF NOT EXISTS idx_booking_candidates_pro
  ON booking_candidates (professional_id, status);

-- Barrido de expiración por reserva.
CREATE INDEX IF NOT EXISTS idx_booking_candidates_booking
  ON booking_candidates (booking_id);
