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
