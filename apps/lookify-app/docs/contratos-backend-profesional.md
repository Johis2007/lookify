# Contratos backend — App Profesional (pantallas 3–10)

Documento de referencia para implementación server-side. El frontend mock valida las mismas reglas; el servidor **debe revalidar todo**.

## Pantalla 3 — Servicios

### GET `/api/v1/catalogo/servicios`
- **Respuesta 200:** catálogo por categoría (ids oficiales del admin).
- **Errores:** `500`.

### PUT `/api/v1/profesionales/solicitudes/:id/servicios`
- **Body:** `{ "servicioIds": string[] }` (mínimo 1, ids válidos del catálogo).
- **Respuesta 200:** `{ solicitudId, servicioIds, onboardingPaso: "CERTIFICADOS" }`.
- **Errores:** `404` `SOLICITUD_NO_ENCONTRADA`, `400` `SERVICIO_INVALIDO` / `VALIDATION`.

## Pantalla 4 — Certificados

### GET `/api/v1/profesionales/solicitudes/:id/certificados`
- **Respuesta 200:** lista de certificados (metadatos + URL firmada o id de archivo).

### POST `/api/v1/profesionales/solicitudes/:id/certificados` (multipart)
- **Campos:** archivo + JSON (`nombreTipo`, `entidadEmisora`, `fechaEmision?`, `servicioIds[]`).
- **Validación servidor:** MIME real (JPG/PNG/PDF), máx. **5 MB**, `servicioIds` ⊆ servicios elegidos, ≥1 servicio, máx. **3 certificados por servicio** (certificado multi-servicio cuenta en cada uno).
- **Errores:** `400` `ARCHIVO_INVALIDO`, `ARCHIVO_MUY_GRANDE`, `LIMITE_CERTIFICADOS_SERVICIO`, `SERVICIO_INVALIDO`, `VALIDATION`.

### PATCH `/api/v1/profesionales/solicitudes/:id/certificados/:certificadoId`
- Mismas reglas que POST (excluyendo el certificado editado al contar límites).

### DELETE `/api/v1/profesionales/solicitudes/:id/certificados/:certificadoId`

### POST `/api/v1/profesionales/solicitudes/:id/enviar-verificacion`
- **Reglas:** todo-o-nada — cada servicio elegido con **1–3** certificados.
- **Efecto:** `estadoSolicitud = EN_REVISION`; borrar rechazo previo y estado de activación pendiente.
- **Errores:** `400` `SERVICIO_SIN_CERTIFICADO`.

## Pantalla 5 — Verificación y activación

**Nota:** ningún endpoint devuelve el código de activación en claro. El campo `codigoActivacionDemo` del mock TypeScript **no existe** en respuestas HTTP.

### GET `/api/v1/profesionales/solicitudes/:id/estado-verificacion`
- **Respuesta 200:** `estadoSolicitud`, `emailEnmascarado` (ya enmascarado), resumen envío, rechazo si aplica, flags de activación (`codigoExpirado`, `bloqueadoHasta`, `reenvioDisponibleEn`, `reenviosRestantes`, `sinSalidaActivacion`).
- **Nota:** el primer código tras aprobación lo genera el servidor (correo); la app solo **reenvía**.

### POST `/api/v1/profesionales/solicitudes/:id/corregir-certificados`
- **Efecto:** `DOCUMENTOS_PENDIENTES`, conservar certificados; devolver motivo anterior como aviso informativo en pantalla 4.
- **Errores:** `400` si no está `RECHAZADO`.

### POST `/api/v1/profesionales/solicitudes/:id/activacion/reenviar-codigo`
- **Reglas:** cooldown **60 s**, máx. **3 reenvíos**; invalida código anterior; nuevo código 6 dígitos, vigencia **10 min**.
- **Errores:** `429`/`400` `REENVIO_NO_DISPONIBLE`, `REENVIOS_AGOTADOS`, `BLOQUEO_TEMPORAL`.

