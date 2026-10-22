# Lookify — Estado del proyecto

**Flujo cliente (pantallas 1 a 10): completo.** Verificado en celular por USB y
subido a GitHub (`e0696de` en `main`). Siguiente bloque: **App Profesional**, construida
**pantalla por pantalla** (una pantalla por turno; el wizard de 4 pasos en una sola
pantalla quedó descartado). Entrada pro desde Tipo de cuenta → `ProfessionalApp`
(Login Profesional dentro del stack pro). **Siguiente paso inmediato:** pantallas pro 1 a 10
completas; el siguiente paso (Admin Web o los pendientes de negocio) lo define el dueño del proyecto.

**Commits recientes:** `7db63d8` — feat(pro) pantalla 10 historial de ingresos (`main`) ·
`31a2da9` — feat(pro) pantalla 9 servicio en curso (`main`) · `3c5cc99` — docs(pro) contrato
pantalla 8 (`main`).

Fase actual: **frontend con backend opcional**. La app sigue siendo React Native +
Expo SDK 57, pero ya existe una capa de servicios (`src/services/`) que se puede
conectar al backend real. Con `EXPO_PUBLIC_USE_BACKEND=false` (default) todo es
mock local, sin red; con `EXPO_PUBLIC_USE_BACKEND=true` se usan el BFF de reservas
(`apps/realtime-server`) y el socket. Ver **sección 6** (fases 4A/4B).

---

## 1. Pantallas construidas y verificadas

Flujo del cliente, en orden de navegación.

### 1. Login — `src/screens/LoginScreen.tsx`
Se eliminó el bloque "o continúa con" junto a los botones de Google y Apple
(y sus 6 estilos huérfanos), se quitó el import sin usar de `typography`, y el
contenido quedó centrado verticalmente dentro de la tarjeta blanca
(`justifyContent: 'center'`) en vez de apilado arriba. La zona navy se amplió a
`flex: 2` contra `flex: 3` de la tarjeta, con el logo a 96 px.

Validación UX en `src/utils/validators.ts`: correo con formato válido (trim en
correo); contraseña obligatoria sin trim (`length > 0`). Errores por campo tras
`onBlur` vía `TextField` (`error`). «Ingresar» deshabilitado hasta que ambos
campos sean válidos. Login simulado contra `src/data/mockUsers.ts` (comparación
de correo sin distinguir mayúsculas; contraseña sí distingue). Cuenta de prueba:
`cliente@lookify.test` / `Lookify123`. Si falla: «Correo o contraseña incorrectos»;
si acierta: `navigation.reset` a Home.

### 2. Selección de tipo de cuenta — `src/screens/AccountTypeScreen.tsx`
Se le agregó el header con logo, marca y slogan igual que en Login. El header
quedó de altura natural (sin `flex`) porque fijarlo en `flex: 2` recortaba la
tarjeta de profesional y el botón Continuar fuera de la pantalla. El cuerpo es
un `ScrollView` con `flexGrow: 1` y `justifyContent: 'space-between'`: tarjetas
y Continuar agrupados arriba, el link "¿Ya tienes cuenta?" anclado abajo.

### 3. Registro de cliente — `src/screens/RegisterClientScreen.tsx`
Formulario con nombre, documento (C.C. / Pasaporte), nacionalidad, fecha de
nacimiento, teléfono, correo, contraseña, **confirmar contraseña** y términos.
Reglas en `validators.ts` (trim en nombre, documento, nacionalidad, teléfono y
correo; **sin trim** en contraseñas). Edad mínima 18 años (fecha completa).
Correo duplicado (incluida la demo): «Este correo ya está registrado». «Crear
cuenta» deshabilitado hasta formulario válido + términos. Errores tras `onBlur`
(fecha al elegir/cerrar el selector). Casilla legal con enlaces a
`ClientTermsRead` / `ClientPrivacyRead` (textos en `src/constants/legal/*Client*`,
versión borrador `2026-10-borrador-v1`). Consentimiento mock en `registerMockUser`
(`consentimiento.terminos` / `politicaDatos` con `version` y `aceptadoEn`
informativo). Registro exitoso: `reset` a Home. **Ampliación legal: verificada en
celular USB** (validaciones y flujo sin cambio). Usa
`@react-native-community/datetimepicker` con `onValueChange` + `onDismiss`.

**Pendiente:** migrar registro y login del **cliente** a servicios tipados (como App
Pro); hoy sigue `mockUsers.ts`.

**Revisión abogado antes del lanzamiento (cliente):** derecho de retracto; canal de
peticiones, quejas y reclamos (PQRS); responsabilidad frente al consumidor; si se
requieren **casillas separadas** para términos y política de datos (hoy una sola
casilla).

### 4. Inicio — `src/screens/HomeScreen.tsx`
Se corrigió el estirado vertical de los chips de categoría, causado por dos
cosas a la vez: el `FlatList` horizontal sin `style` crecía verticalmente, y su
contenedor de contenido estiraba cada chip con el `alignItems: 'stretch'`
implícito. Se agregaron los íconos de `@expo/vector-icons` encima del texto y se
corrigió la pluralización del contador ("1 profesional" vs "2 profesionales").

### 5. Selección de servicio — `src/screens/ServiceSelectionScreen.tsx`
Pantalla nueva. Recibe `categoriaId` y `categoriaNombre` por parámetros de
navegación desde Inicio, muestra el nombre de la categoría en el header y lista
los servicios de esa categoría con nombre, duración y precio. Selección única
por radio; "Continuar" deshabilitado hasta elegir uno.

### 6. Buscando profesional — `src/screens/MatchingScreen.tsx`
Fondo navy, ícono de búsqueda (pulso), checklist de 3 pasos simulados
(`MOCK_STEP_MS` ≈ 1,5 s; la UI menciona la ventana de 30 s del profesional).
Parámetros: `categoriaId`, `categoriaNombre`, `servicioId`, `radioKm` (3 | 6),
`rejectionCount`, `rejectedIds`. Candidatos vía `filtrarCandidatosMatching`
(misma categoría, `verificado`, `estado === 'DISPONIBLE'`, distancia ≤ radio,
sin rechazados). Si `rejectionCount >= 3` o no hay candidatos → ampliar a 6 km /
cancelar sin costo (sin checklist). Éxito → `replace('ProfessionalOffer', …)` con
`distanciaKm` redondeada a 1 decimal (`redondearDistanciaKm`). Alerta compartida
`promptCancelarSolicitud`; «Seguir buscando» reanuda el checklist donde iba.

### 7. Oferta de profesional — `src/screens/ProfessionalOfferScreen.tsx`
Fondo beige, tarjeta con acento honey: perfil, portafolio, reseña destacada y
desglose vía `src/utils/pricing.ts` (`formatCOP`). `distanciaKm` de la ruta (1 decimal)
para UI, domicilio y params; ETA con `VELOCIDAD_ESTIMADA_KM_H` en `constants/geo.ts`
(mín. 1 min). «Aceptar» → `replace('Tracking', …)` con `allowExitRef` antes del
`replace`. «Buscar otro» → `allowExitRef` +
`replace('Matching', …)` con rechazo. Atrás/gesto: `promptCancelarSolicitud` (cancelación
sin costo). Datos inválidos → `reset` Home.

### 8. Seguimiento en vivo — `src/screens/TrackingScreen.tsx`
Mapa **`MapView` + `PROVIDER_DEFAULT`** (no placeholder), marcadores cliente (navy) y
profesional (honey). En Expo Go (Android) el mapa puede verse en blanco por la API key
embebida vencida (problema conocido, no es bug del código). Pill «En camino», tarjeta
inferior con ETA/distancia animados (`MOCK_TRACKING_MS` 12 s), profesional + servicio,
Llamar/Mensaje (Alert mock), «Cancelar servicio» y atrás/gesto con
`promptCancelarServicio`. Simulación lineal hacia `MOCK_CLIENT_LOCATION`; al terminar →
`replace('ServiceInProgress', …)`. Cancelar confirma con `reset` Home. Entrada desde
Oferta vía `replace` (Oferta no queda en el stack). **Verificada en celular USB.**

### 9. Servicio en progreso — `src/screens/ServiceInProgressScreen.tsx`
Fondo navy, checklist de 3 estados (Profesional llegó / Servicio iniciado / Servicio
finalizado), tiempos mock en `src/constants/serviceInProgress.ts` (`MOCK_LLEGADA_MS`,
`MOCK_PIN_INGRESO_MS`, `MOCK_SERVICIO_MS`, `MOCK_FINAL_MS`). Tras «Profesional llegó»
el cliente ve un PIN de 4 dígitos (`generarPinServicioMock` en `mockServicePin.ts`, una
vez por montaje; en producción lo genera el backend al aceptar el servicio y se mantiene
igual durante toda la solicitud). Texto «Esperando que el profesional ingrese el código»
hasta validación mock; **INICIADO** solo tras PIN válido. Duración oficial del servicio
solo como texto (`duracionMin`). Barra de progreso en fase «Servicio iniciado». Cancelar/atras
hasta validar PIN (`promptCancelarServicio`); después, `alertServicioEnCurso`. Fin →
`replace('PaymentRating', …)` sin PIN en params. **Verificada en celular USB.**

