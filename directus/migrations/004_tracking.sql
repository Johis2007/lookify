-- 004_tracking.sql — histórico GPS del rastreo en vivo (4C-2).
-- Idempotente (IF NOT EXISTS). Se aplica con `npm run db:migrate`.
--
-- La última posición se guarda en Redis (TTL 120 s) para el polling; aquí se
-- conserva el histórico para auditoría/soporte. Retención propuesta: 30 días
-- (ver scripts/gps-cleanup.mjs y README > "Retención de datos GPS").

CREATE TABLE IF NOT EXISTS booking_location_history (
  id              bigserial PRIMARY KEY,
  booking_id      integer NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  professional_id integer NOT NULL REFERENCES beauty_professionals(id) ON DELETE CASCADE,
  geom            geometry(Point, 4326) NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT NOW()
);

-- Consulta del recorrido de una reserva (más reciente primero).
CREATE INDEX IF NOT EXISTS idx_booking_loc_hist_booking
  ON booking_location_history (booking_id, recorded_at DESC);

-- Barrido de retención.
CREATE INDEX IF NOT EXISTS idx_booking_loc_hist_recorded
  ON booking_location_history (recorded_at);
