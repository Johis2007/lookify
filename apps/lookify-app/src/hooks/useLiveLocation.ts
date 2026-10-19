// src/hooks/useLiveLocation.ts
// Ubicación en tiempo real con expo-location (camino recomendado).
//
// - NO necesita API key de Google: expo-location usa el GPS del sistema.
// - El mapa tampoco la necesita: nativo usa tiles OpenStreetMap (UrlTile) y
//   web usa Leaflet + OSM. Solo necesitarías key de Google si quieres tiles
//   base de Google en el APK/IPA o la API Directions (ruta hacia destino).
// - Uso: const { location, error, permission } = useLiveLocation();
//   location.latitude, location.longitude, location.speed, location.heading.

import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type LiveCoords = {
  latitude: number;
  longitude: number;
  /** m/s (null en muchos Android si está quieto). */
  speed: number | null;
  /** Grados 0-360 (null si no hay movimiento). */
  heading: number | null;
  /** Precisión estimada en metros (menor = mejor). */
  accuracy: number | null;
};

type PermissionState = 'unknown' | 'granted' | 'denied';

export function useLiveLocation(
  active = true,
  opts?: { timeInterval?: number; distanceInterval?: number; maxAccuracyM?: number }
): { location: LiveCoords | null; error: string | null; permission: PermissionState } {
  const [location, setLocation] = useState<LiveCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>('unknown');

  const timeInterval = opts?.timeInterval ?? 2000;
  const distanceInterval = opts?.distanceInterval ?? 5;
  const maxAccuracyM = opts?.maxAccuracyM ?? 30;

  useEffect(() => {
    if (!active) return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setPermission('denied');
          setError('Permiso de ubicación denegado');
          return;
        }
        setPermission('granted');

        // Primera lectura rápida para no esperar al primer tick del watch.
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

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval, // ms entre actualizaciones (Android)
            distanceInterval, // metros mínimos de movimiento
          },
          (loc) => {
            // Ignorar lecturas con mala precisión para que el pin no "salte".
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
      } catch {
        if (!cancelled) setError('No se pudo obtener tu ubicación. Revisa tu GPS.');
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active, timeInterval, distanceInterval, maxAccuracyM]);

  return { location, error, permission };
}