### 10. Pago y calificación — `src/screens/PaymentRatingScreen.tsx`
Fondo beige, tarjeta blanca: check «Servicio finalizado», nombre servicio/profesional,
desglose desde params con `formatCOP` (servicio + domicilio = total, sin comisión visible).
Método de pago visual (Efectivo / Tarjeta / Nequi; default Efectivo), hint «Pago simulado
en esta versión». `StarRating` obligatorio, comentario opcional (250 chars). «Enviar
calificación» → mock + `reset` Home. Atrás: `alertCalificacionPendiente`. Params inválidos
o suma de precios inconsistente → `reset` Home. **Verificada en celular USB.**

### Cambios transversales aplicados a todas las pantallas
- `SafeAreaView` migrado de `react-native` (deprecado) a
  `react-native-safe-area-context`.
- `SafeAreaProvider` envolviendo el `NavigationContainer` en `AppNavigator.tsx`.
- **Validaciones del frontend:** solo UX; el backend debe volver a validar TODO.
  El login actual es simulado (`mockUsers.ts`). `src/utils/validators.ts` se
  reutilizará en el registro del profesional. `TextField` admite `error?: string`
  (borde y texto con `colors.error`). Si recibe `secureTextEntry`, muestra un botón
  de ojo (`eye-outline` / `eye-off-outline`) con estado `visible` propio por campo;
  `autoCapitalize="none"` y `autoCorrect={false}` por defecto en esos inputs.

---

## 2. Pantallas pendientes

Flujo cliente 1–10: construido, verificado en celular USB y subido a GitHub.
En curso: **App Profesional** pantalla por pantalla. Las pantallas oficiales del
mockup siguen siendo 10 (incluyen Tipo de cuenta); la **numeración provisional**
de implementación (9 pantallas pro, Tipo de cuenta compartida con el cliente) **no
renumerará** la lista oficial hasta confirmación explícita.

### App Profesional — numeración provisional de implementación

_(Tipo de cuenta = pantalla compartida del cliente; no cuenta en esta lista.)_

1. Login Profesional — **verificada en celular USB**
2. Registro — **verificada en celular USB**
3. Selección de servicios — **verificada en celular USB**
4. Carga de certificados — **verificada en celular USB**
5. Estado de verificación — **verificada en celular USB**
6. Panel principal (toggle Disponible/Ocupado) — **verificada en celular USB**
7. Mi portafolio — **verificada en celular USB**
8. Solicitud entrante (ventana de 30 s) — **verificada en celular USB** (pruebas 1–8 y
   regresión toggle; pruebas 9–10 no verificables a mano con la app actual)
9. Servicio en curso (En camino, Llegué, Iniciado + ingreso PIN del cliente) — **verificada en celular USB** (13 pruebas)
10. Historial/ingresos — **verificada en celular USB** (12 pruebas)

### App Profesional — 10 pantallas oficiales (sin renumerar)

1. Login
2. Tipo de cuenta
3. Registro datos personales
4. Selección de servicios
5. Carga de certificados
6. Estado de verificación
7. Panel principal (con toggle Disponible/Ocupado)
8. Solicitud entrante (ventana de 30 s)
9. Servicio en curso (con ingreso del PIN del cliente)
10. Historial/ingresos

### App Profesional — Login (pantalla 1 provisional)

`src/screens/professional/ProfessionalLoginScreen.tsx`: cabecera navy con
`BackHeader`, logo real (`assets/logo-lookify.png`, 96 px), **Lookify PRO**,
eslogan «Convierte tu talento en ingresos»; tarjeta blanca; segmento
Ingresar | Registrarme; validación como cliente (`validators.ts`); login vía
`getProfessionalAuthService()` (mock en `src/services/mock/`). Tras login,
`resolvePostLoginRoute` + `resetProfessionalSession` con params de sesión tipados según
`estadoSolicitud`, `onboardingPaso` y `profesionalActivado` (onboarding 3–5, panel 6 o
verificación 5). **Registrarme** navega a `RegisterProfessional`.
**Verificada en celular USB.**

Cuentas demo (mock): `pro.aprobado@lookify.test`, `pro.revision@lookify.test`,
`pro.rechazado@lookify.test`, `pro.docs-servicios@lookify.test`,
`pro.docs-certificados@lookify.test` — contraseña `Lookify123`.

Placeholders post-login incluyen **«Cerrar sesión (temporal)»** (`resetProfessionalSession`
→ `ProfessionalLogin`) para probar las 5 cuentas sin recargar la app; se reemplazará
por cierre de sesión real (JWT + limpieza de token).

**Onboarding entre pantallas 3–5:** params tipados (`ProfessionalSessionRouteParams`,
incluye `solicitudId` tras registro). **Sin contexto global** por ahora. Pendiente
opcional: contexto de sesión + JWT en `expo-secure-store` (decidir más adelante).

**Navegación (stack pro):** el root del cliente tiene una sola entrada a la app
profesional, `ProfessionalApp`, que monta `ProfessionalStackNavigator` (`src/navigation/ProfessionalStackNavigator.tsx`)
con rutas pro incl. **`ProfessionalIncomingRequest`**, **`ProfessionalServiceInProgressPlaceholder`**
(pantalla 9 real; el nombre de ruta sigue con sufijo Placeholder), más login, registro, legal, onboarding 3–5, panel, portafolio y
verificación (varias rutas legacy con sufijo **Placeholder**). Tipo de cuenta → `navigate('ProfessionalApp')`.
Helper `resetProfessionalSession` (`src/navigation/professionalNavigation.ts`): login
exitoso, registro exitoso, guardar servicios, params inválidos y cerrar sesión hacen
**reset en el root** a una sola ruta `ProfessionalApp` con el stack anidado en la
pantalla destino, para que el atrás de Android no vuelva al flujo cliente (paridad con
el root plano anterior). Login Pro: atrás al parent con `canGoBack()` cuando se entró
desde Tipo de cuenta. **Verificado en celular USB** (refactor stack, sin cambio de UI).

**Backend pendiente (Login Pro):** límite de intentos y bloqueo; JWT y almacenamiento
seguro (`expo-secure-store`); recuperación de contraseña.

### App Profesional — Registro (pantalla 2 provisional)

`RegisterProfessionalScreen.tsx`: mismo patrón que registro cliente (validaciones
`validators.ts`, logo 96 px, BackHeader, footer fijo). Una casilla acepta **Términos
y Política** (enlaces a `ProfessionalTermsRead` / `ProfessionalPrivacyRead`; textos en
`src/constants/legal/`). Versiones legales en borrador (`TERMS_VERSION` /
`DATA_POLICY_VERSION`, p. ej. `2026-10-borrador-v1`); vigencia mostrada como
«Pendiente de publicación (borrador)». La **fecha real de vigencia** y la versión
definitiva se fijan cuando un abogado apruebe el texto y se lance la app. Banner
«BORRADOR sujeto a revisión legal» solo en `__DEV__`. Un abogado debe revisar textos
antes del lanzamiento y decidir si se requieren **casillas separadas** para términos
y política.

Consentimiento: el frontend envía `{ version, aceptadoEn }` por documento; **`aceptadoEn`
es solo informativo** — el backend registrará su propio sello de tiempo e **IP**.

Datos legales **pendientes antes del lanzamiento** (política pro): razón social, NIT,
domicilio y correo para solicitudes de datos personales (en borrador aparecen como
`[PENDIENTE]` y banner en `__DEV__`).

Registro vía `getProfessionalRegistrationService().registrarProfesional` (mock +
`mockProfessionalRegistryStore`). Errores: `EMAIL_DUPLICATE`, `DOCUMENTO_DUPLICADO`,
`NETWORK`. `fechaNacimiento` en payload como **YYYY-MM-DD local** (no `toISOString`).
Éxito → `resetProfessionalSession` a `ProfessionalServiceSelection` con `solicitudId`.
**Verificada en celular USB.**

**Backend pendiente (Registro):** rate limit; unicidad real de correo/documento;
política de contraseñas; consentimiento con IP y timestamp servidor.

**Pruebas Jest:** commit aparte cuando las pantallas pro estén verificadas en USB.

### App Profesional — Selección de servicios (pantalla 3)

`ProfessionalServiceSelectionScreen.tsx` en el stack pro (`ProfessionalServiceSelection`;
no ruta `ProfessionalServiceSelectionPlaceholder` en navigator). Catálogo vía `getCatalogService()`
(`listarServiciosPorCategoria`; mock lee `mockServices.ts`). Guardado vía
`guardarServicios({ solicitudId, servicioIds })` en `ProfessionalRegistrationService`
(servicios en mapa por `solicitudId` en store mock; cuentas semilla no se mutan).
Checkboxes multi-categoría; mínimo 1 servicio. Sin `BackHeader`; atrás/gesto → Alert
«Seguir seleccionando» / «Cerrar sesión» → `resetProfessionalSession` → Login Pro
(`permitirSalida` antes de cada reset). Tras guardar → `resetProfessionalSession`
a la pantalla 4 (ruta `ProfessionalCertificateUploadPlaceholder`) con `servicioIds` y
`onboardingPaso: 'CERTIFICADOS'`.
Íconos categoría en `src/constants/categoryIcons.ts` (duplicado de Inicio; refactor
opcional compartir import con `HomeScreen`).

