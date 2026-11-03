# Matriz contrato backend profesional vs BFF

Fuente del contrato: `apps/lookify-app/docs/contratos-backend-profesional.md`.
Fuente del BFF: `apps/realtime-server/src/app.ts` y `apps/realtime-server/src/api/*.ts`.

Leyenda:

- **OK**: el BFF cubre la operación con una ruta equivalente.
- **PARCIAL**: existe una ruta parecida, pero cambia el path, el body, la respuesta o faltan reglas.
- **FALTA**: no existe endpoint ni sustituto directo.

Notas generales:

- El contrato usa `/api/v1/profesionales/...` y `/api/v1/catalogo/...`. El BFF no monta `/api/v1`; usa `/api/professionals`, `/api/bookings`, `/api/files`, etc.
- El contrato identifica la solicitud por `:id`; el BFF resuelve el profesional del JWT con `/me`.
- El contrato devuelve objetos planos; el BFF normalmente envuelve en `{ "data": ... }`.
- El contrato exige profesional aprobado + activado. El BFF solo tiene `verification_status` (`pending`/`verified`/`rejected`) y no implementa activación por código.
- No existen en el BFF los modelos de solicitud de onboarding, activación, PIN, portafolio, historial de ingresos ni comisiones.

## Pantalla 3 - Servicios

| Contrato | BFF real | Estado | Brecha |
|---|---|---|---|
| `GET /api/v1/catalogo/servicios` | Ninguno | FALTA | La tabla `beauty_services` existe, pero no hay endpoint de catálogo. El frontend usa `src/data/mockServices.ts`. |
| `PUT /api/v1/profesionales/solicitudes/:id/servicios` | `PUT /api/professionals/me/services` | PARCIAL | Body `{ serviceIds: number[] }` en vez de `{ servicioIds: string[] }`; no usa `solicitudId` ni devuelve `onboardingPaso`. |

## Pantalla 4 - Certificados

| Contrato | BFF real | Estado | Brecha |
|---|---|---|---|
| `GET /api/v1/profesionales/solicitudes/:id/certificados` | `GET /api/professionals/me/documents` | PARCIAL | Lista documentos del profesional del JWT; no hay `solicitudId`. |
| `POST /api/v1/profesionales/solicitudes/:id/certificados` (multipart) | `POST /api/files` + `POST /api/professionals/me/documents` | PARCIAL | El BFF separa binario y metadatos; no acepta `nombreTipo`, `entidadEmisora`, `fechaEmision` ni `servicioIds`; no valida límites por servicio. |
| `PATCH /api/v1/profesionales/solicitudes/:id/certificados/:certificadoId` | `PATCH /api/professionals/me/documents/:id` | PARCIAL | Solo `file`, `docType`, `note`; sin reglas de servicio ni límite de 3. |
| `DELETE /api/v1/profesionales/solicitudes/:id/certificados/:certificadoId` | `DELETE /api/professionals/me/documents/:id` | OK | Equivalente funcional, con id de documento propio. |
| `POST /api/v1/profesionales/solicitudes/:id/enviar-verificacion` | Ninguno | FALTA | No hay envío todo-o-nada ni transición a `EN_REVISION`; solo `PATCH /me { verificationStatus: "pending" }` desde `rejected`. |

## Pantalla 5 - Verificación y activación

| Contrato | BFF real | Estado | Brecha |
|---|---|---|---|
| `GET .../estado-verificacion` | Ninguno | FALTA | No hay estado de solicitud, email enmascarado, rechazo ni flags de activación. |
| `POST .../corregir-certificados` | Ninguno | FALTA | No existe flujo de corrección. |
| `POST .../activacion/reenviar-codigo` | Ninguno | FALTA | No hay códigos, cooldown, reenvíos ni bloqueo. |
| `POST .../activacion/validar-codigo` | Ninguno | FALTA | No hay código hash, intentos, bloqueo ni claim `activado`. |
| Reinicio de activación por admin | Ninguno | FALTA | Sin panel admin en el BFF. |

## Pantalla 6 - Panel principal

