-- 008_legal_consents.sql
-- Consentimientos legales inmutables por usuario y versión.
-- El BFF registra el sello de tiempo y metadatos de la petición; la App User
-- no tiene acceso directo a esta tabla.

CREATE TABLE IF NOT EXISTS legal_consents (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES directus_users(id) ON DELETE CASCADE,
  document varchar(16) NOT NULL CHECK (document IN ('terms', 'privacy')),
  version varchar(64) NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT NOW(),
  ip varchar(64),
  user_agent varchar(512),
  CONSTRAINT uq_legal_consents_user_document_version
    UNIQUE (user_id, document, version)
);

CREATE INDEX IF NOT EXISTS idx_legal_consents_user_document
  ON legal_consents (user_id, document, accepted_at DESC);