**Backend (pantalla 3):** `GET /api/v1/catalogo/servicios` ·
`PUT /api/v1/profesionales/solicitudes/:id/servicios` (body `{ servicioIds }`; el
backend revalida IDs contra el catálogo).

**Pendientes producto/técnicos (no implementados):**

- **(a)** Matching: filtrar por `servicioIds` del profesional, no solo categoría — tarea
  aparte + prueba USB (no tocar `MatchingScreen` / `mockProfessionals` hasta entonces).
- **(b)** Editar servicios ofrecidos después del onboarding.
- **(d)** Ajuste de precio ±20 % por servicio — **aplazado** (no implementado; pendiente backend/producto).

**Verificada en celular USB.**

### App Profesional — Carga de certificados (pantalla 4)

`ProfessionalCertificateUploadScreen.tsx` registrada en el stack pro bajo la ruta
**`ProfessionalCertificateUploadPlaceholder`** (deuda de nombre: el identificador sigue
diciendo «Placeholder» hasta un refactor de rutas acordado). Params:
`ProfessionalSessionRouteParams` con **`servicioIds` opcional**; si faltan, el mock resuelve
los servicios guardados por `solicitudId` (`obtenerServiciosDeSolicitud`).

Demo **`pro.docs-certificados@lookify.test`:** servicios sembrados en memoria para
`sol-demo-docs-certificados` (**pel-1**, **bar-2**, **una-1**); las cuentas semilla en
`mockProfessionalAccounts.ts` **no se mutan**.

Origen de archivo: galería, cámara (`quality` 0,7) o PDF (`expo-image-picker`,
`expo-document-picker`; tamaño con picker o `expo-file-system`; si el tamaño es
desconocido → `ARCHIVO_INVALIDO`). Máx. 5 MB; JPG, PNG, PDF. Metadatos: nombre/tipo y
entidad obligatorios; fecha de emisión opcional. Un certificado cubre ≥1 servicio elegido;
mín. 1 y máx. **3 certificados por servicio** (un certificado multi-servicio cuenta en
cada uno). Todo-o-nada al enviar: `SERVICIO_SIN_CERTIFICADO` si falta cobertura.

Servicio **`getProfessionalCertificateService()`** (mock en memoria por `solicitudId`):
`listarCertificados`, `obtenerServiciosDeSolicitud`, `agregarCertificado`,
`actualizarCertificado`, `eliminarCertificado`, `enviarSolicitudVerificacion`. Errores:
`ARCHIVO_INVALIDO`, `ARCHIVO_MUY_GRANDE`, `SERVICIO_SIN_CERTIFICADO`,
`LIMITE_CERTIFICADOS_SERVICIO`, etc. Tras enviar OK → `estadoSolicitud: EN_REVISION` vía
**mapa** `estadoSolicitudBySolicitudId` (no muta semillas); **al recargar la app el estado
mock se reinicia**. Navegación con `resetProfessionalSession` (login, params inválidos,
cerrar sesión, envío → `ProfessionalVerificationPlaceholder`). Atrás/gesto como pantalla 3;
modal agregar/editar intercepta el atrás de Android antes que la alerta de cerrar sesión.

**Permisos cámara/galería:** plugin `expo-image-picker` en `app.json` con textos en español;
en **Expo Go** los mensajes del plugin **no aplican** (solo surten efecto en **development
build** / binario propio). Sin `console.log` de URIs de certificados.

**Verificada en celular USB** (cobertura mín/máx por servicio, multi-servicio, todo-o-nada,
límite 5 MB, galería/cámara/PDF, envío a revisión).

**Backend pendiente (pantalla 4; frontend mock listo):**

- `GET /api/v1/profesionales/solicitudes/:id/certificados`
- `POST /api/v1/profesionales/solicitudes/:id/certificados` (multipart)
- `PATCH /api/v1/profesionales/solicitudes/:id/certificados/:certificadoId`
- `DELETE /api/v1/profesionales/solicitudes/:id/certificados/:certificadoId`
- `POST /api/v1/profesionales/solicitudes/:id/enviar-verificacion`

### App Profesional — Estado de verificación (pantalla 5)

`ProfessionalVerificationScreen.tsx` bajo la ruta **`ProfessionalVerificationPlaceholder`**
(deuda de nombre, igual que pantalla 4). Estados UI: **EN_REVISION** (resumen enviado +
«Actualizar estado»), **RECHAZADO** (motivo + servicios afectados + «Corregir certificados»
→ pantalla 4 con certificados intactos), **APROBADO sin activar** (código de activación;
no reemplaza la contraseña), **APROBADO activado** → login va directo al Dashboard
(`pro.aprobado@lookify.test`; mapa `activadoByProfesionalId`, no muta semillas).

Activación: **6 dígitos**, vigencia **10 min**, **5** intentos fallidos → bloqueo **15 min**,
reenvío cada **60 s**, máx. **3** reenvíos (solo `reenviarCodigoActivacion` en app; el
primer código lo genera la simulación admin `__DEV__` o la **primera** `obtenerEstadoVerificacion`
— simula correo del servidor). Límites en `src/constants/professionalActivation.ts`.
Validación en servicio; `emailEnmascarado` viene ya enmascarado del mock/backend.
Sin salida: reenvíos agotados + código expirado → mensaje soporte con marcadores.

Servicio **`getProfessionalVerificationService()`** (mock en memoria): `obtenerEstadoVerificacion`,
`actualizarEstadoVerificacion`, `iniciarCorreccionCertificados`, `reenviarCodigoActivacion`,
`validarCodigoActivacion`, `obtenerAvisoCorreccion` (banner en pantalla 4 al corregir),
`simularDecisionAdministrador` / `expirarCodigoActivacionDemo` (**solo `__DEV__`**; panel
DEMO en pantalla; `OPERACION_NO_PERMITIDA` si no es dev). Cuenta demo nueva:
**`pro.aprobado-nuevo@lookify.test`**. `resolvePostLoginRoute`: `APROBADO` + no activado →
pantalla 5; activado → Dashboard. Estado/rechazo/activación en mapas por `solicitudId` —
**al recargar la app se reinicia**. Navegación: `resetProfessionalSession` (corregir, activar,
cerrar sesión). **Verificada en celular USB.**

**Backend pendiente (pantalla 5):** ver `docs/contratos-backend-profesional.md`.

### App Profesional — Panel principal (pantalla 6)

`ProfessionalDashboardScreen.tsx` registrada bajo la ruta **`ProfessionalDashboardPlaceholder`**
(deuda de nombre: el identificador sigue diciendo «Placeholder»). Contenido (USB): cabecera
con foto de perfil («Cambiar foto» galería/cámara, recorte 1:1, JPG/PNG máx. 5 MB, quality 0,7;
avatar con iniciales si no hay foto), nombre y calificación con **`StarRating`** en modo
**`readOnly`** (prop opcional; pantalla 10 cliente sin cambios); toggle grande **Disponible /
Ocupado**; resumen del día con etiqueta **«Datos de ejemplo»**; **Mis calificaciones**
(promedio, total, últimas 2–3 reseñas; sin estrellas ni «0.0» si no hay reseñas — solo
«Todavía no tienes reseñas»); **Mis servicios** (precio base + duración, sin ±20 % en este
commit); botón **Mi portafolio** → `navigate` a **`ProfessionalPortfolioPlaceholder`** (solo
atrás, sin cerrar sesión); **Cerrar sesión** con confirmación («Seguir aquí / Cerrar sesión»).

Servicio **`getProfessionalDashboardService()`** (mock en memoria por `profesionalId`):
`obtenerPanelPrincipal`, `cambiarDisponibilidad`, `actualizarFotoPerfil`, `registrarCierreSesion`.
Pasar a **Disponible** exige **aprobado + activado** en el **servicio** (`PROFESIONAL_NO_HABILITADO`).
**Ubicación:** `expo-location` — `requestForegroundPermissionsAsync` en UI **antes** de
`cambiarDisponibilidad`; **no** `getCurrentPosition`; **no** se guardan, muestran ni loguean
coordenadas (`PUT` ubicación = contrato futuro en docs). Plugin en `app.json` (texto ES):
solo aplica en **development build**, no en **Expo Go** (igual que image-picker). Si niega
permiso → permanece **Ocupado**, mensaje + Ajustes. **`registrarCierreSesion`** deja siempre
**Ocupado** (producción: backend + inactividad/heartbeat). Disponibilidad/foto/reseñas/resumen
en mapas — **al recargar la app se reinicia**. Atrás/gesto Android: misma alerta que cerrar
sesión; `navigate` al portafolio **no** dispara `beforeRemove` del panel.

Semilla servicios (mapa, no muta cuentas): **`pro.aprobado`** → `sol-demo-aprobado`
(**pel-1**, **pel-2**, **maq-1**); **`pro.aprobado-nuevo`** → `sol-demo-aprobado-nuevo`
(**bar-1**, **bar-2**). Reseñas mock sembradas para ambos `profesionalId`. Tipo
**`ResenaProfesional`** — deuda: unificar con **`MockResenaDestacada`** del cliente cuando
exista backend compartido.