### POST `/api/v1/profesionales/solicitudes/:id/activacion/validar-codigo`
- **Body:** `{ "codigo": "123456" }`.
- **Reglas:** hash en servidor, un solo uso, máx. **5 intentos** → bloqueo **15 min**; mensajes **genéricos** (`CODIGO_INVALIDO` / `CODIGO_EXPIRADO` sin filtrar existencia).
- **Éxito:** marca profesional activado; emite sesión/JWT con claim `activado=true`. Hasta entonces endpoints del panel → **403**.

### Caso sin salida
- Reenvíos agotados + código expirado: UI contacto soporte. **Admin** puede reiniciar activación (nuevo código, reset contadores) vía panel interno (endpoint TBD, p. ej. `POST /admin/profesionales/:id/reiniciar-activacion`).

## Seguridad código de activación (requisito backend)

- Generación en servidor (CSPRNG), almacenamiento **hash** (nunca claro), un solo uso, invalidar al emitir nuevo.
- Vigencia 10 min; 5 intentos fallidos → bloqueo 15 min; reenvío 60 s, máx. 3.
- Rate limit por solicitud, cuenta e IP.
- Auditoría: aprobación, envío código, intentos fallidos, activación exitosa.

## Pantalla 6 — Panel principal

Requisito transversal: endpoints del panel exigen JWT de profesional con **`estadoSolicitud = APROBADO`** y **`activado = true`**. Si no → **403** `PROFESIONAL_NO_HABILITADO` (el servidor **revalida**; no confiar en la UI).

### GET `/api/v1/profesionales/me/panel`
- **Respuesta 200:** `{ nombre, calificacionPromedio | null, totalResenas, disponibilidad: "DISPONIBLE" | "OCUPADO", resumenDia: { serviciosRealizados, ingresosCop }, serviciosOfrecidos: [{ servicioId, nombre, duracionMin, precioBaseCop }], fotoPerfil: { urlPublica } | null, ultimasResenas: [{ autor, texto, estrellas }] }`.
- **`calificacionPromedio`:** `null` si `totalResenas === 0`.
- **Errores:** `401`, `403` `PROFESIONAL_NO_HABILITADO`, `404` si la cuenta no existe.

### PATCH `/api/v1/profesionales/me/disponibilidad`
- **Body:** `{ "disponibilidad": "DISPONIBLE" | "OCUPADO" }`.
- **Reglas servidor:** solo **`DISPONIBLE`** si aprobado **y** activado; la app ya pidió permiso de ubicación en primer plano — el backend puede exigir última ubicación reciente vía `PUT .../ubicacion` en una fase posterior. **`OCUPADO`** siempre permitido.
- **Inactividad / heartbeat:** el servidor debe forzar **`OCUPADO`** tras timeout sin heartbeat (p. ej. cierre de sesión, app en background prolongado, o `PATCH` periódico no recibido). Documentar SLA TBD en ops.
- **Efecto logout:** al invalidar sesión/JWT → marcar profesional **OCUPADO** (refuerzo del mock `registrarCierreSesion`).
- **Respuesta 200:** `{ disponibilidad }`.
- **Errores:** `403` `PROFESIONAL_NO_HABILITADO`, `400` `VALIDATION`.

### POST `/api/v1/profesionales/me/foto-perfil` (multipart)
- **Campo:** archivo imagen (JPG/PNG).
- **Validación servidor:** MIME **real** (magic bytes), máx. **5 MB**, recorte cuadrado recomendado en cliente; **rechazar** si no cumple.
- **Flujo producto:** la foto queda en estado **pendiente de revisión admin**; **no** es visible al cliente en oferta/matching hasta aprobación. Respuesta incluye `estadoFoto: "PENDIENTE_REVISION" | "APROBADA" | "RECHAZADA"` y URL solo si aprobada (o URL privada para el profesional mientras revisa).
- **Errores:** `400` `ARCHIVO_INVALIDO`, `ARCHIVO_MUY_GRANDE`, `403` `PROFESIONAL_NO_HABILITADO`.