| Contrato | BFF real | Estado | Brecha |
|---|---|---|---|
| `GET /api/v1/profesionales/me/panel` | `GET /api/professionals/me`, `/me/services`, `/me/reviews`, `/api/bookings/pro/mine` | PARCIAL | Se puede componer en cliente, pero no hay endpoint único ni `resumenDia`. |
| `PATCH /api/v1/profesionales/me/disponibilidad` | `PATCH /api/professionals/me` con `{ isOnline }` | PARCIAL | Usa booleano, no `DISPONIBLE`/`OCUPADO`; solo exige `verified`; no exige aprobado+activado, no tiene heartbeat ni fuerza `OCUPADO` al cerrar sesión. |
| `POST /api/v1/profesionales/me/foto-perfil` (multipart) | `POST /api/files` + `PATCH /api/professionals/me` con `{ avatar }` | PARCIAL | No hay endpoint único ni estado `PENDIENTE_REVISION`/`APROBADA`/`RECHAZADA`; la foto se publica al asignarla. |
| `GET /api/v1/profesionales/me/resenas?limit=3` | `GET /api/professionals/me/reviews` | PARCIAL | No acepta `limit`; devuelve 20 por defecto y `{ reviews, total }` dentro de `data`. |
| `PUT /api/v1/profesionales/me/ubicacion` | Socket `location:update` + `GET /realtime/nearby` | PARCIAL | No hay endpoint HTTP; el GPS se publica por socket y se persiste en batch. |

## Pantalla 7 - Mi portafolio

| Contrato | BFF real | Estado | Brecha |
|---|---|---|---|
| `GET /api/v1/profesionales/me/portafolio` | Ninguno | FALTA | No hay modelo ni endpoint de portafolio. `POST /api/files` solo permite subir archivos con propósito `portfolio`. |
| `POST .../portafolio/fotos` | Ninguno | FALTA | Sin límite de 10, orden, descripción ni portada. |
| `POST .../portafolio/videos` | Ninguno | FALTA | Sin MP4/MOV, duración máxima, límite de 4 ni metadatos. |
| `PATCH .../portafolio/items/:itemId` | Ninguno | FALTA | Sin descripción/servicio asociado. |
| `PUT .../portafolio/items/:itemId/archivo` | Ninguno | FALTA | Sin reemplazo conservando metadatos. |
| `POST .../portafolio/items/:itemId/mover` | Ninguno | FALTA | Sin orden. |
| `POST .../portafolio/fotos/:itemId/portada` | Ninguno | FALTA | Sin invariante de portada. |
| `DELETE .../portafolio/items/:itemId` | Ninguno | FALTA | Sin borrado de ítem ni reordenamiento. |
| Reporte/moderación de portafolio | Ninguno | FALTA | Sin reportes ni acciones admin. |

## Pantalla 8 - Solicitud entrante

| Contrato | BFF real | Estado | Brecha |
|---|---|---|---|
| Evento `solicitud.entrante` | Socket `booking:new` con `offer: true` | PARCIAL | Cambia el nombre y el payload; no hay `SolicitudEntrante` con desglose ni `expiraEn` en el mismo formato. |
| Eventos `solicitud.expirada`, `cliente_acepto`, `cliente_rechazo`, `ya_asignada` | `booking:status`, `booking:taken`, `booking:event` | PARCIAL | No existen esos nombres de evento ni todos los estados equivalentes. |
| `GET /api/v1/profesionales/me/solicitud-activa` | `GET /api/bookings/pro/available` | PARCIAL | Devuelve hasta 50 ofertas en arreglo, no una sola solicitud activa; el payload no coincide. |
| `POST .../solicitudes-entrantes/:id/aceptar` | `POST /api/bookings/:id/accept` | PARCIAL | Cambia el path; responde la reserva, no `{ resultado: "ACEPTADA" | ... }`; no usa `solicitudId`. |
| `POST .../solicitudes-entrantes/:id/rechazar` | `POST /api/bookings/:id/reject` | PARCIAL | Cambia el path y la respuesta; no libera un slot de solicitud porque ese modelo no existe. |
| `POST .../solicitudes-entrantes/:id/procesar-expiracion` | Barrido del servidor / `GET /api/bookings/:id` | PARCIAL | No hay endpoint explícito; la expiración la procesa el servidor y se consulta por estado. |

