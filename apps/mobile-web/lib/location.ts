import * as Location from 'expo-location';

export type LatLng = { latitude: number; longitude: number };

// Pide permiso foreground (Expo Go compatible) y devuelve posición actual.
export async function getCurrentLatLng(): Promise<LatLng | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  };
}

// Watch throttled: solo emite si se movió >20m (anti-saturación).
// Devuelve unsubscribe.
export async function watchThrottled(
  cb: (ll: LatLng) => void,
  minDistanceM = 20
): Promise<() => void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return () => {};
  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: minDistanceM,
      timeInterval: 8000,
    },
    (loc) => cb({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
  );
  return () => sub.remove();
}