### GET `/api/v1/profesionales/me/resenas?limit=3`
- **Respuesta 200:** `{ calificacionPromedio, totalResenas, items: [{ autor, texto, estrellas, creadoEn }] }`.
- **Errores:** `403` `PROFESIONAL_NO_HABILITADO`.

### PUT `/api/v1/profesionales/me/ubicacion` (futuro — matching en vivo)
- **Body:** `{ "latitude": number, "longitude": number, "accuracyM": number?, "capturedAt": ISO8601 }`.
- **Uso previsto:** enviar posición cuando el profesional está **DISPONIBLE** (tras permiso en app); rate limit y retención acotada (política de datos).
- **Nota MVP frontend:** hoy solo se verifica permiso; **no** implementar en app hasta acordar frecuencia y privacidad.
- **Errores:** `403` si no habilitado o no disponible, `400` `VALIDATION`.

## Pantalla 7 — Mi portafolio

Requisito transversal: mismo JWT que el panel (**aprobado + activado**). Cada profesional solo
puede leer y mutar **su** portafolio (`profesionalId` del token). El servidor **revalida** límites,
MIME/tamaño/duración y que `servicioId` (si viene) pertenezca a los servicios ofrecidos por ese
profesional.

### GET `/api/v1/profesionales/me/portafolio`
- **Respuesta 200:** `{ fotos: PortfolioItem[], videos: PortfolioItem[], limites: { maxFotos, maxVideos, … } }`.
- **Item:** `id`, `tipo` (`FOTO` | `VIDEO`), `orden`, `descripcion?`, `servicioId?`, URLs firmadas
  (`url`, `miniaturaUrl?` solo si aplica), metadatos no sensibles (`duracionSeg?` en video).
- **Portada:** foto con `orden === 0` (servidor mantiene invariante al mover/definir portada).
- **Errores:** `403` `PROFESIONAL_NO_HABILITADO`.

### POST `/api/v1/profesionales/me/portafolio/fotos` (multipart)
- **Validación servidor:** JPG/PNG, MIME **real** (magic bytes), máx. **5 MB**; máx. **10** fotos
  por profesional (`LIMITE_FOTOS_PORTAFOLIO`).
- **Errores:** `400` `ARCHIVO_INVALIDO`, `ARCHIVO_MUY_GRANDE`, `LIMITE_FOTOS_PORTAFOLIO`.

### POST `/api/v1/profesionales/me/portafolio/videos` (multipart)
- **Validación servidor:** MP4/MOV, MIME real, máx. **50 MB**, duración máx. **30 s** medida en
  servidor (`VIDEO_DURACION_EXCEDIDA`); máx. **4** videos (`LIMITE_VIDEOS_PORTAFOLIO`).
- **Errores:** `400` `ARCHIVO_INVALIDO`, `ARCHIVO_MUY_GRANDE`, `VIDEO_DURACION_EXCEDIDA`,
  `LIMITE_VIDEOS_PORTAFOLIO`.

### PATCH `/api/v1/profesionales/me/portafolio/items/:itemId`
- **Body:** `{ descripcion?: string | null, servicioId?: string | null }` — descripción máx. 100
  caracteres; `servicioId` debe estar en servicios del profesional o `null` para quitar.
- **Errores:** `404` `ITEM_PORTAFOLIO_NO_ENCONTRADO`, `400` `VALIDATION`.

### PUT `/api/v1/profesionales/me/portafolio/items/:itemId/archivo` (multipart)
- Reemplaza archivo conservando `id`, orden, descripción y `servicioId`; **no** incrementa conteo
  de ítems; mismas validaciones que POST según tipo.
- **Errores:** como POST foto/video según tipo.

### POST `/api/v1/profesionales/me/portafolio/items/:itemId/mover`
- **Body:** `{ direccion: "ARRIBA" | "ABAJO" }` — solo dentro del mismo tipo (fotos vs videos).
- **Errores:** `404` `ITEM_PORTAFOLIO_NO_ENCONTRADO`, `400` `VALIDATION`.

