# Estado de Lookify por etapas

Fecha de corte: 2026-10-29
Rama actual: `frontend-update-from-remote` (`83e1819`)
Referencia con la lógica real: `backup/pre-frontend-update` / `main` (`dd1d307`)

## Criterio de esta tabla

- **Verificado**: existe una ejecución reproducible registrada con comando y resultado.
- **Implementado sin prueba actual**: el código existe, pero hoy no se pudo ejecutar la prueba.
- **Regresado**: el código actual perdió la lógica que sí existía en `dd1d307`.
- **Pendiente**: no hay implementación ni evidencia.
- Cada etapa se separa en **Servidor** y **App** porque no avanzaron al mismo ritmo.
- `QA-1-INFORME.md` (2026-10-23) es la evidencia global más fuerte: 98/98 tests realtime,
  typecheck OK, 3/3 tests de registro y seguridad de Directus validada. Esa evidencia
  corresponde al servidor y al frontend de `dd1d307`; el reemplazo de `c5ee047`
  ya fue revertido en el working tree, pero aún no se re-ejecuta contra backend.

## Etapas

| Etapa | Componente | Estado | Commit de referencia | Prueba / evidencia |
|---|---|---|---|---|
| 0. Fundaciones e infraestructura | Servidor | Implementado sin prueba actual | `ba914b6`, `07aabbe`, `035b501`, `c0a2181` | `QA-1-INFORME.md`: Compose `lookify-main`, realtime/BFF en `4001`, Directus `8055`, `docker inspect` OK (2026-10-23). Hoy Docker no responde, no se pudo repetir. |
| 0. Fundaciones e infraestructura | App | Verificado parcial | `ba914b6` | `npm run typecheck` exit 0 el 2026-10-29. No se validó arranque en Expo Go en esta sesión. |
| 1. Base de datos y catálogo | Servidor | Implementado sin prueba actual | `ba914b6`, `07aabbe`, `3fe7ce8`, `64a22a8`, `886cde2` | `QA-1-INFORME.md`: 5 categorías / 7 servicios en DB y BFF de catálogo operativo. |
| 1. Base de datos y catálogo | App | Restaurado sin prueba runtime | `dd1d307` (working tree) | `App.tsx` vuelve a llamar `ensureWebFont()` e `initBackend()`. `npm run typecheck` exit 0 y bundle Android OK; falta smoke contra Directus. |
| 2. Registro, login y sesión | Servidor | Verificado (evidencia 2026-10-23) | `af61790`, `0d5d9fe`, `4763aae` | `QA-1-INFORME.md`: `POST /api/auth/register` 201, rol App User; 3/3 tests de registro; intentos anónimos privilegiados 403; rate limit 429. Hoy no re-ejecutado. |
| 2. Registro, login y sesión | App | Restaurado sin prueba runtime | `dd1d307` (working tree) | `LoginScreen`, `RegisterClientScreen` y `ProfessionalLoginScreen` recuperan backend/sesión real; `npm run typecheck` y bundle Android OK. |
| 3. Búsqueda por proximidad y matching | Servidor | Verificado (evidencia 2026-10-23) | `5bcd873`, `b73ecc4`, `b0c6c86`, `94996d3`, `dd1d307` | `QA-1-INFORME.md`: `/realtime/nearby` 200 con 3 profesionales demo a 0 m, 449 m y 649 m; suite de matching dentro de 98/98. |
| 3. Búsqueda por proximidad y matching | App | Restaurado sin prueba runtime | `dd1d307` (working tree) | `HomeScreen` vuelve a usar `LookifyMap`, `useLiveLocation` y `getNearbyService()`; `MatchingScreen` usa el servicio real de matching. Typecheck y bundle Android OK. |
| 4. Reservas y ciclo del servicio | Servidor | Verificado (evidencia 2026-10-23) | `c6a8bc9`, `48c22c2`, `fef4e19`, `b73ecc4` | 98/98 tests realtime incluyen transiciones atómicas, carreras, permisos e identidad JWT. |
| 4. Reservas y ciclo del servicio | App | Restaurado sin prueba runtime | `dd1d307` (working tree) | `ServiceSelectionScreen`, `TrackingScreen` y pantallas profesionales vuelven a usar los servicios del BFF; typecheck y bundle Android OK. |
| 5. Tracking en vivo y GPS | Servidor | Verificado (evidencia 2026-10-23) | `e81c8fb`, `133595e`, `94996d3` | 98/98 tests realtime, incluidos tracking, autorización de socket y rate limit (`QA-1-INFORME.md`). |
| 5. Tracking en vivo y GPS | App | Restaurado sin prueba runtime | `dd1d307` (working tree) | `TrackingScreen.tsx` vuelve a reexportar `TrackingView` (socket/polling real). `ProfessionalServiceInProgressScreen` recupera `useLiveLocation` + `emitBookingLocation`. Typecheck y bundle Android OK. |
| 6. Verificación profesional y archivos | Servidor | Verificado (evidencia 2026-10-23) | `0d5d9fe`, `4763aae`, `3fe7ce8`, `64a22a8`, `886cde2`, `e9658b8`, `ad78df6`, `daa3439` | `QA-1-INFORME.md`: ownership de perfiles/documentos, avatares y certificados; 4 casos nuevos de `invalid_avatar`; archivo ajeno 404. |
| 6. Verificación profesional y archivos | App | Restaurado sin prueba runtime | `dd1d307` (working tree) | `ProfessionalVerificationScreen` y `ProfessionalDashboardScreen` recuperan guards `BACKEND.enabled` y headers de imágenes protegidas. Typecheck y bundle Android OK. |
| 7. Web de administrador | Servidor | Implementado sin prueba actual | `af61790`, `c0a2181` | Login admin y BFF descritos en `QA-1`; la suite admin no está versionada. |
| 7. Web de administrador | App web | Implementado con evidencia local no versionada | `83e1819` | `App.web.tsx`, `AppNavigator.web.tsx`, `AdminLoginScreen`, sesión en `sessionStorage`. Evidencia local en `Temp/opencode`: `e2e-admin.js` y capturas `01-login-admin.png` a `05-rechazo-pro.png`. No es una prueba CI. |
| 8. Seguridad y calidad | Servidor | Verificado (evidencia 2026-10-23) | `3fe7ce8`, `64a22a8`, `886cde2`, `e9658b8`, `ad78df6`, `ca402c4`, `237386a`, `daa3439`, `4c39778` | 98/98 tests realtime, 3/3 registro, typecheck OK; registro público cerrado y `bff-service` con mínimo privilegio. |
| 8. Seguridad y calidad | App | Verificado parcial | `d83f056`, `83e1819` | `npm run typecheck` exit 0 el 2026-10-29. No se ejecutaron los 98 tests hoy porque Docker no está disponible. |
| 9. Despliegue productivo | Servidor | Pendiente | - | Solo hay Compose local; no hay evidencia de despliegue. |
| 9. Despliegue productivo | App | Pendiente | - | Solo hay Expo local; no hay build EAS ni tiendas. |

