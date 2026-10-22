-- 006_app_permissions_ola2b.sql
-- Ola 2 de permisos (2E): perfil público profesional, servicios y documentos.
-- El App User pierde TODO acceso directo; se resuelve por el BFF.

DELETE FROM directus_permissions p
 USING directus_policies pol
 WHERE p.policy = pol.id
   AND pol.name = 'Lookify App'
   AND p.collection IN ('beauty_professionals', 'professional_services', 'professional_documents');