### POST `/api/v1/profesionales/me/portafolio/fotos/:itemId/portada`
- Pasa la foto a **orden 0** y renumera el resto sin huecos.
- **Errores:** `404`, `400` si no es foto.

### DELETE `/api/v1/profesionales/me/portafolio/items/:itemId`
- Si se elimina la portada, la siguiente foto pasa a orden 0.
- **Errores:** `404` `ITEM_PORTAFOLIO_NO_ENCONTRADO`.

### Moderación a posteriori (producto + legal)

- **No hay revisión previa** del admin para publicar fotos/videos en el portafolio (distinto de
  certificados en onboarding).
- El **cliente** podrá **reportar** un elemento del portafolio; el **admin** lo revisa en
  **«Reportes y reseñas»** y puede **eliminar** el ítem o **suspender** el portafolio del
  profesional.
- Los **términos de uso** deben prohibir contenido ilegal u ofensivo (redacción final por abogado
  real, no borrador de frontend).
- **Operaciones técnicas recomendadas:** escaneo antivirus/malware en upload, almacenamiento de
  medios en bucket privado con URLs firmadas de corta vigencia, auditoría de reportes y acciones
  admin, retención y borrado al eliminar cuenta (política de datos TBD).

## Pantalla 8 — Solicitud entrante

Requisito transversal: mismo JWT que el panel (**aprobado + activado**). El matching solo ofrece
solicitudes a profesionales **verificados, activados y DISPONIBLES**. **Una sola solicitud activa**
por profesional en el servidor. La **dirección exacta del cliente no** viaja en la solicitud entrante.

### Evento en tiempo real — WebSocket y push `solicitud.entrante`

Payload (**`SolicitudEntrante`**, cuerpo compartido push/WebSocket):

- `id` (solicitud entrante)
- `servicio` (`servicioId`, `nombre`, `duracionMin`)
- `distanciaKmAprox` (aproximada; sin dirección exacta)
- `desglose`: `precioBaseCop`, `precioDomicilioCop`, `precioTotalCop`
- `clientePrimerNombre` (solo primer nombre)
- `calificacionCliente` (opcional; `null` si el cliente no tiene reseñas)
- `expiraEn` (**ISO8601**, marca de tiempo **del servidor** — autoridad para la ventana de 30 s)

### Eventos de seguimiento (WebSocket / push)

| Evento | Uso |
|--------|-----|
| `solicitud.expirada` | Ventana de 30 s cerrada en servidor |
| `solicitud.cliente_acepto` | Cliente confirmó tras aceptación del pro → pro **OCUPADO** |
| `solicitud.cliente_rechazo` | Cliente rechazó la oferta → pro sigue **DISPONIBLE** |
| `solicitud.ya_asignada` | La solicitud ya no está vigente para este pro |

### GET `/api/v1/profesionales/me/solicitud-activa`

- **Uso:** recuperación al reabrir la app o reconectar WebSocket.
- **Respuesta 200:** `{ solicitud: SolicitudEntrante | null }` (null si no hay vigente).
- **Errores:** `403` `PROFESIONAL_NO_HABILITADO`.

### POST `/api/v1/profesionales/me/solicitudes-entrantes/:id/aceptar`

- **Idempotente.** El servidor revalida: pro **DISPONIBLE**, solicitud **existe**, **vigente**,
  **dirigida a ese profesional**, no expirada.
- **Respuesta 200:** `{ resultado: "ACEPTADA" | "RECHAZADA" | "EXPIRADA" | "YA_ASIGNADA", … }`.
- **Efecto éxito `ACEPTADA`:** estado solicitud → espera cliente; pro permanece **DISPONIBLE** hasta
  `solicitud.cliente_acepto`.