## Regresión concreta de `c5ee047`

`c5ee047` reemplazó el frontend por la copia de `yeisoncastro-stack/-lookify-app`.
No borró archivos, pero dejó sin uso la capa backend. Archivos que perdieron
imports de `lib/backend`, `services/backend` o `TrackingView`:

1. `src/navigation/ProfessionalIncomingRequestListener.tsx`
2. `src/screens/HomeScreen.tsx`
3. `src/screens/LoginScreen.tsx`
4. `src/screens/MatchingScreen.tsx`
5. `src/screens/ProfessionalOfferScreen.tsx`
6. `src/screens/RegisterClientScreen.tsx`
7. `src/screens/ServiceSelectionScreen.tsx`
8. `src/screens/TrackingScreen.tsx`
9. `src/screens/professional/ProfessionalDashboardScreen.tsx`
10. `src/screens/professional/ProfessionalIncomingRequestScreen.tsx`
11. `src/screens/professional/ProfessionalLoginScreen.tsx`
12. `src/screens/professional/ProfessionalServiceInProgressScreen.tsx`
13. `src/screens/professional/ProfessionalVerificationScreen.tsx`

Además:

- `App.tsx` perdió `initBackend()` y `ensureWebFont()`.
- `AppNavigator.tsx` perdió `LiveRouteScreen` y los params
  `bookingId`, `profesional`, `precioServidor`, `servicioNombre`.
- `package.json` perdió `expo-secure-store`, `react-native-webview` y `socket.io-client`.
- `app.json` perdió el plugin `expo-secure-store`.

## Restauración aplicada en el working tree

Se recuperó la versión de `dd1d307` para los 13 archivos listados, `App.tsx`,
`AppNavigator.tsx` y `package.json`. Se mantuvieron del estado actual:

- `App.web.tsx`, `AppNavigator.web.tsx`, `AdminLoginScreen`, `adminAuth.ts`,
  `initBackend.web.ts` y todo el panel admin de `83e1819`.
- El fondo `#FBF6EE` y el logo actual de `app.json`; solo se reañadió el plugin
  `expo-secure-store`.
- El registro profesional con `DateTimePicker` (no estaba en la lista de archivos
  afectados).