**Verificada en celular USB** (toggle permiso ok/denegado, foto galería/cámara, portafolio,
cierre → Ocupado, regresión StarRating cliente).

**Backend pendiente (pantalla 6):** ver `docs/contratos-backend-profesional.md` (panel, foto,
disponibilidad, reseñas, ubicación futura).

### App Profesional — Mi portafolio (pantalla 7)

`ProfessionalPortfolioScreen.tsx` registrada bajo la ruta **`ProfessionalPortfolioPlaceholder`**
(deuda de nombre: el identificador sigue diciendo «Placeholder»). Entrada desde el panel:
**Mi portafolio** → `navigate` (solo atrás, sin cerrar sesión).

**Reglas de producto (portafolio opcional):** no hay mínimo de fotos ni videos; el **matching
del cliente no filtra** por portafolio. **No hay revisión previa del admin** para publicar
trabajos (solo se aprueban **certificados** en onboarding). **Portada** = foto con **orden 0**
(`esPortada` en UI); **reordenar** fotos y videos por separado con botones mover antes/después
(sin drag). **Descripción** opcional, máx. **100** caracteres (trim en servicio). **Servicio
asociado** opcional, limitado a los `servicioIds` del profesional (`VALIDATION` si no pertenece).

**Límites:** hasta **10** fotos (JPG/PNG, **5 MB**, `quality` **0,7**, sin recorte forzado);
hasta **4** videos (MP4/MOV, **50 MB**, máx. **30 s**). **Aviso informativo** (texto fijo) si
hay **menos de 3 fotos**; no bloquea. **Videos:** solo galería; tarjeta con ícono play; preview
con **`expo-video`** en modal **al tocar** (probado en **Expo Go**); plugin `expo-video` en
`app.json`.

Servicio **`getProfessionalPortfolioService()`** (mock en memoria por `profesionalId`):
`obtenerPortafolio`, `listarServiciosAsociables`, `agregarFoto`, `agregarVideo`, `actualizarItem`,
`eliminarItem`, `reemplazarArchivo`, `moverItem`, `definirPortada`. Errores:
`LIMITE_FOTOS_PORTAFOLIO`, `LIMITE_VIDEOS_PORTAFOLIO`, `ITEM_PORTAFOLIO_NO_ENCONTRADO`,
`VIDEO_DURACION_EXCEDIDA`, más reutilizados (`ARCHIVO_INVALIDO`, `ARCHIVO_MUY_GRANDE`,
`PROFESIONAL_NO_HABILITADO`, `VALIDATION`, etc.).

**Semilla mock:** portafolio **vacío** para `pro-demo-aprobado` y `pro-demo-aprobado-nuevo`; **se
pierde al recargar** la app (mapa en memoria, no muta cuentas semilla).

**Verificada en celular USB** (vacío + aviso, fotos galería/cámara, portada, reemplazar, límites,
video galería + preview, servicio asociado).

**Deudas / follow-ups:**
- **(a) Oferta cliente:** hoy `ProfessionalOfferScreen` no muestra el portafolio real (IDs en
  `mockProfessionals` ≠ `pro-demo-*`). Cambio mínimo propuesto: `obtenerPortafolioPublicoParaOferta`
  en capa servicios — `Image` si hay `uri`, ícono actual si no, copy «Este profesional aún no ha
  publicado trabajos» si la lista está vacía.
- **(b) Guard explícito** de `solicitudId` en cada handler de picker (evitar `params.solicitudId!`).
- **(c) Nombre de rutas:** `ProfessionalPortfolioPlaceholderScreen.tsx` sin uso; rutas con
  sufijo **Placeholder** en pantallas 4, 5, 6, 7 y 9 (refactor de nombres pendiente).

**Backend pendiente (pantalla 7):** ver `docs/contratos-backend-profesional.md` (CRUD portafolio,
moderación a posteriori).

### App Profesional — Solicitud entrante (pantalla 8)

`ProfessionalIncomingRequestScreen.tsx` en ruta **`ProfessionalIncomingRequest`**. **No tiene botón
de entrada** en el panel: la pantalla aparece cuando llega una solicitud y solo si el profesional
está **verificado (APROBADO)**, **activado** y en toggle **DISPONIBLE**. Ventana de **30 s** con
**`expiraEn`** como autoridad del servidor; la UI recalcula el tiempo restante al volver a primer
plano (`AppState`). Al llegar a **0** la pantalla llama al servicio **`procesarExpiracion`** — la
app **no** decide sola si expiró. **Rechazar** o **expirar** deja al profesional **Disponible**,
sin penalización. **Atrás** (gesto o botón Android) cuenta como **rechazar** con `Alert` de
confirmación. Tras **Aceptar** queda en **«Esperando respuesta del cliente»** (sin cuenta de 30 s).
Si el **cliente acepta** → disponibilidad **OCUPADO** automáticamente y **`replace`** a
**`ProfessionalServiceInProgressPlaceholder`** (pantalla 9 real; la ruta conserva el nombre). Si el **cliente rechaza**
→ sigue **Disponible**. **Una sola solicitud activa** por profesional.

Contenido visible: servicio, **distancia aproximada**, **primer nombre** del cliente
(`primerNombre.ts`), calificación si hay reseñas, desglose **Precio base + Domicilio = Total**; **sin
dirección exacta**. Comisión del **15 % oculta**; **sin ajuste ±20 %** en esta pantalla.

**Arquitectura:** **`getProfessionalIncomingRequestService()`** — `obtenerSolicitudActiva`,
`suscribirseASolicitudesEntrantes`, `obtenerSolicitud`, `aceptarSolicitud`, `rechazarSolicitud`,
`procesarExpiracion`, `alCerrarSesion`; métodos DEMO **`simularSolicitudEntrante`**, `simularClienteAcepta`,
`simularClienteRechaza`, `simularExpiracionSolicitud` (**solo `__DEV__`**). Respuestas de acción:
**`resultado`:** `ACEPTADA` | `RECHAZADA` | `EXPIRADA` | `YA_ASIGNADA`. Errores nuevos:
**`PROFESIONAL_NO_DISPONIBLE`**, **`SOLICITUD_ENTRANTE_NO_ENCONTRADA`**, **`SOLICITUD_NO_VIGENTE`**.

**`ProfessionalIncomingRequestListener`** montado a nivel del stack pro (hermano del
`<Stack.Navigator>`): cuando hay solicitud vigente y el pro está DISPONIBLE, abre la pantalla 8
desde **cualquier pantalla** de la sesión. Navegación anidada desde el **root**:
`navigate('ProfessionalApp', { screen: 'ProfessionalIncomingRequest', params })` — en USB apareció
el error *«NAVIGATE was not handled by any navigator»* al usar `navigate('ProfessionalIncomingRequest')`
directo porque `useNavigation()` enlazaba al navigator padre; corregido con **`RootStackParamList`**.
Estado de ruta para deduplicar aperturas: **`professionalSessionFromState.ts`** (recorre estado anidado).

**Disponibilidad en listener:** polling **`consultarDisponibilidad`** vía
`getProfessionalDashboardService()` (~1,5 s) mientras hay sesión; el backend lo reemplazará por evento.

**Mock:** store en memoria por **`profesionalId`**; **se pierde al recargar** la app. DEMO en panel
(**`__DEV__`**) simula solicitud entrante; en pantalla 8 en espera, DEMO cliente acepta/rechaza.

**Verificada en celular USB** (pruebas 1–8 documentadas en turno de QA + regresión toggle Disponible/Ocupado).

**Deudas / follow-ups (pantalla 8):**
- **(a)** Pruebas USB **9** (solicitud entrante mientras el pro está en **Mi portafolio**) y **10**
  (DEMO deshabilitado con solicitud activa) **no verificadas a mano**. La pantalla 9 pro se probó por
  el flujo normal (panel → solicitud → cliente acepta). Opcional futuro: DEMO en portafolio solo para
  repetir la prueba 9.
- **(b)** Listener usa **polling** de disponibilidad; backend → evento push/WebSocket.
- **(c)** La comisión del **15 %** (solo sobre precio base) ya se **muestra** en la pantalla 10.
  El ajuste de precio **±20 %** sigue **aplazado**.
- **(d)** La pantalla 9 real ya está montada en **`ProfessionalServiceInProgressPlaceholder`**; el sufijo Placeholder de la ruta sigue como deuda de nombre.
- **(e)** La solicitud solo llega con la **app abierta**; **notificaciones push** en fase backend.

**Backend pendiente (pantalla 8):** ver `docs/contratos-backend-profesional.md`.

### App Profesional — Servicio en curso (pantalla 9)

`ProfessionalServiceInProgressScreen.tsx` en la ruta **`ProfessionalServiceInProgressPlaceholder`**
(deuda de nombre: el identificador sigue diciendo «Placeholder»). Se borró el archivo placeholder.
**No tiene botón de entrada.** Se abre con **`replace`** desde la pantalla 8 cuando el cliente acepta.
El profesional ya está **OCUPADO**.