- **Errores:** `400` `VALIDATION` (id mal formado), `403` `PROFESIONAL_NO_DISPONIBLE` /
  `PROFESIONAL_NO_HABILITADO`, `404` `SOLICITUD_ENTRANTE_NO_ENCONTRADA`, `409`
  `SOLICITUD_NO_VIGENTE`.

### POST `/api/v1/profesionales/me/solicitudes-entrantes/:id/rechazar`

- **Idempotente.** Mismas revalidaciones que aceptar (excepto transición a espera cliente).
- **Respuesta 200:** `{ resultado: "RECHAZADA" | "EXPIRADA" | "YA_ASIGNADA", … }`.
- **Efecto:** pro sigue **DISPONIBLE**; liberar slot de solicitud activa.
- **Errores:** como aceptar.

### POST `/api/v1/profesionales/me/solicitudes-entrantes/:id/procesar-expiracion` (opcional explícito)

- **Uso:** la app llama al llegar a `expiraEn` en UI para que el **servidor** confirme expiración
  (el reloj del celular **no** es fuente de verdad).
- **Respuesta 200:** `{ resultado: "EXPIRADA" | "YA_ASIGNADA" | … }`.
- **Errores:** `400` `VALIDATION`, `404` `SOLICITUD_ENTRANTE_NO_ENCONTRADA`, `409`
  `SOLICITUD_NO_VIGENTE`.

### Reglas que el servidor debe revalidar (resumen)

- Profesional **aprobado**, **activado** y **`disponibilidad = DISPONIBLE`** al aceptar/rechazar
  dentro de la ventana.
- Solicitud **existe**, **vigente**, **no expirada** según **`expiraEn` del servidor**, asignada a
  ese `profesionalId`.
- **Una sola solicitud activa** por profesional.
- Tras **`solicitud.cliente_acepto`:** PATCH disponibilidad → **OCUPADO** (o transacción atómica
  en el mismo evento).
- Matching: solo profesionales **verificados, activados y DISPONIBLES**.

### Seguridad y privacidad

- **Dirección exacta** del cliente: solo tras **aceptación mutua** (pro aceptó + cliente confirmó);
  no en `solicitud.entrante`.
- **Registro de push token** por dispositivo (`POST` TBD) vinculado al JWT del profesional; invalidar
  al logout.
- **Auditoría:** aceptaciones, rechazos, expiraciones y cambios a **OCUPADO** por aceptación del
  cliente — `profesionalId`, `solicitudId`, timestamps servidor, resultado (`ACEPTADA` / `RECHAZADA` /
  `EXPIRADA` / `YA_ASIGNADA`), IP/dispositivo cuando aplique.
- Rate limit en aceptar/rechazar por solicitud y por cuenta.

## Pantalla 9 — Servicio en curso

Requisito transversal: mismo JWT que el panel (**aprobado + activado**). El servicio en curso existe
solo después de que **el profesional aceptó y el cliente confirmó**. **Una sola** operación activa
por profesional. La **dirección exacta** del cliente viaja **solo a partir de ese momento** (no en
la solicitud entrante).

Cada respuesta de esta sección incluye **`ahoraServidor`** (ISO8601 del servidor). La app calcula el
desfase una vez por consulta y lo usa para el cronómetro y la cuenta del bloqueo. El reloj del
celular no es fuente de verdad.

### GET `/api/v1/profesionales/me/servicio-activo`

- **Uso:** pantalla en curso y recuperación al volver a primer plano. También al **login o reapertura**:
  si hay servicio en `EN_CAMINO`, `LLEGUE` o `INICIADO`, `resolvePostLoginRoute` debe abrir esta
  pantalla (ruta frontend `ProfessionalServiceInProgressPlaceholder`).
- **Respuesta 200:** `{ servicio: ServicioEnCurso | null, ahoraServidor }`. `null` si no hay activo
  (finalizado o cancelado no cuenta como activo).