## Pantalla 9 - Servicio en curso

| Contrato | BFF real | Estado | Brecha |
|---|---|---|---|
| `GET /api/v1/profesionales/me/servicio-activo` | `GET /api/bookings/pro/mine?status=accepted,in_progress` | PARCIAL | Devuelve lista, no un `ServicioEnCurso` único; no incluye `ahoraServidor`, etapa, PIN, bloqueo ni marcas. |
| `POST .../servicios-en-curso/:id/llegada` | `POST /api/bookings/:id/events` con `status: "llegada"` | PARCIAL | No es endpoint dedicado ni idempotente por etapa; exige reserva `accepted` y no cambia a `LLEGUE`. |
| `POST .../servicios-en-curso/:id/validar-pin` | Ninguno | FALTA | No hay PIN, intentos, bloqueo ni etapa `INICIADO`. |
| `POST .../servicios-en-curso/:id/cancelar` | `POST /api/bookings/:id/cancel` | PARCIAL | Cancela la reserva, no una etapa con motivo cerrado; no aplica las reglas de `EN_CAMINO`/`LLEGUE`. |
| `POST .../servicios-en-curso/:id/finalizar` | `POST /api/bookings/:id/complete` | PARCIAL | Cambia el path; no devuelve `ahoraServidor`, etapa ni historial. |
| Eventos `servicio.llegada`, `servicio.iniciado`, `servicio.cancelado_por_profesional`, `servicio.finalizado` | `booking:event`, `booking:status` | PARCIAL | Cambian nombres y payload; no hay evento de PIN. |
| Reglas de `ahoraServidor`, PIN, motivos y bloqueo | Ninguno | FALTA | El BFF no implementa esas reglas. |

## Pantalla 10 - Historial / ingresos

| Contrato | BFF real | Estado | Brecha |
|---|---|---|---|
| `GET .../historial-ingresos/resumen` | Ninguno | FALTA | No hay resumen por periodo. |
| `GET .../historial-ingresos` | `GET /api/bookings/pro/mine` + `GET /api/professionals/me/reviews` | PARCIAL | Se pueden derivar datos, pero no hay endpoint de historial, cursor, montos ni `ahoraServidor`. |
| Comisión 15 %, neto, efectivo y digital | Ninguno | FALTA | No se calculan ni persisten `comisionCop`, `netoCop` ni `comisionEfectivoCop`. |
| `resumenDia` del panel | Ninguno | FALTA | Sin agregación diaria. |
| Historial idempotente al finalizar/cancelar | Ninguno | FALTA | Sin tabla ni escritura de historial. |

## Rutas BFF existentes fuera del contrato

| Ruta | Uso |
|---|---|
| `POST /api/auth/register` | Registro con rol del servidor y rate limit. |
| `GET/PATCH /api/users/me` | Perfil de usuario base. |
| `GET/POST/PUT/PATCH /api/clients/me` | Perfil de cliente idempotente. |
| `GET /api/professionals/:id/public`, `GET /api/professionals/:id/reviews` | Perfil público y reseñas. |
| `POST /api/bookings` | Crear reserva con precio del servidor. |
| `GET /api/bookings/mine` | Reservas del cliente. |
| `GET /api/bookings/:id`, `GET /api/bookings/:id/events`, `GET /api/bookings/:id/tracking` | Detalle, eventos y tracking. |
| `POST /api/bookings/:id/review` | Reseña de reserva completada. |
| `GET /health`, `GET /realtime/nearby` | Salud y profesionales cercanos. |

## Conclusión

El BFF actual cubre el flujo real de reservas, matching, documentos, tracking y perfiles, pero no implementa el contrato de onboarding/activación, portafolio, PIN ni historial de ingresos. El contrato debe alinearse con los paths reales del BFF o el BFF debe crecer para cumplirlo; hoy no son intercambiables.
