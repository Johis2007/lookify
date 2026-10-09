// Ubicación fija del cliente en mocks (Chapinero, Bogotá).
// Cuando exista geolocalización real, reemplazar en Home y en el flujo de solicitud.

export const MOCK_CLIENT_LOCATION = {
  latitude: 4.6533,
  longitude: -74.0627,
} as const;

/** Velocidad fija para ETA de llegada del profesional (mock). */
export const VELOCIDAD_ESTIMADA_KM_H = 25;

export function estimarMinutosLlegada(distanciaKm: number): number {
  const minutos = Math.ceil((distanciaKm / VELOCIDAD_ESTIMADA_KM_H) * 60);
  return Math.max(1, minutos);
}