- **`ServicioEnCurso`:** `id`, `etapa` (`EN_CAMINO` | `LLEGUE` | `INICIADO` | `FINALIZADO` |
  `CANCELADA_POR_PROFESIONAL`), servicio (`servicioId`, `nombre`, `duracionMin`),
  `clientePrimerNombre`, `direccionExacta`, desglose (`precioBaseCop`, `precioDomicilioCop`,
  `precioTotalCop`), marcas `llegadaEn`, `iniciadoEn`, `finalizadoEn`, `canceladoEn`,
  `intentosFallidosPin`, `bloqueadoHasta`, `motivoCancelacion`.
- **El PIN no forma parte de esta respuesta.** Nunca.
- **Errores:** `401`, `403` `PROFESIONAL_NO_HABILITADO`.

### POST `/api/v1/profesionales/me/servicios-en-curso/:id/llegada`

- **Idempotente.** Solo desde `EN_CAMINO`. Si ya está en `LLEGUE` o `INICIADO`, devuelve el estado
  actual sin retroceder.
- **Efecto:** `etapa = LLEGUE`, guarda `llegadaEn`. El cliente pasa a ver su PIN de 4 dígitos.
- **Respuesta 200:** `{ servicio, ahoraServidor }`.
- **Errores:** `400` `VALIDATION`, `403` `PROFESIONAL_NO_HABILITADO`, `404`
  `SERVICIO_EN_CURSO_NO_ENCONTRADO`, `409` `ETAPA_NO_PERMITE_ACCION`.

### POST `/api/v1/profesionales/me/servicios-en-curso/:id/validar-pin`

- **Body:** `{ "pin": "1234" }` (exactamente 4 dígitos). El servidor compara contra el PIN guardado
  (hash). **La respuesta nunca incluye el PIN.**
- **Reglas:** máximo **3 intentos fallidos**. Al tercero, bloqueo de **5 minutos** con
  `bloqueadoHasta` del servidor. Al cumplirse el bloqueo se **reinician los 3 intentos**. Rate limit
  por solicitud, cuenta e IP.
- **Respuesta 200:** `{ resultado: "VALIDO" | "INVALIDO" | "BLOQUEADO", intentosRestantes,
  bloqueadoHasta, servicio, ahoraServidor }`. Un PIN mal escrito no es un 4xx de negocio: va en
  `resultado`.
- **Efecto `VALIDO`:** `etapa = INICIADO`, guarda `iniciadoEn`. Si ya estaba `INICIADO`, responde
  `VALIDO` sin consumir otro intento.
- **Errores:** `400` `VALIDATION` (PIN que no tiene 4 dígitos), `403` `PROFESIONAL_NO_HABILITADO`,
  `404` `SERVICIO_EN_CURSO_NO_ENCONTRADO`, `409` `ETAPA_NO_PERMITE_ACCION` (no está en `LLEGUE`).

### POST `/api/v1/profesionales/me/servicios-en-curso/:id/cancelar`

- **Body:** `{ "motivo": "CLIENTE_AUSENTE" | "DIRECCION_INCORRECTA" | "CLIENTE_CANCELO_EN_PERSONA" | "NO_PUEDO_CONTINUAR" }`.
  Sin texto libre.
- **Reglas:** solo en `EN_CAMINO` y `LLEGUE`. **No** en `INICIADO`.
- **Efecto:** `etapa = CANCELADA_POR_PROFESIONAL`. El cliente **no paga nada** y el matching busca
  otro profesional. El profesional **queda OCUPADO** hasta que él pase a Disponible. Registrar la
  cancelación (`profesionalId`, `servicioId`, motivo, timestamp servidor, IP) para detectar abuso.
- **Idempotente** si ya está cancelada.
- **Respuesta 200:** `{ servicio, ahoraServidor }`.
- **Errores:** `400` `VALIDATION` (motivo no permitido), `404` `SERVICIO_EN_CURSO_NO_ENCONTRADO`,
  `409` `ETAPA_NO_PERMITE_ACCION`.

### POST `/api/v1/profesionales/me/servicios-en-curso/:id/finalizar`

