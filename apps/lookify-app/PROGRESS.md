# Lookify — Estado del proyecto

**Flujo cliente (pantallas 1 a 10): completo.** Verificado en celular por USB y
subido a GitHub (`e0696de` en `main`). Siguiente bloque: **App Profesional**, construida
**pantalla por pantalla** (una pantalla por turno; el wizard de 4 pasos en una sola
pantalla quedó descartado). Entrada pro desde Tipo de cuenta → Login Profesional.

Fase actual: **frontend únicamente** (React Native + Expo SDK 57). El backend se
construye después de cerrar todo el frontend. No hay autenticación real, base de
datos ni llamadas HTTP: todos los datos son mocks locales.

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
3. Selección de servicios
4. Carga de certificados
5. Estado de verificación
6. Panel principal (toggle Disponible/Ocupado)
7. Solicitud entrante (ventana de 30 s)
8. Servicio en curso (ingreso PIN del cliente)
9. Historial/ingresos (gestión de portafolio)

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
10. Historial/ingresos (con gestión de portafolio)

### App Profesional — Login (pantalla 1 provisional)

`src/screens/professional/ProfessionalLoginScreen.tsx`: cabecera navy con
`BackHeader`, logo real (`assets/logo-lookify.png`, 96 px), **Lookify PRO**,
eslogan «Convierte tu talento en ingresos»; tarjeta blanca; segmento
Ingresar | Registrarme; validación como cliente (`validators.ts`); login vía
`getProfessionalAuthService()` (mock en `src/services/mock/`). Tras login,
`resolvePostLoginRoute` + `navigation.reset` a placeholders «sin construir» con
params de sesión tipados. **Registrarme** navega a `RegisterProfessional`.
**Verificada en celular USB.**

Cuentas demo (mock): `pro.aprobado@lookify.test`, `pro.revision@lookify.test`,
`pro.rechazado@lookify.test`, `pro.docs-servicios@lookify.test`,
`pro.docs-certificados@lookify.test` — contraseña `Lookify123`.

Placeholders post-login incluyen **«Cerrar sesión (temporal)»** (`reset` a
`ProfessionalLogin`) para probar las 5 cuentas sin recargar la app; se reemplazará
por cierre de sesión real (JWT + limpieza de token).

**Onboarding entre pantallas 3–5:** params tipados (`ProfessionalSessionRouteParams`,
incluye `solicitudId` tras registro). **Sin contexto global** por ahora. Pendiente
opcional: contexto de sesión + JWT en `expo-secure-store` (decidir más adelante).

**Pendiente técnico:** `ProfessionalStackNavigator` separado del stack cliente — tarea
aparté con su propia prueba USB **antes de la pantalla 3** (stacks siguen unificados).

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
Éxito → `reset` a placeholder selección de servicios con `solicitudId`. **Verificada
en celular USB.**

**Backend pendiente (Registro):** rate limit; unicidad real de correo/documento;
política de contraseñas; consentimiento con IP y timestamp servidor.

**Pruebas Jest:** commit aparte cuando las pantallas pro estén verificadas en USB.

**Contrato de servicios (resto; no implementado aún):**

| Pantalla pro (prov.) | Función servicio | HTTP previsto (TBD) |
|---------------------|------------------|---------------------|
| 2 Registro | `registrarProfesional` | `POST /api/v1/auth/register/professional` — implementado mock |
| 3 Selección servicios | `guardarServicios` | TBD |
| 4 Certificados | `subirCertificado`, `enviarSolicitudVerificacion` | TBD (multipart) |
| 5 Estado verificación | `obtenerEstadoVerificacion` | TBD |

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
`getProfessionalAuthService()`, `getProfessionalRegistrationService()` (implementación
intercambiable). Login y registro pro ya siguen este patrón.

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
- Tipo de cuenta → Continuar como profesional → `ProfessionalLogin` (ya no abre
  directo `RegisterProfessional`).
- Login Pro → Registrarme → `RegisterProfessional`; al volver, segmento en Ingresar.
- Registro OK → `reset` a `ProfessionalServiceSelectionPlaceholder` con `solicitudId`.
- Lectura legal: `ProfessionalTermsRead`, `ProfessionalPrivacyRead`.
- Login Pro → ingreso OK → `reset` a placeholder según `estadoSolicitud` / `onboardingPaso`.
- Placeholders: `ProfessionalDashboardPlaceholder`, `ProfessionalVerificationPlaceholder`,
  `ProfessionalServiceSelectionPlaceholder`, `ProfessionalCertificateUploadPlaceholder`.

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

Cuando el profesional llega (pantalla 9), el cliente ve un **PIN de 4 dígitos** para
autorizar el inicio. El profesional debe ingresarlo en su app; en frontend se simula
entrada correcta tras `MOCK_PIN_INGRESO_MS`. **INICIADO** exige PIN válido (mock siempre
correcto). El PIN **no** viaja en params hacia la pantalla 10; en **producción** lo
genera el backend al aceptar el servicio y permanece fijo durante toda la solicitud.

**Backend (documentado, no implementado):** máximo **3 intentos fallidos** de PIN; luego
bloqueo (detalle TBD).

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
  Historial/ingresos (con gestión de portafolio). La pantalla **«Servicio en curso»**
  exige el PIN del cliente antes de pasar a INICIADO (alineado con la pantalla 9).
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
