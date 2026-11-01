# Lookify — Belleza profesional a domicilio

App móvil + web (Expo + React Navigation), realtime (Socket.IO) y backend
Directus sobre PostgreSQL + PostGIS y Redis, todo orquestado con Docker Compose.

## Stack

| Pieza | Tecnología |
|---|---|
| App cliente/pro/admin | Expo SDK 57 + React Native + React Navigation (`apps/lookify-app`) |
| Realtime y GPS en vivo | Node 20 + Socket.IO + Redis + `pg` (`apps/realtime-server`) |
| Backend y datos | Directus (sin ORM: esquema vía API + SQL plano en `directus/migrations/`) |
| Base de datos | PostgreSQL 16 + PostGIS (`postgis/postgis:16-3.4`) |
| Caché/colas | Redis 7 |

## Requisitos

- Node.js 18+ y npm
- Docker + Docker Compose
- Git

## Instalación desde cero (otro entorno)

```bash
# 1. Clonar e instalar
git clone https://github.com/Johis2007/lookify.git
cd lookify
npm install

# 2. Variables de entorno (NUNCA subir el .env al repo)
cp .env.example .env
```

Edita `.env` y cambia como mínimo: `DB_PASSWORD`, `DIRECTUS_KEY`,
`DIRECTUS_SECRET` (32+ caracteres) y `ADMIN_PASSWORD`. Genera valores con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
# 3. Infraestructura (Postgres + Redis + Directus)
docker compose up -d postgres redis directus

# 4. Base de datos (EN ESTE ORDEN: setup -> migrate -> seed)
npm run db:fresh
# Equivale a:
#   npm run db:setup    # colecciones, campos, rol App User, permisos y flows (API)
#   npm run db:migrate  # SQL PostGIS + constraints (psql en el contenedor)
#   npm run db:seed     # catálogo: 5 categorías + 6 servicios (idempotente)

# 5. Datos demo: cliente + 3 profesionales verificados cerca del centro demo
npm run seed:demo

# 6. Realtime + app
npm run dev:realtime          # servidor Socket.IO :4001 (otra terminal)
npm run env:lan               # fija las IPs LAN en apps/lookify-app/.env
npm run dev:app               # Expo: web + QR para móvil
```

`db:setup` escribe/rota `APP_ROLE_ID` y `DIRECTUS_TOKEN` en `.env`. Si usas el
servicio `realtime-server` de Docker (en vez de `npm run dev:realtime`), recréalo
después para que tome los valores nuevos:

```bash
docker compose up -d --build realtime-server
```

### Verificación de la instalación

Con el BFF arriba, estas comprobaciones deben dar exactamente:

```bash
# Salud del BFF (Postgres + Redis)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4001/health
# -> 200

# Registro público de Directus CERRADO (lo apaga db:setup)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8055/users/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa-directus@lookify.app","password":"FreshPass123!"}'
# -> 403

# Registro por el BFF ABIERTO y con rol App User asignado por el servidor
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:4001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa-bff@lookify.app","password":"FreshPass123!","firstName":"QA"}'
# -> 201

# Suite de integración: crea y limpia sus propios fixtures
npm --workspace apps/realtime-server test
# -> 105 tests, 0 fail, 0 skipped
```

Usa emails distintos si repites la verificación. Corrida validada el 2026-11-01
desde volúmenes vacíos
(`docker compose down -v`): `db:fresh`, `seed:demo`, `/health` 200,
`/users/register` 403, `/api/auth/register` 201 y el usuario creado quedó con
`role = APP_ROLE_ID`. `APP_ROLE_ID` y `DIRECTUS_TOKEN` cambiaron en `.env`
respecto al respaldo previo.

Directus Studio queda en `http://localhost:8055` (entra con `ADMIN_EMAIL` /
`ADMIN_PASSWORD`). Los scripts `db:*` esperan a que Directus esté listo e
inician sesión solos con esas credenciales si no defines `ADMIN_TOKEN`.

## Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `DB_DATABASE` / `DB_USER` / `DB_PASSWORD` | Base, usuario y clave de Postgres (usan Directus y realtime) |
| `DIRECTUS_KEY` / `DIRECTUS_SECRET` | Firma de tokens de Directus; `SECRET` también lo usa el realtime para verificar los JWT |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin inicial que Directus crea solo en el primer arranque; los scripts la usan para autenticarse |
| `PUBLIC_URL` | URL pública de Directus |
| `DIRECTUS_URL` / `ADMIN_TOKEN` | Solo scripts `db:*`: a dónde conectarse y con qué token (si `ADMIN_TOKEN` está vacío, hacen login con el admin) |
| `DIRECTUS_TOKEN` | Token del servicio `bff-service` (registro + archivos); lo escribe `db:setup` |
| `APP_ROLE_ID` | Rol App User para el registro del servidor; lo escribe `db:setup` en `.env` |
| `DEMO_LAT` / `DEMO_LNG` | Centro de demo para `seed:demo`; sin valores el seed se niega |
| `EXPO_PUBLIC_USE_BACKEND` | `true` activa Directus/BFF. Obligatorio para la web de admin; en móvil, sin la variable usa mocks |
| `EXPO_PUBLIC_DIRECTUS_URL` / `EXPO_PUBLIC_SOCKET_URL` | URLs primaria que compila la app (se generan con `npm run env:lan`) |
| `EXPO_PUBLIC_DIRECTUS_URLS` / `EXPO_PUBLIC_SOCKET_URLS` | Fallbacks multi-red (casa/universidad) que la app prueba en orden |
| `EXPO_PUBLIC_GOOGLE_MAPS_KEY` | No la usa el mapa de la app: `LookifyMap` usa WebView + Leaflet sin key. Solo aplica si se vuelve a `react-native-maps` en un build propio |
| `REDIS_URL` / `DATABASE_URL` | Conexiones del realtime server en local |
| `CORS_ORIGIN` | Orígenes permitidos por Directus y el BFF, separados por coma. Nunca `*`; Expo web usa `http://localhost:8081` |
| `LOG_LEVEL` | Nivel de log del realtime (`debug`/`info`/`warn`/`error`) |
| `PORT` | Puerto del realtime (por defecto 4001) |

