// src/screens/LiveRouteScreen.tsx
// Pantalla: mapa a pantalla completa con tu ubicación en vivo (expo-location)
// y ruta real por calles hacia un destino (OSRM, sin API key de Google).
// La ruta se recalcula solo si te mueves >50 m o pasan >15 s (ahorra datos).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import LookifyMap from '../components/LookifyMap';
import BackHeader from '../components/BackHeader';
import { colors, radius, spacing, typography } from '../theme/colors';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { fetchRoute, type RouteResult } from '../services/routeService';
import { MOCK_CLIENT_LOCATION } from '../constants/geo';
import { MOCK_PROFESSIONALS } from '../data/mockProfessionals';
import { distanciaKm } from '../utils/geo';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveRoute'>;

const DEFAULT_DEST = {
  latitude: MOCK_PROFESSIONALS[0]?.latitude ?? 4.6486,
  longitude: MOCK_PROFESSIONALS[0]?.longitude ?? -74.0595,
  nombre: MOCK_PROFESSIONALS[0]?.nombre ?? 'Destino',
};

const RECALC_MIN_M = 50;
const RECALC_MIN_MS = 15_000;

function fmtDistancia(m: number): string {
  if (m <= 0) return '—';
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(2)} km` : `${km.toFixed(1)} km`;
}

function fmtDuracion(s: number): string {
  if (s <= 0) return '—';
  const min = Math.round(s / 60);
  return min < 60 ? `~${min} min` : `~${Math.floor(min / 60)} h ${min % 60} min`;
}

export default function LiveRouteScreen({ route }: Props) {
  const destino = {
    latitude: route.params?.latitude ?? DEFAULT_DEST.latitude,
    longitude: route.params?.longitude ?? DEFAULT_DEST.longitude,
    nombre: route.params?.nombre ?? DEFAULT_DEST.nombre,
  };

  const { location: live, error: liveError } = useLiveLocation(true);
  const origin = useMemo(
    () =>
      live
        ? { latitude: live.latitude, longitude: live.longitude }
        : { ...MOCK_CLIENT_LOCATION },
    [live]
  );

  const [ruta, setRuta] = useState<RouteResult | null>(null);
  const [calculando, setCalculando] = useState(false);
  const lastOrigin = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastAt = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const prev = lastOrigin.current;
    const movedM = prev
      ? distanciaKm(prev.latitude, prev.longitude, origin.latitude, origin.longitude) * 1000
      : Infinity;
    const elapsed = Date.now() - lastAt.current;
    if (ruta && movedM < RECALC_MIN_M && elapsed < RECALC_MIN_MS) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCalculando(true);
    void fetchRoute(origin, destino, ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      setRuta(r);
      lastOrigin.current = { ...origin };
      lastAt.current = Date.now();
      setCalculando(false);
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.latitude, origin.longitude]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const mid = {
    latitude: (origin.latitude + destino.latitude) / 2,
    longitude: (origin.longitude + destino.longitude) / 2,
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <BackHeader title="Ruta en vivo" />
      <View style={styles.mapWrap}>
        <LookifyMap
          initial={mid}
          pins={[
            {
              id: 'yo',
              latitude: origin.latitude,
              longitude: origin.longitude,
              title: live ? 'Estás aquí (GPS en vivo)' : 'Ubicación aproximada',
              color: colors.navy,
            },
            {
              id: 'destino',
              latitude: destino.latitude,
              longitude: destino.longitude,
              title: destino.nombre,
              color: colors.error,
            },
          ]}
          route={ruta?.points ?? []}
          follow={live ? origin : null}
        />
        {calculando && (
          <View style={styles.calcBadge}>
            <ActivityIndicator size="small" color={colors.navy} />
            <Text style={styles.calcText}>Calculando ruta…</Text>
          </View>
        )}
      </View>
      <View style={styles.sheet}>
        <View style={styles.row}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Distancia</Text>
            <Text style={styles.statValue}>{ruta ? fmtDistancia(ruta.distanceM) : '…'}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Duración</Text>
            <Text style={styles.statValue}>{ruta ? fmtDuracion(ruta.durationS) : '…'}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Velocidad</Text>
            <Text style={styles.statValue}>
              {live ? `${(live.speed ?? 0).toFixed(1)} m/s` : '—'}
            </Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {live
            ? `GPS en vivo · ±${Math.round(live.accuracy ?? 0)} m · ${live.latitude.toFixed(5)}, ${live.longitude.toFixed(5)}`
            : (liveError ?? 'Activando GPS…') + ' · mostrando punto aproximado'}
        </Text>
        {ruta?.fallback ? (
          <Text style={styles.warn}>Sin conexión a rutas: línea recta. Revisa tu internet.</Text>
        ) : null}
        <Text style={styles.dest}>Hacia: {destino.nombre}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.beige },
  mapWrap: { flex: 1, marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#e8edf3' },
  calcBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  calcText: { fontSize: 12, fontWeight: '700', color: colors.navy },
  sheet: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1 },
  statLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  statValue: { ...typography.heading, fontSize: 18, color: colors.navy },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  warn: { fontSize: 12, color: colors.error, fontWeight: '600' },
  dest: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
});
