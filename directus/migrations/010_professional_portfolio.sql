-- Portafolio profesional (fotos y videos) gestionado solo por el BFF.
-- El orden es por tipo: en fotos sort_order = 0 es la portada.
-- El archivo vive en directus_files y se sube con purpose 'lookify:portfolio'.

CREATE TABLE IF NOT EXISTS professional_portfolio (
  id SERIAL PRIMARY KEY,
  professional INTEGER NOT NULL REFERENCES beauty_professionals(id) ON DELETE CASCADE,
  file UUID NOT NULL REFERENCES directus_files(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  caption VARCHAR(100),
  service_id INTEGER REFERENCES beauty_services(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  duration_sec NUMERIC(6, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_professional_portfolio_owner_kind
  ON professional_portfolio (professional, kind, sort_order, id);

CREATE INDEX IF NOT EXISTS ix_professional_portfolio_file
  ON professional_portfolio (file);
