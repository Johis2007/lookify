-- Identidad que la app recoge en el registro de cliente y de profesional
-- (tipo/número de documento, nacionalidad y fecha de nacimiento). Antes estos
-- datos se validaban en pantalla y se descartaban al enviar: ahora persisten.
--
-- El número de documento es único por tipo dentro de cada tabla (índice
-- parcial: los NULL no chocan, así los perfiles antiguos siguen válidos).
-- Es la contraparte real de `DOCUMENTO_DUPLICADO` del mock.

ALTER TABLE beauty_professionals
  ADD COLUMN IF NOT EXISTS document_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS document_number VARCHAR(40),
  ADD COLUMN IF NOT EXISTS nationality VARCHAR(80),
  ADD COLUMN IF NOT EXISTS birth_date DATE;

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS document_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS document_number VARCHAR(40),
  ADD COLUMN IF NOT EXISTS nationality VARCHAR(80),
  ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_beauty_professionals_document
  ON beauty_professionals (document_type, document_number)
  WHERE document_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_client_profiles_document
  ON client_profiles (document_type, document_number)
  WHERE document_number IS NOT NULL;
