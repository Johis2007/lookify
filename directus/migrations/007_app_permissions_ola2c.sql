-- 007_app_permissions_ola2c.sql
-- Ola 2c: archivos y usuarios solo por BFF.
-- - directus_users.phone: campo editable vía GET/PATCH /api/users/me.
-- - App User sin acceso directo a directus_files ni directus_users.

ALTER TABLE directus_users ADD COLUMN IF NOT EXISTS phone varchar(24);

DELETE FROM directus_permissions p
 USING directus_policies pol
 WHERE p.policy = pol.id
   AND pol.name = 'Lookify App'
   AND p.collection IN ('directus_files', 'directus_users');
