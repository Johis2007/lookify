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

## Levantar en otro entorno (desde cero)

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

# 5. Realtime + app
npm run dev:realtime          # servidor Socket.IO :4001 (otra terminal)
npm run env:lan               # fija las IPs LAN en apps/lookify-app/.env
npm run dev:app               # Expo: web + QR para móvil
```

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
| `EXPO_PUBLIC_DIRECTUS_URL` / `EXPO_PUBLIC_SOCKET_URL` | URLs primaria que compila la app (se generan con `npm run env:lan`) |
| `EXPO_PUBLIC_DIRECTUS_URLS` / `EXPO_PUBLIC_SOCKET_URLS` | Fallbacks multi-red (casa/universidad) que la app prueba en orden |
| `EXPO_PUBLIC_GOOGLE_MAPS_KEY` | Key de Maps SDK (Android + iOS); vacía = mapa gris en el build nativo |
| `REDIS_URL` / `DATABASE_URL` | Conexiones del realtime server en local |
| `CORS_ORIGIN` | Orígenes permitidos por el realtime (`*` solo en DEV) |
| `LOG_LEVEL` | Nivel de log del realtime (`debug`/`info`/`warn`/`error`) |
| `PORT` | Puerto del realtime (por defecto 4001) |

El **realtime-server** lee primero `apps/realtime-server/.env` (si existe) y, como
fallback, el `.env` de la raíz del monorepo. `DIRECTUS_SECRET`, `DATABASE_URL` y
`REDIS_URL` son obligatorias: si faltan, el proceso imprime el mensaje exacto y
sale con código `1` (no arranca en silencio).

> **Seats de Directus:** la policy "Lookify App" se crea con `app_access: false`,
> así que los usuarios de la app (cliente/pro) usan la API pero **no consumen
> seat** ni pueden entrar al panel. Solo el admin ocupa licencia.

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


## Notas de BD

- Todo es **idempotente**: `db:setup`, `db:migrate` y `db:seed` pueden
  repetirse sin duplicar ni romper nada. El seed verifica conteos al final y
  falla si el catálogo quedó incompleto.
- El seed **no crea usuarios demo**: la licencia gratuita de Directus limita a
  3 seats y cada usuario extra puede bloquear el registro real (`LIMIT_EXCEEDED`).
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

## Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `db:*` dice que Directus no responde | Espera al primer arranque (~1 min) o revisa `docker compose logs directus` |
| `Correo o contraseña incorrectos` en login nuevo | Activa registro público: el seed/setup ya pone `public_registration=true` |
| `Cupo de usuarios lleno` (`LIMIT_EXCEEDED`) | Límite de 3 seats de la licencia gratuita: libera usuarios o licencia Directus |
| Mapa gris en build nativo | Falta `EXPO_PUBLIC_GOOGLE_MAPS_KEY` (ver `.env.example`) |
| La app no conecta en otra Wi-Fi | Corre `npm run env:lan` y reinicia Expo |