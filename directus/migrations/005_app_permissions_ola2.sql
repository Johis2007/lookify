-- 005_app_permissions_ola2.sql
-- Ola 2 de permisos (2E): perfiles de cliente, búsquedas y reseñas.
-- 1) Limpieza de perfiles huérfanos (fixtures viejas sin usuario real).
-- 2) Un solo perfil por usuario y una sola reseña por reserva.
-- 3) El App User pierde TODO acceso directo a esas colecciones (BFF).

DELETE FROM client_profiles cp
 WHERE cp."user" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM directus_users u WHERE u.id = cp."user");

CREATE UNIQUE INDEX IF NOT EXISTS client_profiles_user_unique
  ON client_profiles ("user")
  WHERE "user" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_unique
  ON reviews (booking)
  WHERE booking IS NOT NULL;

DELETE FROM directus_permissions p
 USING directus_policies pol
 WHERE p.policy = pol.id
   AND pol.name = 'Lookify App'
   AND p.collection IN ('client_profiles', 'radar_searches', 'reviews');