- **Reglas:** solo si `etapa = INICIADO`. **Idempotente** si ya está `FINALIZADO`.
- **Efecto:** `etapa = FINALIZADO`, guarda `finalizadoEn`. El profesional **sigue OCUPADO**.
- **Respuesta 200:** `{ servicio, ahoraServidor }`.
- **Errores:** `404` `SERVICIO_EN_CURSO_NO_ENCONTRADO`, `409` `ETAPA_NO_PERMITE_ACCION`.

### Eventos (WebSocket / push)

| Evento | Uso |
|--------|-----|
| `servicio.llegada` | El profesional marcó llegada; el cliente muestra el PIN |
| `servicio.iniciado` | PIN válido; el cliente ya no puede cancelar |
| `servicio.cancelado_por_profesional` | Canceló el profesional; el cliente no paga y se busca otro |
| `servicio.finalizado` | El profesional cerró el servicio |

### Reglas que el servidor debe revalidar

- Etapa actual antes de llegada, PIN, cancelar o finalizar.
- PIN, intentos y `bloqueadoHasta` con hora de servidor.
- Motivo dentro de la lista cerrada.
- Con servicio activo (`EN_CAMINO`, `LLEGUE` o `INICIADO`): `PATCH .../disponibilidad` a
  **DISPONIBLE** y el cierre de sesión responden **`409`/`403` `SERVICIO_EN_CURSO_ACTIVO`**.
- El **cliente no puede cancelar** si el servicio está **INICIADO**.

### Decisiones pendientes

- Efecto en comisión y en pago en efectivo cuando el profesional cancela (el cliente no paga; cómo
  se registra la comisión queda abierto).
- Si el profesional debe poder reportar un problema durante **INICIADO** (hoy no hay salida ni
  cancelación en esa etapa).

### Registro en historial (efecto de finalizar / cancelar pro)

Al **finalizar** o **cancelar por profesional** (pantalla 9), el backend debe **crear o reconocer**
un ítem de historial **idempotente** por `servicioId` / `solicitudEntranteId`. La pantalla 10 **solo
lee**; no expone un endpoint de «registrar» al profesional.

- **Finalizado:** `estado = FINALIZADO`, montos con comisión y neto (ver pantalla 10), `cerradoEn =
  finalizadoEn`, método de pago real del servicio.
- **Cancelado por profesional:** `estado = CANCELADO`, montos en **0**, `motivoCancelacion` de la
  lista cerrada, `cerradoEn = canceladoEn`.
- **Cancelaciones del cliente tras aceptar:** hoy **no** entran al historial del profesional;
  definir regla de negocio y contadores.

## Pantalla 10 — Historial / ingresos

Requisito transversal: mismo JWT (**aprobado + activado**). Ruta frontend
**`ProfessionalEarningsHistory`**. Entrada desde el panel (**«Mis ingresos»**); compatible con
servicio en curso activo.

**Semilla demo:** `sembrarHistorialDemo` y el flag **`origenSemilla`** existen **solo en desarrollo**
(`__DEV__` / entornos no productivos) y **nunca en producción**.

Cada respuesta incluye **`ahoraServidor`** (ISO8601). Límites de **Hoy / Semana / Mes** se calculan
en **hora Bogotá (UTC−5 fijo)**, no con la zona del dispositivo. **Semana:** lunes 00:00:00 a
domingo 23:59:59 (inclusive) en calendario Bogotá.

### Comisión e ingresos (reglas de negocio)

- Comisión Lookify: **15 % solo sobre `precioBaseCop`**, redondeo al **entero** más cercano en COP:
  `round((precioBaseCop * 15) / 100)`.
- **Domicilio:** 100 % del profesional (no entra en la base de comisión).
- **`precioTotalCop = precioBaseCop + precioDomicilioCop`**.
- **Neto profesional = `precioTotalCop − comisión`** (solo servicios finalizados).
- El **servidor** calcula y persiste `comisionCop`, `netoCop`, `comisionEfectivoCop` y los montos de
  cada ítem; la app **solo muestra** los valores del API y **NUNCA recalcula** comisión ni neto.