**Etapas en una sola pantalla:** **EN_CAMINO** (servicio, primer nombre, dirección exacta y desglose
Precio base + Domicilio = Total con `formatCOP`; sin comisión ni ±20 %) → botón **«Ya llegué»** →
**LLEGUE** (el profesional escribe el PIN de 4 dígitos que le dicta el cliente) → PIN válido →
**INICIADO** (cronómetro y «Finalizar servicio»). La dirección de hoy es un **texto fijo de ejemplo**.
Botón **«Abrir en el mapa»** con `Linking` (sin paquete nuevo).

**PIN:** la app profesional **nunca** conoce el correcto. `validarPin` devuelve `VALIDO` |
`INVALIDO` (intentos restantes) | `BLOQUEADO`. Máximo **3** intentos; bloqueo **5 minutos**; al
cumplirse se reinician los intentos. El reloj usa **`ahoraServidor`**: la pantalla calcula el desfase
una vez por consulta y lo aplica al cronómetro y a la cuenta del bloqueo. Al volver a primer plano
(`AppState`) vuelve a pedir el servicio. El campo es numérico, máximo 4 dígitos, se limpia si falla
y no viaja por params ni a un log.

**Cancelación del profesional:** solo en **EN_CAMINO** y **LLEGUE**. Cuatro motivos, sin «Otro» ni
texto libre: «El cliente no está», «No encuentro la dirección», «El cliente canceló en persona»,
«No puedo continuar». Alerta y luego confirmación. En **INICIADO** no hay cancelar ni salida: el
atrás solo dice «El servicio ya empezó» / «Entendido». La flecha del encabezado abre **la misma
alerta** que el botón de Android. `permitirSalida` deja pasar el `navigate` al panel cuando finaliza
o cancela a propósito.

**Al finalizar o cancelar** vuelve al panel con `navigate` y **sigue OCUPADO**. Él decide cuándo
ponerse Disponible. El panel, al recuperar foco, vuelve a consultar el toggle y la tarjeta
**«Continuar servicio»**. Mientras hay servicio activo, pasar a Disponible y cerrar sesión se
rechazan con **`SERVICIO_EN_CURSO_ACTIVO`**.

Servicio **`getProfessionalServiceInProgressService()`**: `obtenerServicioActivo`, `marcarLlegada`,
`validarPin`, `cancelarPorProfesional`, `finalizarServicio`, y DEMO **`obtenerPinDemo`** /
**`expirarBloqueoPinDemo`** (solo `__DEV__`; fuera de eso, `OPERACION_NO_PERMITIDA`). Errores:
**`SERVICIO_EN_CURSO_NO_ENCONTRADO`**, **`ETAPA_NO_PERMITE_ACCION`**, **`SERVICIO_EN_CURSO_ACTIVO`**.
El tipo `ServicioEnCurso` no trae el PIN. Mock en memoria por `profesionalId`; no muta cuentas
semilla; **se pierde al recargar** la app.

**DEMO `__DEV__`:** muestra el PIN, «Quitar bloqueo» e «Ir al panel» (el servicio sigue activo).

**Verificada en celular USB** (13 pruebas).

**Deudas / follow-ups (pantalla 9):**
- El PIN del cliente (pantalla 9 cliente) y el de esta pantalla son **distintos** en el mock. En
  backend habrá **un solo PIN**, generado al aceptar ambos. La demo en un solo celular aún no enlaza
  cliente y profesional.
- La flecha del encabezado abre la misma alerta que el botón de Android.
- La ruta conserva el nombre **Placeholder**.
- Comisión del **15 %** visible en pantalla 10; ajuste **±20 %** aplazado.
- **Reapertura:** el contrato exige que `resolvePostLoginRoute` abra esta pantalla si hay servicio
  activo. Hoy el login sigue al panel y el mock se pierde al recargar.
- Al **finalizar** o **cancelar por profesional**, el mock registra el ítem en el **historial de
  ingresos** (idempotente por `servicio.id`).

**Backend pendiente (pantalla 9):** ver `docs/contratos-backend-profesional.md`.

### App Profesional — Historial / ingresos (pantalla 10)

`ProfessionalEarningsHistoryScreen.tsx` en la ruta **`ProfessionalEarningsHistory`** (sin sufijo
Placeholder). Entrada: botón **«Mis ingresos»** en el panel (funciona **con servicio activo**; no se
deshabilita). Atrás: **`goBack`** al panel (Android incluido); no hace `resetProfessionalSession`
salvo sesión inválida.

**Filtros:** chips **Hoy / Semana / Mes** (altura mínima 44, accesibilidad). Límites de periodo con
**UTC−5 fijo** sobre **`ahoraServidor`** (`src/utils/bogotaTime.ts`; sin `Intl` ni zona del celular).
**Semana:** lunes 00:00 a domingo 23:59:59 (calendario Bogotá).

**Resumen del periodo:** cantidad de **finalizados** y **cancelados** por separado; los cancelados
**solo cuentan**, no suman en total, comisión, neto ni comisión por efectivo. Montos del resumen solo
de **FINALIZADOS**: total cobrado, comisión Lookify, neto y línea **«Comisión por servicios en
efectivo»** (informativa; sin saldo global, cobro, bloqueo ni botón pagar).

**Comisión (mock):** **15 % solo sobre `precioBaseCop`**, redondeo al entero más cercano en pesos:
`Math.round((precioBaseCop * 15) / 100)` en `earningsMontos.ts`. Domicilio 100 % del profesional.
**Neto = precioTotalCop − comisión.** La pantalla **no** importa mocks ni recalcula comisión/neto.

**Lista:** ítems orden **descendente** por fecha de cierre, **20** por página, cursor
`` `cerradoEnMs:id` ``. Estados: carga, vacío, error con **Reintentar**, error de página siguiente,
**pull-to-refresh** (conserva filtro), recarga al **recuperar foco**. **Guard** por contador de
consulta (cambio rápido de filtro / recarga) y guard anti-doble en **cargar más**.

**Filas:** servicio, primer nombre del cliente, fecha/hora Bogotá, método de pago. **Finalizado:**
total, comisión, neto; en **efectivo**, nota **«Debes a Lookify: $X»** (X = comisión). **Cancelado**
(solo cancelación **del profesional**): etiqueta Cancelado + motivo (lista cerrada), montos **$0** sin
total tachado. Sin dirección, correo, teléfono ni documento.

**Resumen del día (panel):** lee el mismo store vía **`resumenHoyParaPanel`** (periodo HOY: servicios
finalizados e ingresos = neto). Etiqueta **«Datos de ejemplo»** solo en **`__DEV__`** y solo si el
resumen de hoy proviene **únicamente** de ítems de semilla.

**Registro en historial:** en el **mock de servicio en curso**, dentro de la misma operación de
**finalizar** o **cancelar por profesional**, idempotente por **`servicio.id`**. La pantalla 10 **no**
llama a registrar. Ítems **inmutables** tras registrarse.

**Semilla demo:** `sembrarHistorialDemo` solo **`__DEV__`**, solo si el store está **vacío**, ítems con
**`origenSemilla`**. Fuera de dev → **`OPERACION_NO_PERMITIDA`**. Se invoca al **primer cargue** de
**Mis ingresos** (no al abrir solo el panel). No mezcla ni borra servicios reales de la sesión.

**Servicio:** `getProfessionalEarningsHistoryService()` — `obtenerResumenPeriodo`, `listarHistorial`,
`sembrarHistorialDemo` (solo dev). Errores: **`PERIODO_INVALIDO`**, **`CURSOR_INVALIDO`**, más
**`PROFESIONAL_NO_HABILITADO`**, **`VALIDATION`**, **`NETWORK`**.

**Mock método de pago** en ítems de sesión: alternancia **determinista** por `id` (suma de
`charCodeAt`; par → Efectivo, impar → Digital).

**Verificada en celular USB** (12 pruebas).

**Deudas / follow-ups (pantalla 10):**
- **`RESUMEN_DIA_MOCK` / `datosMock`** siguen en `mockProfessionalDashboardStore` sin uso (limpieza
  cosmética).
- Badge **«Datos de ejemplo»** en historial si **hay alguna** semilla en el periodo; en el panel exige
  que **todos** los de hoy sean semilla.
- **Cancelaciones del cliente tras aceptar:** no entran al historial (pendiente backend/producto).
- Ajuste **±20 %**, cobro real de comisión en efectivo, pago al profesional del digital y método de
  pago real en producción: ver contrato backend.

**Backend pendiente (pantalla 10):** ver `docs/contratos-backend-profesional.md`.

**Contrato de servicios (resto; HTTP no implementado):**

| Pantalla pro | Función servicio | HTTP previsto (TBD) |
|---------------------|------------------|---------------------|
| 2 Registro | `registrarProfesional` | `POST /api/v1/auth/register/professional` — mock |
| 3 Selección servicios | `listarServiciosPorCategoria`, `guardarServicios` | GET catálogo · PUT solicitudes/:id/servicios — mock |
| 4 Certificados | `getProfessionalCertificateService()` · ver métodos arriba | GET/POST/PATCH/DELETE certificados · POST enviar-verificacion — **mock** |
| 5 Estado verificación | `getProfessionalVerificationService()` | GET estado · POST corregir · POST reenviar/validar código — **mock** |
| 6 Panel principal | `getProfessionalDashboardService()` | GET panel · PATCH disponibilidad · POST foto — **mock** |
| 7 Mi portafolio | `getProfessionalPortfolioService()` | GET/POST/PATCH/DELETE portafolio · POST portada/reorden — **mock** |
| 8 Solicitud entrante | `getProfessionalIncomingRequestService()` | WebSocket/push + GET activa · POST aceptar/rechazar — **mock** |
| 9 Servicio en curso | `getProfessionalServiceInProgressService()` | GET servicio-activo · POST llegada/validar-pin/cancelar/finalizar — **mock** |
| 10 Historial / ingresos | `getProfessionalEarningsHistoryService()` | GET `/me/historial-ingresos/resumen` · GET `/me/historial-ingresos` (cursor) — **mock**; registro al finalizar/cancelar en pantalla 9 |

