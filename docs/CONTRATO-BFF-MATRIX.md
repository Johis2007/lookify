# Matriz BFF real - contrato profesional

Fuente de verdad: `apps/realtime-server/src/app.ts` y `apps/realtime-server/src/api/*.ts`.
Contrato de la app: `apps/lookify-app/docs/contratos-backend-profesional.md`.

Los paths `/api/v1/...` del mock histórico **no se implementan** y no se crean alias.
Toda ruta real vive bajo `/api/...` o en las rutas de infraestructura (`/health`,
`/realtime/nearby`).

Estados:

- **OK**: implementado y consumible.
- **Pendiente MVP**: acordado para esta fase, aún no implementado.
- **Fase posterior**: fuera del MVP; hoy se mantiene mock o se deriva en cliente.
- **Sin equivalente**: el modelo del mock no existe en el BFF.

## Infraestructura y acceso

| Capacidad | BFF real | Estado |
|---|---|---|
| Registro | `POST /api/auth/register` | OK |
| Perfil base | `GET/PATCH /api/users/me` | OK |
| Perfil cliente | `GET/POST/PUT/PATCH /api/clients/me` | OK |
| Archivos | `POST /api/files`, `GET/DELETE /api/files/:id` | OK |
| Salud | `GET /health` | OK |
| Cercanos | `GET /realtime/nearby` | OK |
| Rutas admin | Ninguna | Pendiente MVP (`requireAdmin`) |

## Pantallas 3-5: onboarding

| Capacidad | BFF real | Estado |
|---|---|---|
| Servicios del profesional | `GET/PUT /api/professionals/me/services` | OK |
| Catálogo público | Ninguno; la app usa su catálogo actual | Fase posterior |
| Documentos | `GET/POST /api/professionals/me/documents` | OK |
| Editar/borrar documento | `PATCH/DELETE /api/professionals/me/documents/:id` | OK |
| Certificados por servicio y límites | Ninguno | Pendiente MVP |
| Enviar a verificación | Solo `PATCH /me { verificationStatus: "pending" }` desde `rejected` | Pendiente MVP |
| Estado de verificación | `verification_status` en `GET /api/professionals/me` | Parcial |
| Corrección de certificados | Ninguno | Pendiente MVP |
| Activación por código | Ninguno | Pendiente MVP; espera definición del usuario |
| Reinicio de activación admin | Ninguno | Fase posterior |

## Pantalla 6: panel principal

| Capacidad | BFF real | Estado |
|---|---|---|
| Perfil | `GET/POST/PATCH /api/professionals/me` | OK |
| Disponibilidad | `PATCH /api/professionals/me { isOnline }` | OK |
| Servicios ofrecidos | `GET /api/professionals/me/services` | OK |
| Reseñas | `GET /api/professionals/me/reviews` | OK |
| Foto de perfil | `POST /api/files` + `PATCH /me { avatar }` | OK |
| Resumen del día | Ninguno | Fase posterior |
| Heartbeat / forzar ocupado | Ninguno | Fase posterior |
| Ubicación HTTP | Socket `location:update` + `/realtime/nearby` | OK por socket |

## Pantalla 7: portafolio

| Capacidad | BFF real | Estado |
|---|---|---|
| Subida de archivo | `POST /api/files` con `purpose=portfolio` | Parcial |
| Portafolio, orden, portada, videos, límites | Ninguno | Fase posterior |
| Moderación/reportes | Ninguno | Fase posterior |

El portafolio de la app sigue en mock y así está documentado.

## Pantalla 8: solicitud entrante

| Capacidad | BFF real | Estado |
|---|---|---|
| Ofertas vigentes | `GET /api/bookings/pro/available` | OK |
| Evento de nueva oferta | Socket `booking:new` (`offer: true`) | OK |
| Aceptar | `POST /api/bookings/:id/accept` | OK |
| Rechazar | `POST /api/bookings/:id/reject` | OK |
| Expiración | Barrido del servidor + `expires_at` | OK |
| `solicitud-activa` única | Ninguno; se usa la lista de ofertas | Fase posterior |
| Eventos `solicitud.*` | `booking:status`, `booking:taken`, `booking:expired` | OK con nombres BFF |

## Pantalla 9: servicio en curso

| Capacidad | BFF real | Estado |
|---|---|---|
| Reservas activas | `GET /api/bookings/pro/mine?status=accepted,in_progress` | OK |
| Detalle | `GET /api/bookings/:id` | OK |
| Llegada | `POST /api/bookings/:id/events { status: "llegada" }` | OK |
| Inicio | `POST /api/bookings/:id/start` | OK |
| PIN de inicio | `POST /api/bookings/:id/start` + `REQUIRE_START_PIN` | Pendiente MVP |
| Intentos/bloqueo de PIN | Ninguno | Fase posterior |
| Cancelar profesional | `POST /api/bookings/:id/cancel` | Pendiente MVP (reglas + motivo) |
| Cancelar cliente | `POST /api/bookings/:id/cancel` | Pendiente MVP (sin cancelar `in_progress`) |
| Finalizar | `POST /api/bookings/:id/complete` | OK |
| `servicio-activo` con `ahoraServidor` | Ninguno; se deriva de la reserva | Fase posterior |
| Eventos `servicio.*` | `booking:event`, `booking:status` | OK con nombres BFF |

## Pantalla 10: ingresos

| Capacidad | BFF real | Estado |
|---|---|---|
| Totales bruto/neto | `GET /api/professionals/me/earnings` | Pendiente MVP |
| Comisión configurable | `COMMISSION_RATE` (`0..1`, default `0.15`) | Pendiente MVP |
| Historial por periodo/cursor | Ninguno; se deriva de reservas | Fase posterior |
| Desglose efectivo/digital | Ninguno | Fase posterior |
| Persistencia de comisiones/liquidaciones | Ninguno | Fase posterior |

## Privacidad y seguridad

| Regla | BFF real | Estado |
|---|---|---|
| Identidad desde JWT | `requireAuth` | OK |
| Acceso a reserva solo participantes/admin | `canAccess` | OK |
| Documentos privados | `GET /api/files/:id` autorizado | OK |
| Perfil público sin PII | `GET /api/professionals/:id/public` | OK |
| Dirección exacta fuera de ofertas | `GET /api/bookings/pro/available` redondeada | OK |
| `requireAdmin` | Ninguno | Pendiente MVP |
| Consentimiento versionado + IP/fecha servidor | Ninguno | Pendiente MVP |
| Auditoría de activación/portafolio | Ninguno | Fase posterior |

## Conclusión

El BFF cubre registro, perfiles, archivos, reservas, matching, tracking, reseñas y el
ciclo `accepted → in_progress → completed`. El contrato de la app debe hablar de estas
rutas reales. Quedan como MVP el guard admin, el PIN opcional de inicio, las reglas de
cancelación, el consentimiento y los totales de ingresos. Activación por código espera
definición; portafolio, onboarding completo, historial detallado y liquidaciones son fase
posterior.