El **realtime-server** lee primero `apps/realtime-server/.env` (si existe) y, como
fallback, el `.env` de la raíz del monorepo. `DIRECTUS_SECRET`, `DATABASE_URL` y
`REDIS_URL` son obligatorias: si faltan, el proceso imprime el mensaje exacto y
sale con código `1` (no arranca en silencio).

> **Seats de Directus:** la policy "Lookify App" se crea con `app_access: false`,
> así que los usuarios de la app (cliente/pro) usan la API pero **no consumen
> seat** ni pueden entrar al panel. Solo el admin ocupa licencia.

## Web: solo panel administrador

La build web de `apps/lookify-app` (`App.web.tsx` → `AppNavigator.web.tsx`) es
exclusiva del rol **Administrator**. No incluye registro, elección de tipo de
cuenta ni pantallas de cliente/profesional; esas cuentas deben usar la app móvil
(la web muestra: "La versión web es solo para administradores. Usa la app móvil.").

```powershell
# Windows / PowerShell
$env:EXPO_PUBLIC_USE_BACKEND='true'
npm --workspace apps/lookify-app run web
```

```bash
# macOS / Linux
EXPO_PUBLIC_USE_BACKEND=true npm --workspace apps/lookify-app run web
```

Sin `EXPO_PUBLIC_USE_BACKEND=true` la web muestra un aviso claro y no permite
entrar. El origen del navegador (`http://localhost:8081`) debe estar en
`CORS_ORIGIN` (Directus y BFF); `*` ya no se usa.

### Sesión del admin en web (límites honestos)

- El **access token** se guarda en `sessionStorage`; el **refresh token** solo
  en memoria. Cerrar la pestaña cierra la sesión y no queda nada válido 30 días.
- Logout manual y **auto-logout a los 15 minutos** sin actividad.
- `sessionCrypto.ts` (AES-GCM + PBKDF2 derivado de la huella del navegador) es
  solo ofuscación local, **no es seguridad real**: el código y la clave viven en
  el cliente. La autorización real está en Directus (`admin_access` + rol) y en
  el BFF (guard de rol). El siguiente paso es una cookie `HttpOnly`/`Secure`
  emitida por el backend en el mismo dominio; el cliente nunca vería el token.

### BFF de reservas (`/api/bookings`)

El realtime-server también expone un BFF en el mismo puerto (`:4001`) para el
acceso a reservas. La identidad sale **siempre del JWT** (`Bearer <access token
de Directus>`), nunca del body; el precio se calcula en el servidor.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/bookings` | cliente | Crea la reserva (`pending`); valida servicio activo y calcula el precio |
| `GET /api/bookings/mine` | cliente | Lista las reservas propias |
| `GET /api/bookings/:id` | participantes | Detalle; si no es participante → `404` |
| `POST /api/bookings/:id/accept\|reject` | profesional | `pending → accepted\|rejected` |
| `POST /api/bookings/:id/start` | profesional | `accepted → in_progress` |
| `POST /api/bookings/:id/complete` | profesional | `in_progress → completed` |
| `POST /api/bookings/:id/cancel` | cliente o profesional | `pending\|accepted\|in_progress → cancelled` |
| `GET /api/bookings/:id/tracking` | participantes | Última posición del pro en `accepted` (Redis, TTL 120 s) + `arrivedAt` |

### BFF de profesionales y datos personales (Ola 2)

El App User ya no lee ni escribe directo `beauty_professionals`,
`professional_services`, `professional_documents`, `reviews`,
`client_profiles` ni `radar_searches`: todo pasa por el BFF y la identidad sale
del JWT. El admin (`admin_access`) no se ve afectado.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET/POST/PATCH /api/professionals/me` | pro | Perfil propio; `verification_status` solo pasa a `pending` desde `rejected` |
| `GET /api/professionals/:id/public` | autenticado | Perfil público sin PII (ni `user`, ni email, ni teléfono) + servicios |
| `GET/PUT /api/professionals/me/services` | pro | Servicios ofrecidos; `PUT` reemplaza en transacción y valida el catálogo |
| `GET/POST/PATCH/DELETE /api/professionals/me/documents/:id` | pro | Documentos propios; alta forzada a `status='pending'` |
| `GET /api/professionals/me/reviews` · `/:id/reviews` | autenticado | Reseñas con solo el primer nombre del cliente |
| `POST /api/auth/register` | pǧblico | Registro por BFF; fija rol App User y `status=active`; rate limit por IP |
| `GET/POST/PUT /api/clients/me` | cliente | Perfil propio (upsert idempotente) |
| `POST /api/bookings/:id/review` | cliente dueño | Reseña de reserva `completed`; única por reserva |
| `GET/PATCH /api/users/me` | autenticado | Solo `firstName`, `lastName`, `phone`, `avatar`; nunca email/role/status |
| `POST /api/files` | autenticado | Multipart `file` + `purpose` (`avatar\|portfolio\|certificate`); máx. 5 MB |
| `GET /api/files/:id` | según archivo | Stream con `Authorization`; certificados solo dueño/admin |
| `DELETE /api/files/:id` | dueño/admin | Borra el archivo propio (certificados ajenos → 404) |

