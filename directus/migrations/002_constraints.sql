-- Constraints 1-1 MVP (ruta archivo para evitar quoting de "user").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_beauty_prof_user') THEN
    ALTER TABLE beauty_professionals ADD CONSTRAINT uq_beauty_prof_user UNIQUE ("user");
  END IF;
END
$$;
