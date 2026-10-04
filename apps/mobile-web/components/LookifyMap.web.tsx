import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type ProPin = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
};

type Props = {
  initial: { latitude: number; longitude: number };
  pins?: ProPin[];
  onProPress?: (id: string) => void;
};

// Web fallback sin dependencia nativa: usa Google Maps Embed (sin API key).
// Cuando haya EXPO_PUBLIC_GOOGLE_MAPS_KEY, se puede migrar a @react-google-maps/api.
export default function LookifyMap({ initial, pins = [] }: Props) {
  const q = `${initial.latitude},${initial.longitude}`;
  return (
    <View style={styles.container}>
      {/* @ts-ignore - iframe solo existe en web */}
      <iframe
        title="Mapa Lookify"
        style={{ width: '100%', height: '100%', border: 0 }}
        src={`https://maps.google.com/maps?q=${q}&z=14&output=embed`}
      />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {pins.length} profesionales cerca (vista web MVP)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' as any },
  badge: {
    position: 'absolute' as any,
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: { color: '#fff', fontSize: 12 },
});
