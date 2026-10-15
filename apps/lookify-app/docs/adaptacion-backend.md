# Adaptación al backend Lookify (Directus + realtime-server)

`EXPO_PUBLIC_USE_BACKEND=true` conecta el flujo profesional al backend real.
Con `false` (default) todo sigue en mocks. Solo frontend: este doc + 
`src/lib/backend/` + `src/services/backend/`; pantallas sin cambios.

Activar: `npm run db:fresh` (o infra + setup + seed), luego
`EXPO_PUBLIC_USE_BACKEND=true npx expo start` en `apps/lookify-app`.

## Mapeo contratos (`docs/contratos-backend-profesional.md`) → Directus

| Contrato frontend | Backend real |
|---|---|
| `GET catalogo/servicios` | `GET /items/service_categories` + `/items/beauty_services?filter[is_active]` (slug→CategoriaId; se ignoran slugs fuera de las 4 categorías) |
| `PUT solicitudes/:id/servicios` | `professional_services` (borra e inserta `professional_id`+`service_id`) |
| Login pro | `POST /auth/login` + `beauty_professionals?filter[user]`; estado por `verification_status`: verified→APROBADO (activado), pending→EN_REVISION/DOCUMENTOS_PENDIENTES, rejected→RECHAZADO |
| Registro pro | `POST /users` (público) + login + `beauty_professionals` pending |
| `GET me/panel` | `beauty_professionals/:id` + `reviews` (últimas 3 + `meta=total_count`) + `professional_services` + resumen HOY desde bookings |
| `PATCH me/disponibilidad` | `PATCH beauty_professionals {is_online}` + socket `prof:online`/`prof:offline` |
| `POST me/foto-perfil` | `POST /files` + `PATCH beauty_professionals {avatar}` |
| `GET me/resenas` | `GET /items/reviews?filter[professional]` (autor = `first_name` del cliente) |
| `GET me/historial-ingresos` (+resumen) | `bookings?filter[professional,status∈{completed,cancelled}]` en rango Bogotá (HOY/SEMANA/MES); comisión 15% sobre `price_base` del servicio; neto = total − comisión; motivo desde `booking_events` (`motivo:X`); método desde `payment_method`; cursor opaco `o<offset>` |
| `GET me/solicitud-activa` | `bookings?filter[professional,status=pending]` (última); `expiraEn` = creada + 60s |
| `POST …/aceptar/rechazar` | `PATCH bookings {accepted\|rejected}` + socket `booking:join`/`booking:status` |
| WebSocket `solicitud.entrante` | socket `booking:new` `{booking_id}` → detalle por REST (sin dirección exacta: solo `lat/lng` de la reserva, igual que el contrato) |
| `GET me/servicio-activo` | `bookings?filter[status∈{accepted,in_progress}]`; EN_CAMINO=accepted sin evento, LLEGUE=accepted con evento `llegada`, INICIADO=in_progress |
| `POST …/llegada` | `POST booking_events {llegada:ts}` + socket `booking:status=llegada` |
| `POST …/validar-pin` | PIN determinista `1000+((id*7919)%9000)` (igual que mobile-web); OK→`in_progress` |
| `POST …/cancelar` | `PATCH cancelled` + evento `motivo:X` |
| `POST …/finalizar` | `PATCH completed` |
| `GET solicitudes/:id/estado-verificacion` | `verification_status` + conteo docs/servicios; email enmascarado local |
| `POST …/corregir-certificados` | `PATCH beauty_professionals {pending}` (solo si rejected) |
| Certificados CRUD | `professional_documents` + `/files`; metadatos (tipo, entidad, fecha, servicioIds) en `note` como `LOOKIFY-CERT:v1 {...}` |
| Login cliente | `POST /auth/login` + `client_profiles` (se crea si falta) |
| Registro cliente | `POST /users` (público, **con `role` App directo**) + login + `client_profiles` |

> **Rol en el registro**: el flow "Asignar rol App al registrarse" existe y está
> activo, pero los flows por evento **no se ejecutan en esta instancia**
> (verificado: ni en `directus_users` ni en colecciones normales, con o sin
> condición). Por eso el registro (cliente y pro) envía `role: APP_ROLE_ID`
> directo (el permiso público de `directus_users.create` es `fields: *`).
> `EXPO_PUBLIC_APP_ROLE_ID` lo sobreescribe por entorno (el UUID cambia por
> instancia; ver salida de `db:setup`). Solo expone el rol App, nunca admin.
| `POST …/enviar-verificacion` | valida cobertura 1–3 por servicio + `PATCH verification_status=pending` |

## Desvíos conocidos (brechas backend, no del adapter)

1. **Códigos de activación**: Directus no envía ni valida códigos. `verified` ⇒ activado al login; `reenviar/validarCodigo` solo resuelven para verified.
2. **Intentos/bloqueo de PIN**: en memoria local (sin enforcement servidor). El contrato exige hash + 5 intentos + bloqueo 15 min en servidor (TBD).
3. **`ahoraServidor`**: se usa reloj local (Directus no expone hora; desvío documentado).
4. **Portafolio**: sin tabla en Directus → queda en mock siempre.
5. **Foto en revisión**: Directus no tiene estado de foto; el avatar queda visible al subirlo.
6. **Motivo de cancelación**: se lee de `booking_events` (`motivo:X`); reservas canceladas fuera de este flujo no tienen motivo.
7. **Cursor de historial**: `o<offset>` en vez de `${ms}:${id}` (el contrato lo sugiere, no lo exige).
8. **Expiración 30s**: el backend no expira solicitudes; `expiraEn` = creada + 60s y `procesarExpiracion` no muta.
9. **`PUT me/ubicacion`**: no implementado en app (igual que el contrato MVP).
10. **Push tokens / auditoría / rate-limit**: responsabilidad del servidor (TBD).

## Sesiones (cliente / profesional / admin)

- **Un solo login válido**: al iniciar sesión se revoca el refresh anterior
  (`POST /auth/logout`) en este dispositivo. Multidispositivo simultáneo
  requiere hook de servidor (los flows por evento no se ejecutan en esta
  instancia): pendiente.
- **Persistencia**: nativo en SecureStore (cifrado del SO); web en cookie
  `lookify_<rol>_v1` (30 días, `SameSite=Lax`, `Secure` en HTTPS) con el JSON
  cifrado en AES-GCM-256. Clave derivada PBKDF2 de huella del navegador +
  usuario: no se guarda en ningún lado (si cambias de navegador, reingresas).
- **Límite honesto**: el cifrado web protege contra robo casual del storage,
  no contra XSS decidido. La defensa real es el access token de 15 min con
  refresh rotado (el panel renueva solo; si falla, vuelve al login).

## Archivos

- `src/lib/backend/`: `config.ts`, `directus.ts` (REST+upload), `session.ts` (SecureStore), `realtime.ts` (socket.io + heartbeat 25s), `mapping.ts` (comisión, PIN, desglose, pagos).
- `src/lib/backend/sessionCrypto.ts` + `secureSession.ts`: bóveda de sesiones
  (nativo SecureStore; web cookie 30d SameSite=Lax con JSON cifrado AES-GCM;
  clave derivada del navegador+usuario, nunca almacenada).
- `src/services/backend/`: 1 implementación por dominio + `initBackend.ts` (swap vía los `set…ForTesting` existentes).
- `src/services/incomingActive.ts`: el listener ya no importa el store mock directo.
- `.env.example`: `EXPO_PUBLIC_USE_BACKEND`, URLs, Maps key.
