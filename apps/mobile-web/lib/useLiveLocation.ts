// Ubicación en vivo ligera con expo-location (sin API key de Google).
// Para el flujo con confirmación + GPS puntual + manual, usa useClientLocation.
// Este hook es el equivalente directo al ejemplo recomendado:
//   const { location, error } = useLiveLocation();
//   location.latitude, location.longitude, location.speed, location.heading
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type LiveCoords = {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
};

export function useLiveLocation(
  active = true,
  opts?: { timeInterval?: number; distanceInterval?: number; maxAccuracyM?: number }
) {
  const [location, setLocation] = useState<LiveCoords | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeInterval = opts?.timeInterval ?? 2000;
  const distanceInterval = opts?.distanceInterval ?? 5;
  const maxAccuracyM = opts?.maxAccuracyM ?? 30;

  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setError('Permiso de ubicación denegado');
        return;
      }
      try {
        const first = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (!cancelled && (first.coords.accuracy ?? 999) <= maxAccuracyM) {
          setLocation({
            latitude: first.coords.latitude,
            longitude: first.coords.longitude,
            speed: first.coords.speed ?? null,
            heading: first.coords.heading ?? null,
            accuracy: first.coords.accuracy ?? null,
          });
        }
      } catch {
        /* el watch lo compensa */
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval, distanceInterval },
        (loc) => {
          if ((loc.coords.accuracy ?? 999) > maxAccuracyM) return;
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            speed: loc.coords.speed ?? null,
            heading: loc.coords.heading ?? null,
            accuracy: loc.coords.accuracy ?? null,
          });
          setError(null);
        }
      );
    })().catch(() => {
      if (!cancelled) setError('No se pudo obtener tu ubicación. Revisa tu GPS.');
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, timeInterval, distanceInterval, maxAccuracyM]);

  return { location, error };
}
