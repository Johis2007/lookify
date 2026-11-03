# Contrato backend profesional - BFF real

Este documento describe el contrato que la app profesional consume hoy. La fuente de
verdad es el BFF (`apps/realtime-server`). Los paths `/api/v1/...` del mock histórico
**no existen** y no se crean alias: toda ruta nueva usa `/api/...`.

## Convenciones

- Identidad: `Authorization: Bearer <JWT>`. El `userId` y el `professionalId` salen del
  token; nunca del body ni de un `:solicitudId`.
- Respuesta exitosa: `{ "data": ... }`, salvo `204 No Content`.
- Error: `{ "error": "codigo_estable" }`. Errores de autenticación: `401`; permisos:
  `403`; recurso inexistente o ajeno: `404`; conflicto de estado: `409`.
- `professionalId` propio: `GET /api/professionals/me`.
- Estados de reserva: `pending`, `accepted`, `rejected`, `in_progress`, `completed`,
  `cancelled`, `expired`.
- Etapas visibles del servicio: `accepted` (en camino), `in_progress` (iniciado),
  `completed`, `cancelled`.
- Estados del contrato: **OK** implementado; **Pendiente MVP** acordado para esta fase;
  **Fase posterior** fuera del MVP.

## Rutas existentes

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/auth/register` | Crear App User con rol del servidor. |
| `GET` | `/api/users/me` | Perfil base del usuario autenticado. |
| `PATCH` | `/api/users/me` | Editar nombre, apellido, teléfono y avatar propios. |
| `GET` | `/api/clients/me` | Perfil de cliente propio. |
| `POST/PUT/PATCH` | `/api/clients/me` | Upsert idempotente del perfil de cliente. |
| `GET` | `/api/professionals/me` | Perfil profesional propio. |
| `POST` | `/api/professionals/me` | Crear perfil profesional propio (`pending`). |
| `PATCH` | `/api/professionals/me` | Editar campos permitidos y disponibilidad. |
| `GET/PUT` | `/api/professionals/me/services` | Leer o reemplazar servicios ofrecidos. |
| `GET/POST` | `/api/professionals/me/documents` | Listar o crear documentos/certificados. |
| `PATCH/DELETE` | `/api/professionals/me/documents/:id` | Editar o borrar documento propio. |
| `GET` | `/api/professionals/:id/public` | Perfil público sin PII + servicios. |
| `GET` | `/api/professionals/:id/reviews` | Reseñas públicas. |
| `GET` | `/api/professionals/me/reviews` | Reseñas del profesional del token. |
| `POST` | `/api/files` | Subir archivo (`avatar`, `portfolio`, `certificate`). |
| `GET/DELETE` | `/api/files/:id` | Leer o borrar archivo autorizado. |
| `POST` | `/api/bookings` | Crear reserva; precio calculado en servidor. |
| `GET` | `/api/bookings/mine` | Reservas del cliente del token. |
| `GET` | `/api/bookings/pro/mine` | Reservas del profesional del token. |
| `GET` | `/api/bookings/pro/available` | Ofertas vigentes para el profesional. |
| `GET` | `/api/bookings/:id` | Detalle de una reserva accesible. |
| `GET` | `/api/bookings/:id/events` | Eventos de la reserva. |
| `GET` | `/api/bookings/:id/tracking` | Última ubicación y llegada. |
| `POST` | `/api/bookings/:id/events` | Registrar `llegada` o `nota`. |
| `POST` | `/api/bookings/:id/review` | Reseñar una reserva completada. |
| `POST` | `/api/bookings/:id/accept` | Profesional acepta oferta. |
| `POST` | `/api/bookings/:id/reject` | Profesional rechaza oferta. |
| `POST` | `/api/bookings/:id/start` | Profesional inicia el servicio. |
| `POST` | `/api/bookings/:id/complete` | Profesional finaliza el servicio. |
| `POST` | `/api/bookings/:id/cancel` | Cliente o profesional cancela según reglas. |
| `GET` | `/health` | Salud de Postgres y Redis. |
| `GET` | `/realtime/nearby` | Profesionales cercanos. |

## Pantalla 3 - Servicios

### GET `/api/professionals/me/services` - OK

Respuesta `{ data: [{ id, serviceId, name, durationMin, priceBase }] }`.

### PUT `/api/professionals/me/services` - OK

- Body: `{ "serviceIds": number[] }`, mínimo 1, máximo 50, ids existentes y sin repetir.
- Reemplazo transaccional del vínculo del profesional del token.
- Respuesta: la lista actualizada.
- Errores: `400 invalid_body` / `invalid_service`, `404 not_found`.

### Catálogo público - Fase posterior

No hay `GET /api/catalogo/servicios` ni `/api/v1/catalogo/servicios`. La app usa el
catálogo actual disponible en su capa de datos. Un endpoint público de catálogo queda
para una fase posterior.

## Pantalla 4 - Certificados

### GET `/api/professionals/me/documents` - OK

Lista hasta 100 documentos del profesional del token.

### POST `/api/professionals/me/documents` - OK

- Body: `{ file: uuid, docType?: "dni"|"titulo"|"certificado"|"otro", note?: string }`.
- `file` debe existir y haber sido subido por el usuario.
- El servidor fuerza `status = "pending"`.
- Errores: `400 invalid_body` / `invalid_file`, `404 not_found`.

### PATCH `/api/professionals/me/documents/:id` - OK

Solo documentos propios. Campos: `file`, `docType`, `note`.

### DELETE `/api/professionals/me/documents/:id` - OK

Solo documentos propios. `204`.

### Límites por servicio y envío de verificación - Pendiente MVP

El BFF no modela certificados por servicio ni el envío todo-o-nada a revisión. Por ahora
el estado de verificación se administra fuera del BFF. Los límites de 3 certificados por
servicio y `enviar-verificacion` quedan **Pendiente MVP** en una ruta BFF nueva, sin
`solicitudId`.

## Pantalla 5 - Verificación y activación

- Estado de verificación y rechazo: **Pendiente MVP**.
- Corrección de certificados: **Pendiente MVP**.
- Activación por código, reenvío, intentos y bloqueo: **Pendiente MVP**; requiere la
  definición del usuario. No se implementa todavía.
- Reinicio de activación por admin: **Fase posterior**.

Mientras exista `verification_status`, el panel profesional usa `pending`, `verified` o
`rejected`. La activación por código se agregará al contrato cuando se defina.

## Pantalla 6 - Panel principal

### GET `/api/professionals/me` - OK

Respuesta: `id`, `displayName`, `bio`, `avatar`, `isOnline`, `ratingAvg`,
`verificationStatus`, `verificationNote`, `yearsExp`, `specialties`, `phone`.

### PATCH `/api/professionals/me` - OK

- Campos permitidos: `displayName`, `phone`, `bio`, `avatar`, `isOnline`, `yearsExp`,
  `specialties`, `verificationStatus: "pending"`.
- El servidor rechaza campos prohibidos (`rating_avg`, `verification_status` directo,
  `user`, `id`, ubicación, etc.) con `400 forbidden_field`.
- Ponerse online exige `verification_status = "verified"`.
- Reenviar a revisión solo se permite desde `rejected`.

### Reseñas - OK

`GET /api/professionals/me/reviews` devuelve `{ data: { reviews, total } }`. No acepta
`limit`; el cliente recorta si necesita mostrar menos.

### Disponibilidad - OK

`isOnline: true|false`. No existe `DISPONIBLE`/`OCUPADO` como enum ni heartbeat en esta
fase. Forzar `OCUPADO` por inactividad queda **Fase posterior**.

### Foto de perfil - OK

`POST /api/files` con `purpose=avatar` y luego `PATCH /api/professionals/me { avatar }`.
La foto se publica al asignarla. Moderación previa de foto queda **Fase posterior**.

### Ubicación HTTP - Fase posterior

Hoy la ubicación viaja por socket (`location:update`) y se consulta con
`GET /realtime/nearby`. No hay `PUT /api/professionals/me/location`.

## Pantalla 7 - Mi portafolio - Fase posterior

No existe modelo ni endpoint de portafolio. `POST /api/files` acepta
`purpose=portfolio`, pero no hay orden, portada, descripción, servicio asociado, videos,
límites ni moderación. La app mantiene el portafolio en mock y así debe documentarse.

Rutas previstas para una fase posterior, sin alias `/api/v1`:

- `GET/POST /api/professionals/me/portfolio`
- `PATCH/DELETE /api/professionals/me/portfolio/:id`

## Pantalla 8 - Solicitud entrante

### Eventos - OK

El BFF emite `booking:new` (con `offer: true`), `booking:status`, `booking:taken`,
`booking:expired` y `booking:event`. Los nombres `solicitud.*` del mock no existen.

### GET `/api/bookings/pro/available` - OK

Devuelve hasta 50 ofertas vigentes del profesional, con servicio, precio, distancia
redondeada y primer nombre del cliente. No incluye dirección exacta.

### Aceptar / rechazar - OK

- `POST /api/bookings/:id/accept`: `pending` → `accepted`.
- `POST /api/bookings/:id/reject`: `pending` → `rejected`.
- Ambos son idempotentes ante conflictos de estado y responden la reserva.
- Errores: `400 invalid_body`, `404 not_found`, `409 transition_not_allowed`.

No existe el modelo `solicitud-activa` ni `solicitudes-entrantes/:id/...`; se usa el id de
reserva.

### Expiración - OK

La expiración la procesa el servidor con `expires_at` y el motor de matching. No hay
endpoint explícito de “procesar expiración”.

## Pantalla 9 - Servicio en curso

### Consulta - OK

`GET /api/bookings/pro/mine?status=accepted,in_progress` devuelve las reservas activas.
El detalle incluye servicio, precio, dirección, cliente, eventos y ficha pública del
cliente/profesional según corresponda.

No hay un objeto único `servicio-activo` con `ahoraServidor`, etapa traducida ni PIN. La
app deriva la etapa desde `status`.

### Llegada - OK

`POST /api/bookings/:id/events { "status": "llegada", lat?, lng? }` registra el evento.
La reserva sigue `accepted`; la app muestra el PIN de 4 dígitos de forma determinista.

### Inicio con PIN - Pendiente MVP

- `POST /api/bookings/:id/start` exige `accepted` y pasa a `in_progress`.
- Con `REQUIRE_START_PIN=true`, el body debe incluir `{ "pin": "1234" }`; el servidor
  valida el PIN determinista de la reserva. Con el flag apagado, se mantiene el
  comportamiento actual.
- Intentos, bloqueo y `bloqueadoHasta` quedan para una fase posterior; el BFF no
  persiste PIN.

### Cancelación - Pendiente MVP

`POST /api/bookings/:id/cancel` aplica las reglas de la fase:

- Profesional: solo en `pending` o `accepted`; exige `motivo` de la lista cerrada.
- Cliente: solo en `pending` o `accepted`; no puede cancelar `in_progress`.
- Motivos: `CLIENTE_AUSENTE`, `DIRECCION_INCORRECTA`, `CLIENTE_CANCELO_EN_PERSONA`,
  `NO_PUEDO_CONTINUAR`.
- El motivo se persiste en `bookings.cancel_reason`.

### Finalizar - OK

`POST /api/bookings/:id/complete`: `in_progress` → `completed`.

### Eventos de servicio - OK

`booking:event` y `booking:status` informan los cambios. Los nombres `servicio.*` del
mock no existen.

## Pantalla 10 - Historial / ingresos

### Resumen agregado - Pendiente MVP

`GET /api/professionals/me/earnings` devolverá los totales del profesional del token:

```json
{
  "data": {
    "commissionRate": 0.15,
    "grossCop": 0,
    "commissionCop": 0,
    "netCop": 0,
    "completedBookings": 0
  }
}
```

- `grossCop`: suma de `price_snapshot` de reservas `completed`.
- `commissionCop`: `round(grossCop * COMMISSION_RATE)`.
- `netCop`: `grossCop - commissionCop`.
- `COMMISSION_RATE` es una variable de entorno entre `0` y `1`; por defecto `0.15`.
- No incluye canceladas ni propinas.

### Historial detallado por periodo - Fase posterior

No existe endpoint de ítems, cursor, periodos Hoy/Semana/Mes ni desglose de efectivo y
digital. La app deriva el historial actual desde reservas y reseñas. Persistir comisiones,
liquidaciones y métodos de pago queda **Fase posterior**.

## Seguridad y privacidad

- **OK:** identidad desde JWT; acceso a reservas solo para cliente, profesional asignado
  o admin; documentos y archivos privados protegidos; perfil público sin email, teléfono
  ni documentos.
- **OK:** dirección exacta solo visible para participantes de la reserva, no en ofertas.
- **Pendiente MVP:** `requireAdmin` para rutas administrativas.
- **Pendiente MVP:** consentimiento legal con versión, timestamp del servidor e IP.
- **Fase posterior:** auditoría de activación, moderación de portafolio, retención y
  borrado de datos, URLs firmadas y antivirus.

## Variables de entorno relevantes

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres del BFF. |
| `DIRECTUS_SECRET` | Firma/verificación de JWT. |
| `APP_ROLE_ID` | Rol asignado al registrar App Users. |
| `REQUIRE_START_PIN` | `true` exige PIN en `POST /api/bookings/:id/start`. |
| `COMMISSION_RATE` | Tasa de comisión para `/api/professionals/me/earnings` (`0..1`). |
| `BFF_REGISTER_RATE_MAX` | Máximo de registros por ventana. |
| `BFF_REGISTER_RATE_WINDOW_MS` | Ventana del rate limit de registro. |

## Pendientes explícitos

- Activación por código: **esperando definición del usuario**.
- Portafolio real: **Fase posterior**, hoy mock documentado.
- Onboarding con `solicitudId`, catálogo público, foto moderada, heartbeat, historial
  detallado y liquidaciones: **Fase posterior**.
