-- Borrar un usuario en Directus fallaba con 500: las FK que apuntaban a
-- directus_users tenían ON DELETE NO ACTION y Postgres rechazaba el DELETE en
-- cuanto existía alguna fila que lo referenciara.
--
-- Cambiamos a ON DELETE SET NULL (misma convención que Directus usa en sus
-- propias tablas: dashboards, comments, shares…): el usuario desaparece y la
-- fila referenciada queda con esa columna en NULL. Nunca CASCADE: borrar una
-- cuenta no debe borrar reservas, reseñas ni el histórico.
--
-- Nuestras tablas:
--   beauty_professionals."user" / client_profiles."user"
--     → el perfil sobrevive sin usuario (los índices únicos sobre "user"
--       admiten varios NULL; el de client_profiles además es parcial).
--   bookings.client / reviews.client / radar_searches.client
--     → el histórico del cliente se conserva sin atribución. Todas las
--       lecturas usan LEFT JOIN directus_users, así que la fila no se pierde.
--
-- Tablas de Directus (solo columnas de atribución, todas anulables):
--   directus_files.uploaded_by / modified_by, directus_notifications.sender,
--   directus_comments.user_updated, directus_versions.user_updated
--     → sin esto, un usuario que hubiera subido un certificado seguía sin
--       poder borrarse (el error solo cambiaba de FK).
--
-- Si el usuario borrado era un profesional `is_online`, el perfil quedaría
-- como un fantasma: seguiría en matching y en /realtime/nearby (ambos exigen
-- is_online + verified + activated) sin nadie detrás que pueda aceptar. El
-- trigger lo baja de una vez al borrar su usuario. Se dispara en BEFORE para
-- que "user" todavía apunte al usuario (los FK se resuelven después).

ALTER TABLE beauty_professionals
  DROP CONSTRAINT IF EXISTS beauty_professionals_user_foreign;
ALTER TABLE beauty_professionals
  ADD CONSTRAINT beauty_professionals_user_foreign
  FOREIGN KEY ("user") REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_user_foreign;
ALTER TABLE client_profiles
  ADD CONSTRAINT client_profiles_user_foreign
  FOREIGN KEY ("user") REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_client_foreign;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_client_foreign
  FOREIGN KEY (client) REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE reviews
  DROP CONSTRAINT IF EXISTS reviews_client_foreign;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_client_foreign
  FOREIGN KEY (client) REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE radar_searches
  DROP CONSTRAINT IF EXISTS radar_searches_client_foreign;
ALTER TABLE radar_searches
  ADD CONSTRAINT radar_searches_client_foreign
  FOREIGN KEY (client) REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE directus_files
  DROP CONSTRAINT IF EXISTS directus_files_uploaded_by_foreign;
ALTER TABLE directus_files
  ADD CONSTRAINT directus_files_uploaded_by_foreign
  FOREIGN KEY (uploaded_by) REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE directus_files
  DROP CONSTRAINT IF EXISTS directus_files_modified_by_foreign;
ALTER TABLE directus_files
  ADD CONSTRAINT directus_files_modified_by_foreign
  FOREIGN KEY (modified_by) REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE directus_notifications
  DROP CONSTRAINT IF EXISTS directus_notifications_sender_foreign;
ALTER TABLE directus_notifications
  ADD CONSTRAINT directus_notifications_sender_foreign
  FOREIGN KEY (sender) REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE directus_comments
  DROP CONSTRAINT IF EXISTS directus_comments_user_updated_foreign;
ALTER TABLE directus_comments
  ADD CONSTRAINT directus_comments_user_updated_foreign
  FOREIGN KEY (user_updated) REFERENCES directus_users(id) ON DELETE SET NULL;

ALTER TABLE directus_versions
  DROP CONSTRAINT IF EXISTS directus_versions_user_updated_foreign;
ALTER TABLE directus_versions
  ADD CONSTRAINT directus_versions_user_updated_foreign
  FOREIGN KEY (user_updated) REFERENCES directus_users(id) ON DELETE SET NULL;

-- Borrar un ARCHIVO tampoco debía fallar: el BFF expone DELETE /api/files/:id
-- (dueño o admin) y esas 8 FKs NO ACTION rechazaban el borrado en cuanto
-- alguien usaba la imagen como avatar, foto de servicio o documento de
-- verificación. Todas las columnas son anulables → SET NULL: el archivo se
-- borra y la fila se queda sin imagen/documento (nunca CASCADE, que borraría
-- servicios o documentos enteros).
ALTER TABLE beauty_professionals
  DROP CONSTRAINT IF EXISTS beauty_professionals_avatar_foreign;
ALTER TABLE beauty_professionals
  ADD CONSTRAINT beauty_professionals_avatar_foreign
  FOREIGN KEY (avatar) REFERENCES directus_files(id) ON DELETE SET NULL;

ALTER TABLE client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_avatar_foreign;
ALTER TABLE client_profiles
  ADD CONSTRAINT client_profiles_avatar_foreign
  FOREIGN KEY (avatar) REFERENCES directus_files(id) ON DELETE SET NULL;

ALTER TABLE beauty_services
  DROP CONSTRAINT IF EXISTS beauty_services_image_foreign;
ALTER TABLE beauty_services
  ADD CONSTRAINT beauty_services_image_foreign
  FOREIGN KEY (image) REFERENCES directus_files(id) ON DELETE SET NULL;

ALTER TABLE professional_documents
  DROP CONSTRAINT IF EXISTS professional_documents_file_foreign;
ALTER TABLE professional_documents
  ADD CONSTRAINT professional_documents_file_foreign
  FOREIGN KEY (file) REFERENCES directus_files(id) ON DELETE SET NULL;

ALTER TABLE directus_settings
  DROP CONSTRAINT IF EXISTS directus_settings_public_favicon_foreign;
ALTER TABLE directus_settings
  ADD CONSTRAINT directus_settings_public_favicon_foreign
  FOREIGN KEY (public_favicon) REFERENCES directus_files(id) ON DELETE SET NULL;

ALTER TABLE directus_settings
  DROP CONSTRAINT IF EXISTS directus_settings_project_logo_foreign;
ALTER TABLE directus_settings
  ADD CONSTRAINT directus_settings_project_logo_foreign
  FOREIGN KEY (project_logo) REFERENCES directus_files(id) ON DELETE SET NULL;

ALTER TABLE directus_settings
  DROP CONSTRAINT IF EXISTS directus_settings_public_foreground_foreign;
ALTER TABLE directus_settings
  ADD CONSTRAINT directus_settings_public_foreground_foreign
  FOREIGN KEY (public_foreground) REFERENCES directus_files(id) ON DELETE SET NULL;

ALTER TABLE directus_settings
  DROP CONSTRAINT IF EXISTS directus_settings_public_background_foreign;
ALTER TABLE directus_settings
  ADD CONSTRAINT directus_settings_public_background_foreign
  FOREIGN KEY (public_background) REFERENCES directus_files(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION lookify_offline_professional_on_user_delete()
RETURNS trigger AS $$
BEGIN
  UPDATE beauty_professionals SET is_online = false WHERE "user" = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_offline_professional_on_user_delete ON directus_users;
CREATE TRIGGER trg_offline_professional_on_user_delete
  BEFORE DELETE ON directus_users
  FOR EACH ROW EXECUTE FUNCTION lookify_offline_professional_on_user_delete();