Estados de solicitud: `DOCUMENTOS_PENDIENTES`, `EN_REVISION`, `APROBADO`, `RECHAZADO`.

`src/services/mock/mockProfessionalAccounts.ts` guarda contraseñas en texto plano
**solo para demo**; se elimina al conectar autenticación real.
`mockProfessionalRegistryStore` también guarda contraseñas en texto plano **solo en
memoria** (registros nuevos del mock); desaparece al conectar el backend real.

---

## 3. Decisiones de arquitectura

### Capa de servicios (App Profesional)
Las pantallas pro hablan solo con `src/services/` (interfaz + mock + `ServiceError`).
No importan `mockUsers`, `mockProfessionals` ni seeds directamente. Punto de entrada:
`getProfessionalAuthService()`, `getProfessionalRegistrationService()`,
`getProfessionalCertificateService()`, `getProfessionalVerificationService()`,
`getProfessionalDashboardService()`, `getProfessionalPortfolioService()`,
`getProfessionalIncomingRequestService()`, `getProfessionalServiceInProgressService()`
(implementación intercambiable). Login y registro pro ya siguen este patrón.

### Navegación App Profesional (stack separado)
El `RootStackParamList` del cliente expone solo `ProfessionalApp` hacia el flujo pro.
Las pantallas pro usan `ProfessionalStackParamList` y no importan mocks de datos directamente.
Cualquier transición que inicia una «sesión nueva» en pro (post-login, post-registro,
post-guardar servicios, post-envío de certificados, logout, params inválidos) debe usar
`resetProfessionalSession`, no `navigation.reset` local en el stack anidado.

### Separación de los archivos de datos mock
`mockProfessionals.ts` modela **profesionales** (incluye `EstadoProfesional`,
`verificado`, `ajustePrecio`, reseña/portafolio, coords con ids `{cat}-{km}km-…`)
y `mockServices.ts` modela el **catálogo de servicios**. Se separaron porque son entidades distintas que vendrán de
endpoints distintos cuando exista el backend; mezclarlas obligaría a partir el
archivo más adelante.

`mockProfessionals.ts` exporta el tipo `CategoriaId`, que es la fuente de verdad
de las categorías para todo el proyecto. Los servicios se guardan como
`Record<CategoriaId, MockService[]>` a propósito: si se agrega una categoría al
catálogo y se olvidan sus servicios, TypeScript lo marca como error en vez de
fallar en runtime. El mismo patrón se usa en `HomeScreen` para el mapa de
íconos por categoría.

El precio de un servicio se guarda en el campo `precio` y representa
**únicamente el servicio**; el domicilio se suma en el desglose de la pantalla 7
(`precioServicio + precioDomicilio = precioTotal`) y esos valores viajan por
parámetros hasta la 10, que los muestra de nuevo sin recalcular.

### Patrón de espaciado
Regla según el tipo de contenido de la pantalla:

| Tipo de pantalla | Patrón |
|---|---|
| Formulario largo o lista que puede crecer | `flexGrow: 1` en el `contentContainerStyle` del `ScrollView`, sin forzar `justifyContent` |
| Poco contenido fijo + elemento secundario abajo | Agrupar el bloque principal en un `View` y usar `justifyContent: 'space-between'` en el padre |
| Una sola tarjeta sin elemento secundario | `justifyContent: 'center'` para centrar verticalmente |

Caso aparte, ya resuelto pero fácil de repetir: **un `FlatList` horizontal
necesita `flexGrow: 0`**, porque por dentro es un `ScrollView` y si no se limita
crece verticalmente y estira sus hijos. Conviene además darle
`alignItems: 'center'` al `contentContainerStyle`.

Otra lección de este proyecto: no asignar `flex` fijo a un header cuyo contenido
puede variar entre pantallas. En `AccountTypeScreen` un `flex: 2` copiado de
Login dejó las tarjetas y el botón fuera de la pantalla.

### Áreas seguras
`SafeAreaView` viene de `react-native-safe-area-context`, nunca de
`react-native` (deprecado). `SafeAreaProvider` envuelve el `NavigationContainer`
en `AppNavigator.tsx`, que es el montaje que documenta la librería y lo que da
contexto a los hooks de insets.

### Categorías oficiales
Coinciden con el catálogo del admin y no deben divergir:

| `id` | Nombre visible | Ícono (MaterialCommunityIcons) |
|---|---|---|
| `peluqueria` | Peluquería | `content-cut` |
| `barberia` | Barbería | `razor-double-edge` |
| `maquillaje` | Maquillaje | `lipstick` |
| `unas` | Uñas | `hand-back-right-outline` |

Los nombres de íconos se verificaron contra el glyphmap real instalado, no se
asumieron.

---

## 4. Pendientes técnicos

### Mapa — tarea aparte (pendiente de definir)

El mapa se ve en blanco en Expo Go Android. Hipótesis: la API key de Google
embebida en Expo Go está vencida en SDK 57. Afecta **Inicio** y **Tracking**.
Hay que definir cuál usar antes de la sustentación:

1. Development build con key propia de Google Maps.
2. Apple Maps en iPhone.
3. Tiles de OpenStreetMap / MapLibre.

El detalle ya registrado sigue abajo; la opción no está cerrada.

### El mapa se ve vacío en Expo Go (Android)
El mapa dibuja su fondo y el logo de Google, pero los tiles nunca cargan y los
pines no aparecen. **No es un problema del código ni de conectividad.** La causa
es que la API key de Google Maps que Expo Go trae embebida para Android en
SDK 57 está vencida, y una app no puede sobreescribirla desde su propio
`app.json` porque Expo Go usa la suya.

**¿Renovar una key propia “gratis” arregla Expo Go?** No. Aunque en Google Cloud
se cree una API key con crédito mensual (Maps exige cuenta de facturación
habilitada en el proyecto, aunque el uso quede dentro del free tier), esa key **no
sustituye** la embebida en el binario de Expo Go. Solo aplica en un binario propio.

La solución para tiles de Google es un **development build** con API key propia:
habilitar *Maps SDK for Android*, poner la key en
`plugins.react-native-maps.androidGoogleMapsApiKey` y compilar con
`npx expo run:android`. Recargar no basta: hay que recompilar el binario.

**Alternativa solo para demo en Expo Go (opcional, no implementada):** capa
`UrlTile` con tiles OpenStreetMap encima de `MapView` + `PROVIDER_DEFAULT`, sin
migrar a MapLibre. Seguimiento (pantalla 8) sigue el mismo criterio que Inicio
hasta que exista development build.

### Emulador de Android Studio
El emulador va muy lento en el equipo de desarrollo y no resultó usable. La vía
que sí funciona es el **celular físico por cable USB** con Expo Go:

```bash
adb -s <serial> reverse tcp:8081 tcp:8081
adb -s <serial> shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" host.exp.exponent
```

`adb` está en `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` y no está en
el PATH, hay que invocarlo con la ruta completa. Si hay un emulador apagado
además del celular, `adb` responde `more than one device/emulator` y hay que
pasarle `-s <serial>`.

Importante: al presionar `a` en la terminal de Expo se abre la app por **Wi-Fi**
(`exp://192.168.x.x:8081`), no por USB. Si la red falla, hay que abrirla
manualmente con el comando de arriba apuntando a `127.0.0.1`.

`npx expo start --tunnel` **no funciona** en este equipo: ngrok no llegó a
levantar y el proceso se queda en `Starting Metro Bundler`.

### La web no soporta el mapa
`react-native-maps` no tiene soporte para `react-native-web`. En el navegador la
pantalla de Inicio falla con
`codegenNativeComponent is not a function`. Las pantallas sin mapa sí funcionan
en web. Si se necesita probar Inicio en navegador, habría que crear un
`HomeScreen.web.tsx` con un placeholder.

### Navegación
- Pantalla 5 → `Matching` con params completos. Matching → `replace('ProfessionalOffer', …)`.
  Oferta → `replace('Matching', …)` al rechazar; al aceptar → `replace('Tracking', …)`.
  Tracking → `replace('ServiceInProgress', …)` al fin del mock de llegada. ServiceInProgress
  → `replace('PaymentRating', …)` al completar el checklist mock. Params de precio y
  distancia siguen hasta la pantalla 10.
- **`PaymentRating`:** cierre del flujo; `reset` Home tras calificación mock.
- **Resuelto (Fase 3):** tras el checklist, `replace` monta ProfessionalOffer; el atrás en
  Oferta pide confirmación salvo salidas con `allowExitRef`. En Tracking (8): mismo patrón
  de atrás; Oferta no debe quedar bajo Tracking en el stack.