- **Ajuste ±20 %** sobre precio base: **aplazado** (no implementado en frontend).
- En **efectivo**, la UI muestra comisión **informativa** («Debes a Lookify» por servicio; total de
  comisión en efectivo en el resumen). **Sin** saldo global, cobro automático, bloqueo de cuenta ni
  botón de pago en esta fase — **regla de cobro del efectivo pendiente** en backend/finanzas.
- **Digital:** **pago al profesional** de lo cobrado (neto) — timing, retenciones y pasarela **TBD**.

### GET `/api/v1/profesionales/me/historial-ingresos/resumen`

- **Query:** `periodo=HOY|SEMANA|MES`.
- **Respuesta 200:** `{ resumen: ResumenPeriodoHistorial, ahoraServidor }`.
- **`ResumenPeriodoHistorial`:** `periodo`, `cantidadFinalizados`, `cantidadCancelados`, `totalCop`,
  `comisionCop`, `netoCop`, `comisionEfectivoCop` (suma de comisiones de finalizados pagados en
  efectivo). Los **cancelados solo incrementan `cantidadCancelados`**; no suman dinero.
- **Errores:** `400` `PERIODO_INVALIDO`, `403` `PROFESIONAL_NO_HABILITADO`.

### GET `/api/v1/profesionales/me/historial-ingresos`

- **Query:** `periodo=HOY|SEMANA|MES`, `cursor` opcional, `limit` (default 20, max 50).
- **Respuesta 200:** `{ items: HistorialIngresosItem[], nextCursor, ahoraServidor }`.
- **`HistorialIngresosItem`:** `id`, `servicioNombre`, `clientePrimerNombre`, `metodoPago`
  (`EFECTIVO`|`DIGITAL`), `estado` (`FINALIZADO`|`CANCELADO`), montos (`precioTotalCop`, `comisionCop`,
  `netoCop`; **0** si cancelado), `cerradoEn` (ISO8601), `motivoCancelacion` (solo cancelados pro).
  **Sin** PII extra (dirección, correo, teléfono, documento).
- **Orden:** `cerradoEn` descendente; desempate estable por `id`.
- **Cursor:** opaco; formato interno sugerido `` `${cerradoEnMs}:${id}` ``; **`400` `CURSOR_INVALIDO`**
  si no corresponde al periodo o está caducado.
- **Errores:** `400` `PERIODO_INVALIDO` | `CURSOR_INVALIDO`, `403` `PROFESIONAL_NO_HABILITADO`.

### Panel — resumen del día

- El **GET panel principal** debe incluir **`resumenDia`** coherente con **`periodo=HOY`** del
  historial (`serviciosRealizados` = finalizados de hoy; `ingresosCop` = neto de hoy). No duplicar
  fuentes de verdad.

### Método de pago

- En producción: método real registrado al cerrar el servicio (pasarela / efectivo confirmado).
- Mock actual alterna Efectivo/Digital por hash del `id` **solo para demo** — no replicar en backend.

### Seguridad y privacidad

- Historial acotado al **`profesionalId`** del JWT.
- Rate limit en listados y resúmenes por cuenta.
- Ítems **inmutables** tras cierre; correcciones vía procesos admin/ajustes, no PATCH al profesional.

### Decisiones pendientes (pantalla 10)

- **±20 %** en precio base al ofertar/ejecutar.
- **Cobro** de comisión en servicios **efectivo** (liquidación, plazos, recordatorios).
- **Liquidación** al profesional de cobros **digitales**.
- **Cancelaciones del cliente** después de aceptación mutua: visibilidad en historial, métricas y
  posible impacto en rating/disponibilidad.
- Unificar **semilla/demo** (`origenSemilla`) solo entornos no productivos.
- **Revisión legal y fiscal** (facturación, retenciones, comprobantes de comisión en efectivo y digital).
