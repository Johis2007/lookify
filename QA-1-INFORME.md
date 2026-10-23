# QA-1 - Informe final

Fecha: 2026-10-23
Entorno: Windows, Docker Compose `lookify-main`, Directus `localhost:8055`,
realtime/BFF `localhost:4001`, `EXPO_PUBLIC_USE_BACKEND=true`.

## Veredicto

- Registro publico cerrado: Directus ya no permite crear usuarios sin
  autenticacion; el alta pasa por `POST /api/auth/register` del BFF.
- Suite realtime: **98 tests, 98 pass, 0 fail, 0 skipped** con `CI=true`.
- Typecheck de realtime + app: **OK**.
- 3 profesionales demo verificados/online, a 0 m, 449 m y 649 m del centro demo.
- Compose queda fijado como `lookify-main`.
- Copia legacy de la raiz movida fuera del repo a
  `C:\Users\santo\lookify-legacy-root`.

## Seguridad

Antes del fix:

- `POST /users` anonimo con `role = Administrator` -> `204`; el usuario quedaba
  con rol Administrator y `status=active`.
- `POST /users` anonimo con `token:'abc'` -> `204`; el usuario quedaba con
  `role=null`, `status=active` y token almacenado.
- Policy `Public` tenia `directus_users/create` con `fields:["*"]`.

Despues del fix (`directus/setup-permissions.mjs`):

- Policy `Public`: `permissions.data = []`.
- Los 3 intentos anonimos (`role`, `policies`, `token`) -> **403 FORBIDDEN**;
  no se creo ningun usuario.
- `bff-service` solo tiene `create` en `directus_users`; `GET`, `PATCH` y
  `DELETE` directos con su token -> **403**.
- `POST /api/auth/register` valido -> `201`; el usuario creado tiene rol
  App User y `status=active`. Campos extra `role|policies|token` -> `400
  invalid_body`. Email repetido -> `409 email_duplicate`.
- Rate limit propio: tercera peticion fuera de ventana -> `429 rate_limited`.
- Compromiso documentado: Directus libre solo acepta `fields:["*"]`; el BFF
  valida con zod estricto y fija `role`/`status` en servidor.

## Evidencia de pruebas

```text
npm run typecheck
EXIT=0

CI=true npm --workspace apps/realtime-server test
tests 98
pass 98
fail 0
skipped 0
EXIT=0

node --test --import tsx apps/realtime-server/src/api/register.test.ts
tests 3
pass 3
fail 0
skipped 0
```

Casos de archivos/avatar anadidos y verdes:

```text
certificado ajeno no se acepta como avatar en /api/users/me      400 invalid_avatar
certificado ajeno no se acepta como avatar en /api/clients/me    400 invalid_avatar
certificado ajeno no se acepta como avatar en /api/professionals/me 400 invalid_avatar
el certificado ajeno no se puede leer por /api/files             404
```

## Modulos

| Modulo | Real o mock | Evidencia |
|---|---|---|
| Registro cliente/profesional | Real | `POST /api/auth/register` 201; rol App User; tests 3/3 |
| Login/sesion | Real | Directus login 200; sesion probada en smoke |
| Catalogo | Real | 5 categorias / 7 servicios en DB; BFF catalog |
| Clientes/perfil | Real | BFF `/api/clients/me`; tests de aislamiento por token |
| Profesionales/perfil/servicios/documentos | Real | BFF `/api/professionals/*`; tests de ownership |
| Reservas/matching/eventos | Real | 98 tests; transiciones, carreras y permisos |
| Tracking/GPS/socket | Real | Redis/PostGIS + tests de terceros y rate limit |
| Archivos/avatares/certificados | Real | 12 tests de files; 4 casos nuevos de avatar |
| Radar cercano | Real | `GET /realtime/nearby` 200 con `Pro Demo`, `Pro Demo 2`, `Pro Demo 3` |
| Demo profesionales | Real | seed idempotente; 0 m / 449 m / 649 m; verified + online + servicio |
| PIN de servicio | Mock | `ServiceInProgressScreen.tsx` usa `generarPinServicioMock` |
| Portafolio profesional | Mock | `initBackend.ts`: sin tabla en Directus |
| Pago/calificacion UI | Mock | `PaymentRatingScreen.tsx` usa `mockEnviarCalificacion` |
| Mapa/ruta demo | Mixto | Home usa nearby real con backend; fallback mock si backend off |

## Demo y Compose

```text
pro.demo@lookify.app   verified online   0.0 m   1 servicio
pro.demo2@lookify.app  verified online 449.0 m   1 servicio
pro.demo3@lookify.app  verified online 648.6 m   1 servicio

docker compose config -> name: lookify-main
docker inspect realtime -> DIRECTUS_URL=http://directus:8055
                           APP_ROLE_ID=<App User>
```

## Pendientes conocidos

- UI de pago/calificacion sigue mock aunque la API real de resenas existe.
- PIN de servicio sigue mock.
- Portafolio profesional sigue mock (no hay tabla).
- La UI conserva mocks de presentacion para el modo demo; con backend activo
  Home, matching, perfiles, reservas y tracking usan servicios reales.