- El stack usa `headerShown: false`; el retorno visual está en
  `src/components/BackHeader.tsx` (MaterialCommunityIcons `arrow-left`, área táctil
  44×44, `accessibilityLabel="Volver"`). Props: `title?`, `onBack?` (default
  `navigation.goBack()`), `variant?: 'light' | 'dark'`, `rightSlot?`. Sin flecha si
  no hay `onBack` y `navigation.canGoBack()` es false.

| Pantalla | BackHeader |
|----------|------------|
| 1 Login | No (raíz) |
| 2 AccountType | Sí, `variant="dark"` |
| 3 RegisterClient | Sí, `variant="dark"` |
| 4 Home | No (raíz post-login) |
| 5 ServiceSelection | Sí, `title` = nombre de categoría, `variant="dark"` |
| 6–10 | No (cancelar o acciones propias) |

En pantallas 2, 3 y 5 el gesto o botón físico de Android también retrocede; el stack
nativo no muestra header de React Navigation.

Tras **ingresar** (Login) o **crear cuenta de cliente** (RegisterClient), la app usa
`navigation.reset` hacia Home: Login y el registro no quedan en el stack (el gesto atrás
desde Inicio no vuelve al formulario). Todavía no hay botón de cerrar sesión; para volver
a Login durante las pruebas hay que **recargar la app** (p. ej. menú de desarrollador de
Expo Go → Reload, o cerrar y reabrir la app).

### App Profesional — navegación (Login)
- Tipo de cuenta → Continuar como profesional → `ProfessionalApp` (stack pro arranca en
  `ProfessionalLogin`; ya no abre directo `RegisterProfessional`).
- Login Pro → Registrarme → `RegisterProfessional`; al volver, segmento en Ingresar.
- Registro OK / login docs-servicios → `ProfessionalServiceSelection` con `solicitudId`
  (vía `resetProfessionalSession`).
- Lectura legal: `ProfessionalTermsRead`, `ProfessionalPrivacyRead` (dentro del stack pro).
- Login Pro → ingreso OK → `resetProfessionalSession` vía `resolvePostLoginRoute` según
  `estadoSolicitud`, `onboardingPaso` y `profesionalActivado`.
- Stack pro: pantallas 3–10 implementadas; rutas legacy 4–7 y 9 (`…UploadPlaceholder`,
  `…VerificationPlaceholder`, `…DashboardPlaceholder`, `…PortfolioPlaceholder`,
  `ProfessionalServiceInProgressPlaceholder` con pantalla real). Pantalla 10:
  **`ProfessionalEarningsHistory`** (sin sufijo Placeholder).

### Registro de profesional
Pantalla 2 provisional reconstruida (`RegisterProfessionalScreen.tsx`). Entrada:
Login Pro → Registrarme. **No forma parte del flujo cliente verificado.** **Verificada
en celular USB** (ver §2).

---

## 5. Reglas de negocio del flujo de solicitud

### Orden de aceptación

El profesional acepta **primero** (App Profesional, pantalla «Solicitud entrante»,
ventana de 30 s). Solo cuando acepta, se le ofrece al cliente (pantalla 7), que
revisa calificación, reseñas, portafolio y precio, y confirma o rechaza. El cliente
**nunca** ve un profesional que no haya aceptado.

### Máquina de estados

```
SOLICITADO
  → BUSCANDO_PROFESIONAL (se envía la solicitud al candidato disponible más cercano)
     → [profesional no responde en 30 s] → siguiente candidato; sigue en BUSCANDO_PROFESIONAL
     → [profesional acepta] → OFERTADO (cliente ve perfil, reseñas, portafolio y precio)
        → ACEPTADO (por el cliente) → EN_CAMINO → [PIN válido] → INICIADO → FINALIZADO
        → RECHAZADO_POR_CLIENTE → vuelve a BUSCANDO_PROFESIONAL (si no se llegó al límite)
  → CANCELADO (en cualquier punto antes de INICIADO)
```

**Cancelación por el cliente:** gratis hasta **INICIADO** (incluye **OFERTADO** — rechazar
oferta / «Buscar otro profesional» — y **EN_CAMINO**, pantallas 8–9 antes del PIN).
Con el servicio **INICIADO** no se permite cancelar (atrás bloqueado con
`alertServicioEnCurso`). El desplazamiento del profesional es riesgo comercial del
profesional, como en apps de servicios bajo demanda. En UI: alertas con copy neutro
(`promptCancelarSolicitud`, `promptCancelarServicio`); mock de notificación al profesional
solo en código.

**Backend (documentado, no implementado):**

- Si **cancela el profesional:** el cliente no paga nada y se busca otro profesional.
- **Registrar cancelaciones por cliente** (sobre todo tras aceptar) para detectar abuso;
  política de límites cuando existan datos reales.

### PIN de inicio del servicio

Cuando el profesional llega (pantalla 9 pro), el cliente ve un **PIN de 4 dígitos** para
autorizar el inicio. En la app del cliente el ingreso se simula tras `MOCK_PIN_INGRESO_MS`
(mock siempre correcto). En la app profesional el PIN **no** se conoce: se envía lo escrito
y el servicio responde válido, no válido o bloqueado. Máximo **3 intentos**; al tercero,
bloqueo de **5 minutos** (`PIN_BLOQUEO_MS`); al cumplirse se reinician los 3 intentos.
**INICIADO** exige PIN válido. El PIN **no** viaja en params. En **producción** lo genera
el backend al aceptar ambos y permanece fijo durante toda la solicitud. Hoy los dos mocks
generan PIN distintos (deuda: un solo PIN en backend).

**Backend (documentado, no implementado):** ver `docs/contratos-backend-profesional.md`
(pantalla 9).

### Regla de los 30 s

Si el profesional no responde, se pasa al siguiente candidato y el profesional sigue
en estado **Disponible**. No se le penaliza ni se le marca **Ocupado**.

### Radio de búsqueda

Radio inicial: **3 km**. Se puede ampliar **una sola vez** hasta **6 km**, que es el
tope absoluto.

### Límite de rechazos

Máximo **3 rechazos del cliente por radio**. Al llegar a 3:

- Si el radio es **3 km** → opciones «Ampliar radio a 6 km» (el contador se reinicia a
  0) o «Cancelar sin costo».
- Si ya está en **6 km** → solo «Cancelar sin costo».

En el frontend (sin backend) se simula pasando `rejectionCount`, `radioKm` y
`rejectedIds` por parámetros de navegación entre las pantallas 6 y 7.

### Precio en la oferta

La pantalla 7 muestra el desglose **antes** de aceptar:

`precioServicio + precioDomicilio = precioTotal` (nunca un solo campo de total).

- **precioServicio** = precio base del servicio × ajuste del profesional (±20 %, entre
  0,8 y 1,2).
- **precioDomicilio** = 4.000 + 1.200 × km, con tope de 7.000.
- **Cambio:** domicilio ajustado a base $4.000 + $1.200/km, tope $7.000 (equivalente a un
  pasaje de ida y vuelta del profesional); antes era base $5.000, tope $15.000.
- La comisión de Lookify (15 % sobre el servicio) **no** se muestra al cliente. Base de
  la comisión: **`precioServicio` ya ajustado** (catálogo × ajuste ±20 % en
  `calcularPrecioServicio`), no el precio base del catálogo. Constante
  `COMISION_LOOKIFY` en `pricing.ts` (reservada para backend/admin; el desglose al
  cliente no incluye comisión).
- Esos mismos valores viajan por parámetros hasta la pantalla 10; no se recalculan de
  otra forma.

### Pago (backend y App Profesional — pendiente)

Integración real de pagos prevista con **Wompi / Mercado Pago** (no implementado en
frontend). En la pantalla 10 el método de pago es solo selección visual.

**Efectivo (regla pendiente):** si el cliente paga en efectivo, el profesional recibe el
**total** al cerrar el servicio y queda debiendo a Lookify la **comisión del 15 % sobre
el servicio** (base: `precioServicio` ya ajustado). Opciones de producto por definir:
billetera del profesional con compensación al recibir pagos digitales, corte semanal
de deuda y/o tope de deuda que bloquea aceptar nuevos servicios en efectivo.

### Otras decisiones

- El panel Admin **no existe en código**: solo mockups, que son la fuente de verdad de
  diseño (categorías, precios de Barbería, verificación todo-o-nada) hasta que se
  construya.
- Las **10 pantallas oficiales** de App Profesional: Login, Tipo de cuenta, Registro
  datos personales, Selección de servicios, Carga de certificados, Estado de
  verificación, Panel principal (con toggle Disponible/Ocupado), Solicitud
  entrante (ventana de 30 s), Servicio en curso (con ingreso del PIN del cliente),
  Historial/ingresos. La pantalla **«Servicio en curso»**
  exige el PIN del cliente antes de pasar a INICIADO (en la pantalla 9 del profesional se escribe el PIN; en el mock el PIN del cliente y el del profesional aún son distintos, el backend generará uno solo).
- Las duraciones y precios de `mockServices.ts` son **oficiales**. Catálogo vigente:

