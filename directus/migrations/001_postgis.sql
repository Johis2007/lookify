CREATE EXTENSION IF NOT EXISTS postgis;

-- Ubicaciones en vivo de profesionales (1 fila por profesional online)
-- Directus la gestiona como colección, aquí solo aseguramos geo.
-- Ejecutar una vez: docker compose exec postgres psql -U lookify -d lookify -f /docker-entrypoint-initdb.d/001_postgis.sql

ALTER TABLE IF EXISTS professional_locations
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_prof_loc_geom
  ON professional_locations USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_prof_loc_updated
  ON professional_locations (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_status
  ON bookings (status) WHERE status IN ('pending','accepted','in_progress');

-- Query ejemplo cercanos 5km:
-- SELECT p.id, ST_Distance(l.geom::geography, ST_MakePoint(-99.163, 19.432)::geography) AS dist_m
-- FROM beauty_professionals p
-- JOIN professional_locations l ON l.professional_id = p.id
-- WHERE p.is_online = true
--   AND ST_DWithin(l.geom::geography, ST_MakePoint(-99.163, 19.432)::geography, 5000)
-- ORDER BY dist_m LIMIT 20;
