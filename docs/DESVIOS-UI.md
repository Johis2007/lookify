# Desvíos de UI respecto al diseño de Yeison

Regla: cuando el diseño de `c5ee047` (copia del repo de Yeison) choca con una
función real del producto, la función se conserva y el diseño se adapta con el
menor cambio posible. Este archivo registra cada control visible que no existe
en el diseño original y el motivo.

## Home (`apps/lookify-app/src/screens/HomeScreen.tsx`)

| Control | Estado en `c5ee047` | Decisión | Motivo |
|---|---|---|---|
| Icono de cerrar sesión | No existe | Se conserva, discreto, junto a la campana | Una sesión real debe poder cerrarse. Se usa un icono circular con borde y sin texto para no alterar el header. |
| Badge de GPS | No existe | Se conserva como badge pequeño sobre el mapa | El usuario necesita saber si el GPS está activo, si es una ubicación recordada o si se usa el punto aproximado. Se movió a la esquina inferior izquierda y se redujo el tamaño. |
| Distancia recorrida (`walkKm`) | No existe | Se muestra dentro del badge de GPS | Es parte de la lógica real de `useLiveLocation` y del rastro dibujado en el mapa; no añade una fila visual nueva. |
| Botón "Ver ruta en vivo" | No existe | Se conserva | `LiveRoute` está registrado en `AppNavigator.tsx` y la pantalla `LiveRouteScreen.tsx` existe y usa `fetchRoute` (OSRM). La navegación no se rompe. |
| `LookifyMap` en vez de `MapView` directo | `MapView` directo con `PROVIDER_DEFAULT` | Se conserva `LookifyMap` | Abstracción necesaria para web (Leaflet) y para dibujar ubicación en vivo, pines y rastro. No cambia la composición visual de la pantalla. |
| Texto de ubicación dinámico | "Chapinero, Bogotá" fijo | Se conserva el texto dinámico | Refleja la ubicación real/recordada; mantiene la misma tipografía y posición del diseño. |

No se añadió el subheader grande que existía en HEAD: el estado del GPS vive
solo en el badge pequeño para respetar el espaciado de Yeison.

## Matching (`apps/lookify-app/src/screens/MatchingScreen.tsx`)

El encabezado vuelve al icono animado de lupa de Yeison; no se usa `RadarScan`.

| Control | Estado en `c5ee047` | Decisión | Motivo |
|---|---|---|---|
| Cuenta regresiva de la oferta | No existe | Se conserva bajo el checklist | El backend real vence la oferta a los 60 s e informa la ronda; sin este dato el usuario no sabe cuánto queda. Se mantiene como una fila de texto discreta. |
| Botón "Intentar de nuevo" | No existe | Se conserva | Solo aparece cuando la reserva real expiró. Recrea la reserva en el BFF; el diseño de Yeison solo contemplaba la simulación local. |
| Título/cuerpo para cancelado y error | Solo "No encontramos profesionales disponibles" | Se conserva el texto dinámico | El modo real distingue reserva cancelada, error de conexión y expiración. Se usan los mismos estilos `specialTitle`/`specialBody` del diseño. |
| Texto de estado del radar | No existe | Se omite | El checklist y la cuenta regresiva ya comunican el estado; se prefiere el encabezado limpio de Yeison. |

## ServiceSelection (`apps/lookify-app/src/screens/ServiceSelectionScreen.tsx`)

La composición de `c5ee047` ya se conserva en `HEAD`: header oscuro, tarjetas
con radio y footer fijo. No se requirió cambio visual.

| Control | Estado en `c5ee047` | Decisión | Motivo |
|---|---|---|---|
| Spinner de carga | No existe | Se conserva | El catálogo ahora viene de Directus; hay un intervalo real mientras responde. Se usa el mismo fondo y centrado del diseño. |
| Mensaje "No hay servicios disponibles por ahora." | No existe | Se conserva | Estado real cuando la categoría no tiene servicios activos. |
| Texto de error | No existe | Se conserva | Un fallo de catálogo o la creación de la reserva debe ser visible; se usa `typography.caption` y `colors.error`. |
| Botón "Creando reserva…" | No existe | Se conserva | El botón se deshabilita mientras el BFF crea la reserva, para evitar dobles solicitudes. Mantiene la misma altura y posición. |

## ProfessionalOffer (`apps/lookify-app/src/screens/ProfessionalOfferScreen.tsx`)

La composición de `c5ee047` (hoja blanca, acento arena, perfil, portafolio,
reseña y bloque de precio) se conserva. No se requirió cambio visual.

| Control | Estado en `c5ee047` | Decisión | Motivo |
|---|---|---|---|
| Fila "Profesional verificado" | No existe | Se conserva | La ficha pública real trae `verificado`; se muestra con el mismo estilo de metadatos y el icono de escudo. |
| Portafolio y reseña condicionales | Siempre visibles con datos mock | Se ocultan si no hay datos | En modo real la ficha pública puede no traer portafolio ni reseña; mostrar secciones vacías rompería la lectura. |
| Nota de precio del servidor | No existe | Se conserva | En modo real el precio lo calcula el BFF y el domicilio se confirma al final; el usuario debe saberlo. |
| Texto de error | No existe | Se conserva | Si falla la cancelación/creación de la nueva búsqueda, el usuario necesita feedback. |
| Botón "Ver seguimiento" | Dice "Aceptar profesional" | Se conserva el texto dinámico | En modo real la reserva ya fue aceptada por el profesional; "Ver seguimiento" describe la acción real. En demo sigue diciendo "Aceptar profesional". |
| Botones deshabilitados mientras trabaja | No existe | Se conserva | Evita dobles solicitudes durante la llamada al BFF; no cambia la composición. |

## Tracking (`apps/lookify-app/src/screens/TrackingScreen.tsx` y `TrackingView.tsx`)

`TrackingView.tsx` ya era idéntico en `c5ee047` y `HEAD`. La pantalla nativa de
`c5ee047` era una versión antigua con `MapView` directo; `HEAD` la reemplazó por
un reexport de `TrackingView`, que conserva la misma hoja, avatar, fila de
contacto y botón de cancelar, y añade los estados reales.

| Control | Estado en `c5ee047` | Decisión | Motivo |
|---|---|---|---|
| `LookifyMap` en vez de `MapView` directo | `MapView` en la pantalla nativa antigua | Se conserva `LookifyMap` | Es la abstracción compartida con web y la que usa el resto del flujo; además dibuja el rastro y sigue al profesional. La composición visual (mapa a pantalla completa + hoja inferior) no cambia. |
| Píldora "En camino" / "El profesional llegó" | Solo "En camino" | Se conserva el texto dinámico | El backend avisa la llegada por socket/polling; el icono y la píldora mantienen el mismo estilo. |
| "Última actualización hace N s" | No existe | Se conserva | El tracking real puede perder señal; el usuario necesita saber si la posición está viva. Es una línea de texto secundaria dentro de la hoja. |
| Aviso "Sin señal del profesional" | No existe | Se conserva | Estado real cuando no llegan posiciones por más de 30 s; usa el mismo patrón visual de caja beige. |
| Aviso "Tu profesional llegó" | No existe | Se conserva | Evento real de llegada; refuerza la píldora y usa una caja beige con icono. |
| "Conectando…" / "Sin posiciones todavía" | No existe | Se conserva | Estados iniciales del backend antes de la primera posición; evitan mostrar una ETA falsa. |
