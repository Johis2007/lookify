// src/services/routeService.ts
// Ruta real por calles con OSRM público (sin API key de Google).
// Solo se usa para dibujar la línea hacia el destino; la ubicación en vivo
// sigue siendo expo-location (GPS del sistema, sin key).
// Si OSRM falla (sin red), se devuelve línea recta como fallback.

export type RoutePoint = { latitude: number; longitude: number };

export type RouteResult = {
  points: RoutePoint[];
  /** Metros totales de la ruta. */
  distanceM: number;
  /** Segundos estimados de viaje. */
  durationS: number;
  /** true si es línea recta (fallback sin red). */
  fallback: boolean;
};

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

export async function fetchRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  signal?: AbortSignal
): Promise<RouteResult> {
  const straight: RouteResult = {
    points: [origin, destination],
    distanceM: 0,
    durationS: 0,
    fallback: true,
  };
  try {
    const url =
      `${OSRM_URL}/${origin.longitude},${origin.latitude};` +
      `${destination.longitude},${destination.latitude}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal });
    if (!res.ok) return straight;
    const json = await res.json();
    const r = json?.routes?.[0];
    const coords: [number, number][] | undefined = r?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return straight;
    return {
      points: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distanceM: typeof r.distance === 'number' ? r.distance : 0,
      durationS: typeof r.duration === 'number' ? r.duration : 0,
      fallback: false,
    };
  } catch {
    return straight;
  }
}
