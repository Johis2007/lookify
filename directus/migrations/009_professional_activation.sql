-- Activación de profesionales por código de 6 dígitos.
-- La aprobación documental (verification_status='verified') ya no activa por
-- sí sola: activated_at queda NULL hasta validar el código enviado por correo.

ALTER TABLE beauty_professionals
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS professional_activation_codes (
  professional INTEGER PRIMARY KEY REFERENCES beauty_professionals(id) ON DELETE CASCADE,
  code_hash TEXT,
  code_expires_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  resends_used INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_professional_activation_codes_expires
  ON professional_activation_codes (code_expires_at);

-- Abuelo: los profesionales ya verificados antes de este flujo quedan activos.
-- No toca aprobaciones nuevas porque esas ya tienen fila en activation_codes.
UPDATE beauty_professionals bp
   SET activated_at = COALESCE(bp.activated_at, NOW())
 WHERE bp.verification_status = 'verified'
   AND bp.activated_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM professional_activation_codes pac
      WHERE pac.professional = bp.id
   );
