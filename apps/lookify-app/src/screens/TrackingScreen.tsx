// Pantalla 8: seguimiento en vivo del profesional en camino (mock animado).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LookifyMap from '../components/LookifyMap';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import { MOCK_PROFESSIONALS } from '../data/mockProfessionals';
import { SERVICIOS_POR_CATEGORIA } from '../data/mockServices';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { MOCK_CLIENT_LOCATION, estimarMinutosLlegada } from '../constants/geo';
import { distanciaKm, redondearDistanciaKm } from '../utils/geo';
import {
  mockNotificarProfesionalCancelacion,
  promptCancelarServicio,
} from '../utils/cancelarServicioAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'Tracking'>;

const MOCK_TRACKING_MS = 12_000;
const TICK_MS = 250;

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function TrackingScreen({ navigation, route }: Props) {
  const params = route.params;
  const {
    professionalId,
    servicioId,
    categoriaId,
    distanciaKm: distanciaInicialParam,
    precioServicio,
    precioDomicilio,
    precioTotal,
  } = params;

  const professional = MOCK_PROFESSIONALS.find((p) => p.id === professionalId);
  const servicio = SERVICIOS_POR_CATEGORIA[categoriaId]?.find((s) => s.id === servicioId);
  const datosValidos = Boolean(professional && servicio);

  const startCoord = useMemo(
    () =>
      professional
        ? { latitude: professional.latitude, longitude: professional.longitude }
        : MOCK_CLIENT_LOCATION,
    [professional]
  );

  const allowExitRef = useRef(false);
  const alertOpenRef = useRef(false);
  const elapsedRef = useRef(0);
  const tickIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const [proCoord, setProCoord] = useState(startCoord);
  const [distanciaRestanteKm, setDistanciaRestanteKm] = useState(distanciaInicialParam);
  // Recorrido del profesional (últimas 40 posiciones, como en el repo Stitch).
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([startCoord]);

  const minutosLlegada = estimarMinutosLlegada(distanciaRestanteKm);

  const serviceProgressParams = useMemo(
    () => ({
      professionalId,
      servicioId,
      categoriaId,
      distanciaKm: distanciaInicialParam,
      precioServicio,
      precioDomicilio,
      precioTotal,
    }),
    [
      professionalId,
      servicioId,
      categoriaId,
      distanciaInicialParam,
      precioServicio,
      precioDomicilio,
      precioTotal,
    ]
  );

  const resetToHome = useCallback(() => {
    allowExitRef.current = true;
    if (tickIdRef.current) {
      clearInterval(tickIdRef.current);
      tickIdRef.current = null;
    }
    mockNotificarProfesionalCancelacion(professionalId);
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [navigation, professionalId]);

  const goToServiceInProgress = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    allowExitRef.current = true;
    if (tickIdRef.current) {
      clearInterval(tickIdRef.current);
      tickIdRef.current = null;
    }
    navigation.replace('ServiceInProgress', serviceProgressParams);
  }, [navigation, serviceProgressParams]);

  useEffect(() => {
    if (!datosValidos) {
      allowExitRef.current = true;
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    }
  }, [datosValidos, navigation]);

  useEffect(() => {
    if (!datosValidos) return;

    elapsedRef.current = 0;
    setProCoord(startCoord);
    setTrail([startCoord]);
    setDistanciaRestanteKm(distanciaInicialParam);

    tickIdRef.current = setInterval(() => {
      if (alertOpenRef.current) return;

      elapsedRef.current += TICK_MS;
      const t = Math.min(1, elapsedRef.current / MOCK_TRACKING_MS);

      const lat = lerp(startCoord.latitude, MOCK_CLIENT_LOCATION.latitude, t);
      const lon = lerp(startCoord.longitude, MOCK_CLIENT_LOCATION.longitude, t);
      const next = { latitude: lat, longitude: lon };
      setProCoord(next);
      setTrail((prev) => [...prev.slice(-39), next]);

      const km = redondearDistanciaKm(
        distanciaKm(lat, lon, MOCK_CLIENT_LOCATION.latitude, MOCK_CLIENT_LOCATION.longitude)
      );
      setDistanciaRestanteKm(km);

      if (t >= 1) {
        goToServiceInProgress();
      }
    }, TICK_MS);

    return () => {
      if (tickIdRef.current) {
        clearInterval(tickIdRef.current);
        tickIdRef.current = null;
      }
    };
  }, [datosValidos, startCoord, distanciaInicialParam, goToServiceInProgress]);

  const showCancelarServicioAlert = useCallback(() => {
    promptCancelarServicio({
      alertVisibleRef: alertOpenRef,
      onContinuar: () => {},
      onConfirmCancel: resetToHome,
    });
  }, [resetToHome]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current) return;
      e.preventDefault();
      showCancelarServicioAlert();
    });
    return unsubscribe;
  }, [navigation, showCancelarServicioAlert]);

  const handleCancelarServicio = () => {
    showCancelarServicioAlert();
  };

  const mockContacto = (canal: 'llamada' | 'mensaje') => {
    Alert.alert(
      canal === 'llamada' ? 'Llamar' : 'Mensaje',
      'Disponible cuando exista la integración con el backend.'
    );
  };

  if (!datosValidos || !professional || !servicio) {
    return null;
  }

  return (
    <View style={styles.root}>
      {/* Mapa unificado con recorrido + cámara seguidora (web: Leaflet) */}
      <LookifyMap
        initial={{
          latitude: (MOCK_CLIENT_LOCATION.latitude + startCoord.latitude) / 2,
          longitude: (MOCK_CLIENT_LOCATION.longitude + startCoord.longitude) / 2,
        }}
        pins={[
          {
            id: 'cliente',
            latitude: MOCK_CLIENT_LOCATION.latitude,
            longitude: MOCK_CLIENT_LOCATION.longitude,
            title: 'Tu ubicación',
            color: colors.navy,
          },
          {
            id: professional.id,
            latitude: proCoord.latitude,
            longitude: proCoord.longitude,
            title: `${professional.nombre} · En camino`,
            color: colors.honey,
          },
        ]}
        trail={trail}
        follow={proCoord}
      />

      <SafeAreaView style={styles.statusBar} edges={['top']} pointerEvents="none">
        <View style={styles.statusPill}>
          <MaterialCommunityIcons name="car-side" size={18} color={colors.white} />
          <Text style={styles.statusText}>En camino</Text>
        </View>
      </SafeAreaView>

      <View style={styles.sheetWrap}>
        <SafeAreaView edges={['bottom']} style={styles.sheetSafe}>
          <View style={styles.sheet}>
            <Text style={styles.eta}>~{minutosLlegada} min</Text>
            <Text style={styles.distance}>A {distanciaRestanteKm.toFixed(1)} km</Text>

            <View style={styles.proRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{iniciales(professional.nombre)}</Text>
              </View>
              <View style={styles.proText}>
                <Text style={styles.proName}>{professional.nombre}</Text>
                <Text style={styles.proMeta}>
                  {servicio.nombre} · ⭐ {professional.calificacion.toFixed(1)}
                </Text>
              </View>
            </View>

            <View style={styles.contactRow}>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => mockContacto('llamada')}
                accessibilityRole="button"
                accessibilityLabel="Llamar al profesional"
              >
                <MaterialCommunityIcons name="phone-outline" size={22} color={colors.navy} />
                <Text style={styles.contactLabel}>Llamar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => mockContacto('mensaje')}
                accessibilityRole="button"
                accessibilityLabel="Enviar mensaje al profesional"
              >
                <MaterialCommunityIcons name="message-outline" size={22} color={colors.navy} />
                <Text style={styles.contactLabel}>Mensaje</Text>
              </TouchableOpacity>
            </View>

            <Button label="Cancelar servicio" onPress={handleCancelarServicio} variant="outline" />
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.beige,
  },
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  statusText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetSafe: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  sheet: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  eta: {
    ...typography.heading,
    fontSize: 28,
    color: colors.navy,
  },
  distance: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  proText: {
    flex: 1,
  },
  proName: {
    fontWeight: '600',
    fontSize: 16,
    color: colors.textPrimary,
  },
  proMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.beige,
  },
  contactLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
  },
});
