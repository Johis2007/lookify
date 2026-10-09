const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Distancia en km entre dos puntos WGS84 (fórmula de Haversine). */
export function distanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Punto a `km` kilómetros de (lat, lon) con rumbo `bearingDeg` (0 = norte). */
export function puntoAKm(
  lat: number,
  lon: number,
  km: number,
  bearingDeg: number
): { latitude: number; longitude: number } {
  const brng = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(km / EARTH_RADIUS_KM) +
      Math.cos(lat1) * Math.sin(km / EARTH_RADIUS_KM) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(km / EARTH_RADIUS_KM) * Math.cos(lat1),
      Math.cos(km / EARTH_RADIUS_KM) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { latitude: toDeg(lat2), longitude: toDeg(lon2) };
}

/** Una sola redondeo para UI, domicilio y navegación (1 decimal). */
export function redondearDistanciaKm(km: number): number {
  return Math.round(km * 10) / 10;
}