| Categoría | Servicio | Precio (COP) | Duración (min) |
|-----------|----------|--------------|----------------|
| Peluquería | Corte de dama | 35.000 | 45 |
| Peluquería | Cepillado | 28.000 | 40 |
| Peluquería | Tinte y color | 85.000 | 120 |
| Peluquería | Peinado para evento | 60.000 | 60 |
| Barbería | Corte clásico | 25.000 | 30 |
| Barbería | Corte y barba | 38.000 | 45 |
| Barbería | Perfilado de barba | 15.000 | 20 |
| Barbería | Corte infantil | 20.000 | 30 |
| Maquillaje | Básico | 45.000 | 45 |
| Maquillaje | Especial | 75.000 | 60 |
| Maquillaje | Premium | 110.000 | 90 |
| Uñas | Básico | 20.000 | 45 |
| Uñas | Especial | 35.000 | 60 |
| Uñas | Premium | 50.000 | 90 |

IDs en código: `pel-1`…`pel-4`, `bar-1`…`bar-4`, `maq-1`…`maq-3`, `una-1`…`una-3`.

---

## 6. Fase backend 4A/4B (app ↔ realtime-server)

El backend que se está construyendo es **`apps/realtime-server`** (Express + Socket.io +
PostGIS). La app lo consume **por el BFF REST** (`/api/*`) y **por socket**; el modelo de
reservas es **claim**: la reserva se crea sin profesional y el primero que la acepta se la
queda.

**Interruptor:** `EXPO_PUBLIC_USE_BACKEND=true` (ver `apps/lookify-app/.env`). En `false`
todo sigue en mock, sin cambios de comportamiento. `initBackend()` se llama en `App.tsx`
solo si el backend está activo; es el punto donde se registran las implementaciones
reales de los servicios.

### 6.1 Servicios nuevos (4B)

| Archivo | Rol |
|---|---|
| `src/services/nearbyService.ts` | Interfaz `NearbyService` + `ProfesionalCercano` (id, nombre, calificación, avatar, lat/lng, distanciaKm) y swap de implementación. |
| `src/services/mock/mockNearbyService.ts` | Fallback demo: deriva de `MOCK_PROFESSIONALS`, sin red. |
| `src/services/backend/backendNearbyService.ts` | `GET {SOCKET_URL}/realtime/nearby?lat&lng&radius&limit` (Bearer). `radius` va en **metros** (el servidor lo acota a 100–20.000 m). Calcula la distancia en km y guarda la última lista (`getUltimoListadoCercanos`) para la pantalla de Oferta. |

**Inicio (`HomeScreen.tsx` y `HomeScreen.web.tsx`):** con backend, los pines del mapa y el
contador «N cerca» salen de `/realtime/nearby` (radio 6 km, refresco por zona de ~100 m);
sin backend, siguen los mocks por categoría. En web no hay GPS en vivo: se consulta
desde el punto de referencia (`MOCK_CLIENT_LOCATION`).

### 6.2 Matching real (pantalla 6)

`MatchingScreen.tsx` mantiene la simulación local cuando **no** hay `bookingId` (modo
demo intacto) y cambia a modo real si `EXPO_PUBLIC_USE_BACKEND=true` **y** llega un
`bookingId`:

- **Creación de la reserva:** `POST /api/bookings` (cliente, sin profesional) → el servidor
  calcula precio, `expiresAt` (60 s) y `matchRound` (1).
- **Estado:** `GET /api/bookings/:id` cada **5 s** (`POLL_MS`) + avisos por socket
  (`booking:status` en la sala `booking:{id}`, con re-unión a la sala al reconectar).
  El socket es **aparte** del del profesional (`connectClientRealtime` en
  `src/lib/backend/realtime.ts`): el cliente no emite `prof:*`.
- **Estados de UI:** buscando → **aceptado** (pasa a la Oferta con la ficha pública del
  profesional), **expirado** (ampliar radio / cancelar sin costo) y **cancelado**.
  Un fallo puntual de red no cierra la búsqueda: solo tras **3 fallos seguidos** se
  muestra el estado de error.
- **Cancelar:** confirma con la alerta compartida (`promptCancelarSolicitud`) y luego
  `POST /api/bookings/:id/cancel` (reserva sin asignar). La alerta **no** detiene el poll
  en modo real.
- **Reintentar:** crea una **reserva nueva** (ronda 1) y reemplaza la pantalla; la
  anterior ya expiró, así que no se cancela.
- **Rondas:** las amplía el servidor (3 km → 6 km → `expired`), no la app. La app solo
  refleja `matchRound` en el checklist.

### 6.3 Oferta real (pantalla 7)

`ProfessionalOfferScreen.tsx` recibe del matching la **ficha pública** del profesional
(`id`, `displayName`, `avatar`, `rating` de `professionalPublic`), el **precio del
servidor** (`price_snapshot`) y el **nombre del servicio**. Con backend, «Aceptar» lleva a
**Seguimiento** con el `bookingId` real y «Buscar otro profesional» cancela la reserva y
vuelve al matching con una reserva nueva. Sin backend, la pantalla queda igual que antes
(mock).

### 6.4 Solicitud entrante real (App Pro, pantalla 8)

`backendProfessionalIncomingRequestService.ts` se reescribió sobre el modelo claim:

- Las ofertas del profesional son **`GET /api/bookings/pro/available`** (vista reducida:
  servicio, precio, distancia redondeada a 100 m y zona a ~500 m; **nunca** la dirección
  exacta). Antes se usaba `GET /api/bookings/:id`, que da 404 para candidatos sin asignar.
- **Aceptar** = `POST /api/bookings/:id/accept` (el primero que acepta se queda la
  reserva); **rechazar** = `POST /api/bookings/:id/reject`.
- El socket `booking:taken` retira la oferta de la lista del candidato; el listener
  (`ProfessionalIncomingRequestListener`) **además** hace **polling de respaldo cada 12 s**
  (`POLL_OFERTAS_MS`) por si el socket no llegó.
- `procesarExpiracion` **no decide sola**: consulta el servidor; si la oferta sigue viva
  devuelve `PENDIENTE`, si ya no está y la reserva está `accepted` devuelve `ACEPTADA`, y
  si no → `EXPIRADA`. Se agregó `PENDIENTE` a `ResultadoRespuestaPro`.

### 6.5 Lo que sigue en mock

- **Seguimiento (pantalla 8 del cliente):** con `EXPO_PUBLIC_USE_BACKEND=true` **y**
  `bookingId` ya usa posición real (ver 6.7). Sin backend sigue la animación simulada
  (`MOCK_TRACKING_MS`); en ese modo no hay GPS real.
- **Pantalla 9 del cliente** (servicio en progreso) y **pantalla 9 del profesional**
  (servicio en curso + PIN) siguen mock, salvo el envío de GPS foreground del pro en
  «En camino» (ver 6.7).
- **Pago y calificación** (pantalla 10) siguen mock.

### 6.6 Verificación

- `npm run typecheck` (servidor + app) limpio.
- Tests del servidor: `node --env-file=.env --test --import tsx "apps/realtime-server/src/**/*.test.ts"` → **58/58**.
- Prueba manual con **dos sesiones** (cliente + profesional) sobre el backend local.

### 6.7 Rastreo en vivo (4C-2)

- **Profesional (App Pro, pantalla 9):** mientras `etapa === 'EN_CAMINO'` envía GPS en
  **primer plano** con `useLiveLocation` (cada **5 s** o **15 m**,
  `maxAccuracyM` por defecto) vía `emitBookingLocation` → `location:update` con
  `booking_id`. La tarjeta muestra «Compartiendo tu ubicación en vivo. Mantén la app
  abierta.»; si se niega el permiso o falla el GPS, muestra el motivo. Al pasar a
  `in_progress`/`completed` (PIN) deja de emitir.
- **Cliente (pantalla 8):** `TrackingView` (compartida nativo/web; las pantallas solo
  reexportan) escucha `booking:location` en la sala `booking:{id}` y pinta el marcador y
  el rastro reales; además hace **polling de `GET /api/bookings/:id/tracking` cada 10 s**
  como respaldo si el socket cae. Muestra «Última actualización hace X s», aviso rojo
  **> 30 s** sin señal, ETA **aproximada a 20 km/h** y banner «El profesional llegó»
  (`booking:event`/`arrivedAt`). Al recibir `in_progress`/`completed` navega a la
  pantalla 9; en `cancelled`/`expired` vuelve a Home.
- **Destino:** el servidor entrega `client.lat/lng` si la reserva tiene dirección
  geocodificada; si no, se usa `MOCK_CLIENT_LOCATION` como referencia de distancia.
- **Limitación deliberada del MVP:** no hay GPS en **segundo plano**. En iOS/Android el
  sistema suspende la ubicación al cerrar/minimizar la app; seguimiento continuo requiere
  un **dev build** con `expo-location` en background + foreground service (Android) y
  `UIBackgroundModes` (iOS), fuera de este alcance. Mientras la app esté abierta el
  rastreo funciona; el TTL de 120 s en Redis marca la posición como vencida.
- **Web:** el mapa usa Leaflet; `TrackingScreen.web.tsx` ahora comparte la misma lógica
  real (antes no tenía soporte de backend).