- Los acentos visuales restaurados se mapearon de `honey` a `sand`, salvo las
  estrellas de calificación, que siguen en `honey`.
- `AdminApp` **no** se reañadió al stack nativo: `83e1819` dejó el admin como web
  exclusiva. El tipo y la ruta viven en `AppNavigator.web.tsx`.

La restauración recupera también la UI de `dd1d307` en las pantallas grandes
(`Home`, `Matching`, `ProfessionalOffer`, `ServiceSelection`, `Tracking`), así que
las mejoras visuales que `c5ee047` había hecho en esos archivos quedaron
reemplazadas. Esto es una decisión pendiente de validación visual.

## Evidencia de esta sesión

```text
npm run typecheck
EXIT=0 (realtime-server + lookify-app)

npx expo export --platform android
Android Bundled 6302ms apps/lookify-app/index.ts (1124 modules)
EXIT=0

npx expo export --platform web
Web Bundled 552ms apps/lookify-app/index.ts (572 modules)
EXIT=0

docker compose ps
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Los bundles se generaron en `Temp/opencode/expo-export-android-final` y
`Temp/opencode/expo-export-web-final`. No se ejecutó la suite de 98 tests ni un
smoke real contra Directus porque Docker está caído.

## Mapa en Expo Go: aclaración

La nota que afirma que el mapa requiere development build o
`EXPO_PUBLIC_GOOGLE_MAPS_KEY` es obsoleta y contradice el código:

- `src/components/LookifyMap.native.tsx` usa `WebView` + Leaflet + tiles Esri,
  sin API key y sin módulo nativo. Los comentarios iniciales del archivo lo
  explican y `LookifyMap.web.tsx` usa Leaflet por CDN.
- En `dd1d307`, `HomeScreen` y `TrackingView` usaban `LookifyMap`, por lo que el
  mapa funcionaba en Expo Go.
- `c5ee047` volvió a meter `react-native-maps` directo en `HomeScreen` y
  `TrackingScreen`; ese es el origen de la regresión visual, no la falta de key.
- Evidencia: `git show dd1d307:apps/lookify-app/src/screens/TrackingScreen.tsx`
  (reexporta `TrackingView`) y `git show dd1d307:apps/lookify-app/src/screens/HomeScreen.tsx`
  (importa `LookifyMap`).

## Plan de restauración y puntos de control

El texto original del plan aprobado no está en el repo ni en `Temp/opencode`.
Estos checkpoints se reconstruyen desde `backup/pre-frontend-update` y quedan
sujetos a confirmación.

- **CP0 - Baseline (hecho)**: `npm run typecheck` OK; Docker caído; 13 archivos y
  4 pérdidas de configuración identificadas.
- **CP1 - Entrada y dependencias (hecho)**: `App.tsx` llama `initBackend()`;
  `package.json` y `app.json` recuperaron sus dependencias/plugin.
- **CP2 - Flujo cliente (hecho en código)**: `HomeScreen`, `LoginScreen`,
  `RegisterClientScreen`, `ServiceSelectionScreen`, `MatchingScreen`,
  `ProfessionalOfferScreen` y `TrackingScreen` restaurados.
- **CP3 - Flujo profesional (hecho en código)**: listener, dashboard, oferta entrante,
  servicio en curso, verificación y login profesional restaurados con GPS y guards.
- **CP4 - Navegación (hecho)**: params reales y `LiveRouteScreen` restaurados;
  admin sigue solo en `AppNavigator.web.tsx`.
- **CP5 - Verificación (parcial)**: typecheck y bundles Android/web OK; sigue pendiente
  la suite realtime con Docker, el smoke de mapa y el E2E admin.
- **CP6 - Cierre (parcial)**: tabla actualizada con evidencia de compilación; no se
  marca `Verificado` el runtime porque no se ejecutó contra backend.

## Riesgos abiertos

- Docker Desktop no responde (`npipe:////./pipe/dockerDesktopLinuxEngine`), por lo
  que no se pueden repetir los 98 tests ni los E2E que dependen de Directus/PostGIS/Redis.
- La evidencia E2E del admin está fuera del repo y no se ejecuta en CI.
- `directus/setup-permissions.mjs` tiene un cambio local preexistente ajeno a esta
  restauración; no se debe incluir en commits de frontend sin revisarlo.
- La restauración recuperó la UI de `dd1d307` en `Home`, `Matching`,
  `ProfessionalOffer`, `ServiceSelection` y `Tracking`; hay que validar si se
  aceptan esas pantallas o si se reaplican los cambios visuales de `c5ee047`.
- Los bundles prueban que el código compila, no que el flujo funcione contra
  Directus/PostGIS/Redis.