La migración `005`/`006` crea los índices únicos (un perfil por usuario, una
reseña por reserva) y revoca esos permisos directos. La `007` añade
`directus_users.phone` y revoca `directus_files` y `directus_users` al App User:
las imágenes se leen con header `Authorization` y `uploaded_by` sale siempre del
JWT. Los avatares/portafolio puede verlos cualquier autenticado; los
certificados solo su dueño o un admin.

Cada transición hace un `UPDATE` condicional atómico (solo gana quien vea el
estado previo correcto; doble aceptación → `409`) y escribe el `booking_events`
en la misma transacción. Los eventos socket `booking:new`/`booking:status` se
emiten tras confirmar la escritura. Tests: `npm --workspace apps/realtime-server test`.

### Rastreo en vivo (4C-2)

El profesional asignado emite `location:update` con `booking_id`; el servidor
valida que sea él (token) y que la reserva siga en `accepted`, y reenvía
`booking:location {booking_id, lat, lng, ts}` **solo** a la sala `booking:{id}`.
La sala admite únicamente al cliente dueño y al profesional asignado; el relevo
se corta al pasar a `in_progress`, `completed` o `cancelled` y tiene un límite
de 1 mensaje cada 2 s por socket. La llegada (`POST .../events` con
`status: 'llegada'`) se anuncia como `booking:event` en la misma sala.


El registro de la app pasa por `POST /api/auth/register` (BFF). La policy
`Public` queda sin permisos, as�� que ya no se puede crear usuarios directo en
Directus. El servicio `bff-service` solo tiene `create` en `directus_users`
(Directus libre solo admite `fields:['*']`); el BFF aplica zod estricto y fija
`role`/`status` del lado servidor.

## Notas de BD

- Todo es **idempotente**: `db:setup`, `db:migrate` y `db:seed` pueden
  repetirse sin duplicar ni romper nada. El seed verifica conteos al final y
  falla si el catálogo quedó incompleto.
- `db:seed` solo crea el cat��logo. `seed:demo` crea el cliente y 3 profesionales
  demo; la licencia gratuita de Directus limita los seats (`LIMIT_EXCEEDED`).
- El flow `validate-booking-no-overlap` (`directus/flows/`) se importa manual:
  Directus Studio > Flows > Import.
- `directus/snapshots/schema.json` es respaldo del esquema; la fuente de verdad
  versionada son `directus/setup*.mjs` + `directus/migrations/`.
- **Retención de datos GPS:** cada relevo de tracking deja una muestra en
  `booking_location_history` (PostGIS, migración `004_tracking.sql`). Se
  conserva **30 días** por defecto (`GPS_RETENTION_DAYS`). La limpieza es
  `npm run db:cleanup:gps` (o `-- --days=N`); prográmala con cron/Task Scheduler
  en producción. La última posición para el polling vive en Redis con TTL 120 s
  y se borra al iniciar/completar/cancelar la reserva.
- **Retención de búsquedas de radar:** `radar_searches` es analítica interna
  (el App User no tiene acceso directo). Se conserva **90 días** por defecto
  (`RADAR_RETENTION_DAYS`); limpia con `npm run db:cleanup:radar`
  (o `-- --days=N`).

## Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `db:*` dice que Directus no responde | Espera al primer arranque (~1 min) o revisa `docker compose logs directus` |
| `Correo o contraseña incorrectos` en login nuevo | El registro de la app usa `POST /api/auth/register` (BFF), no el registro público de Directus. |
| `Cupo de usuarios lleno` (`LIMIT_EXCEEDED`) | Límite de seats de Directus: libera usuarios o usa una licencia mayor. |
| Mapa vacío en Expo Go | No es falta de key: el mapa usa WebView + Leaflet. Revisa conectividad a los tiles Esri y que la app tenga `react-native-webview` |
| La app no conecta en otra Wi-Fi | Corre `npm run env:lan` y reinicia Expo |