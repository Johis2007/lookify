// src/components/LookifyMap.native.tsx
// Mapa unificado en nativo: react-native-maps con PROVIDER_DEFAULT (sin API
// key de Google todavía: iOS usa Apple Maps, Android el mapa del sistema).
// Cuando tengas la key, cambia a PROVIDER_GOOGLE (una línea, ver TODO).
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';

export type ProPin = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  /** Color del pin (ej. cliente navy, profesional honey). */
  color?: string;
};

export type TrailPoint = { latitude: number; longitude: number };

type Props = {
  initial: { latitude: number; longitude: number };
  pins?: ProPin[];
  /** Recorrido del profesional (línea de movimiento). */
  trail?: TrailPoint[];
  /** Centro a seguir con cámara animada (tracking en vivo). */
  follow?: { latitude: number; longitude: number } | null;
  onProPress?: (id: string) => void;
};

export default function LookifyMap({ initial, pins = [], trail = [], follow, onProPress }: Props) {
  const ref = useRef<MapView | null>(null);
  const lastFollow = useRef<{ latitude: number; longitude: number } | null>(null);

  // La cámara sigue al profesional con animación suave (800ms). Solo si se
  // movió >30m para no pelear con el gesto del usuario en micro-jitters.
  useEffect(() => {
    if (!follow) return;
    const prev = lastFollow.current;
    lastFollow.current = follow;
    if (!prev) return;
    const dLat = Math.abs(follow.latitude - prev.latitude) * 111_320;
    const dLng = Math.abs(follow.longitude - prev.longitude) * 111_320;
    if (dLat < 30 && dLng < 30) return;
    try {
      ref.current?.animateToRegion(
        { latitude: follow.latitude, longitude: follow.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        800
      );
    } catch {
      /* mapa aún montando */
    }
  }, [follow]);

  return (
    <View style={styles.container}>
      <MapView
        ref={ref}
        style={styles.map}
        // TODO: cuando tengas la API key de Google, cambia a PROVIDER_GOOGLE
        // y agrega la key en app.json (Android) / Info.plist (iOS).
        provider={PROVIDER_DEFAULT}
        showsUserLocation
        initialRegion={{
          latitude: initial.latitude,
          longitude: initial.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {trail.length > 1 && (
          <Polyline coordinates={trail} strokeWidth={4} strokeColor="rgba(20,60,160,0.65)" lineDashPattern={[1, 0]} />
        )}
        {pins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.title ?? 'Profesional Lookify'}
            pinColor={p.color}
            onPress={() => onProPress?.(p.id)}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
});
