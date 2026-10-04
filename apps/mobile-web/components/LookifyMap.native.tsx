import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

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

export default function LookifyMap({ initial, pins = [], onProPress }: Props) {
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        initialRegion={{
          latitude: initial.latitude,
          longitude: initial.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {pins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.title ?? 'Profesional Lookify'}
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
