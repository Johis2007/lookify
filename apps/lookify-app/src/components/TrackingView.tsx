// Vista compartida del seguimiento en vivo (nativo y web).
// - Backend (4C-2): posición real por socket `booking:location` + polling
//   `/tracking` cada 10 s como respaldo, ETA aproximada (20 km/h) y avisos de
//   llegada / última actualización.
// - Demo (EXPO_PUBLIC_USE_BACKEND=false): animación mock de 12 s como antes.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LookifyMap from './LookifyMap';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from './Button';
import { MOCK_PROFESSIONALS } from '../data/mockProfessionals';
import { SERVICIOS_POR_CATEGORIA } from '../data/mockServices';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { MOCK_CLIENT_LOCATION, estimarMinutosLlegada } from '../constants/geo';
import { distanciaKm, redondearDistanciaKm } from '../utils/geo';
import {
  mockNotificarProfesionalCancelacion,
  promptCancelarServicio,
} from '../utils/cancelarServicioAlert';
import { BACKEND } from '../lib/backend/config';
import {
  connectClientRealtime,
  joinClientBookingRoom,
  onBookingEvent,
  onBookingLocation,
  onBookingStatus,
} from '../lib/backend/realtime';
import { loadClientSession } from '../lib/backend/clientAuth';
import { getBookingService } from '../services/bookingService';

type Props = NativeStackScreenProps<RootStackParamList, 'Tracking'>;

const MOCK_TRACKING_MS = 12_000;
const TICK_MS = 250;
const POLL_MS = 10_000;
const VELOCIDAD_ETA_KM_H = 20;

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function minutosEta(distanciaKmRestante: number): number {
  return Math.max(1, Math.ceil((distanciaKmRestante / VELOCIDAD_ETA_KM_H) * 60));
}

export default function TrackingView({ navigation, route }: Props) {
  const params = route.params;
  const {
    professionalId,
    servicioId,
    categoriaId,
    distanciaKm: distanciaInicialParam,
    precioServicio,
    precioDomicilio,
    precioTotal,
    bookingId,
  } = params;

  const modoReal = BACKEND.enabled && Boolean(bookingId);

  const mockProfessional = useMemo(
    () => MOCK_PROFESSIONALS.find((p) => p.id === professionalId),
    [professionalId]
  );

  // En backend el profesional es real: ficha mínima con su resumen público.
  const professional = useMemo(() => {
    if (modoReal) {
      return {
        id: professionalId,
        nombre: params.profesional?.nombre ?? 'Profesional',
        calificacion: params.profesional?.calificacion ?? 0,
        latitude: MOCK_CLIENT_LOCATION.latitude,
        longitude: MOCK_CLIENT_LOCATION.longitude,
      };
    }
    return mockProfessional;
  }, [modoReal, professionalId, params.profesional, mockProfessional]);

  const servicio = SERVICIOS_POR_CATEGORIA[categoriaId]?.find((s) => s.id === servicioId);
  const datosValidos = modoReal ? Boolean(bookingId) : Boolean(mockProfessional && servicio);
  const nombreServicio = servicio?.nombre ?? params.servicioNombre ?? 'Servicio reservado';

  const startCoord = useMemo(
    () => ({
      latitude: professional?.latitude ?? MOCK_CLIENT_LOCATION.latitude,
      longitude: professional?.longitude ?? MOCK_CLIENT_LOCATION.longitude,
    }),
    [professional]
  );

  const allowExitRef = useRef(false);
  const alertOpenRef = useRef(false);
  const elapsedRef = useRef(0);
  const tickIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const [clientCoord, setClientCoord] = useState<{ latitude: number; longitude: number }>({
    latitude: MOCK_CLIENT_LOCATION.latitude,
    longitude: MOCK_CLIENT_LOCATION.longitude,
  });
  const clientCoordRef = useRef(clientCoord);
  const [proCoord, setProCoord] = useState<{ latitude: number; longitude: number } | null>(
    modoReal ? null : startCoord
  );
  const [distanciaRestanteKm, setDistanciaRestanteKm] = useState(distanciaInicialParam);
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>(
    modoReal ? [] : [startCoord]
  );
  const [lastTs, setLastTs] = useState<number | null>(null);
  const [llegada, setLlegada] = useState(false);
  const [estado, setEstado] = useState<string>('accepted');
  const [nowTick, setNowTick] = useState(() => Date.now());

  const minutosLlegada = modoReal
    ? minutosEta(distanciaRestanteKm)
    : estimarMinutosLlegada(distanciaRestanteKm);

  useEffect(() => {
    clientCoordRef.current = clientCoord;
  }, [clientCoord]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Distancia recta pro → cliente (destino de la reserva).
  useEffect(() => {
    if (!proCoord) return;
    setDistanciaRestanteKm(
      redondearDistanciaKm(
        distanciaKm(proCoord.latitude, proCoord.longitude, clientCoord.latitude, clientCoord.longitude)
      )
    );
  }, [proCoord, clientCoord]);

  const applyPosition = useCallback((lat: number, lng: number, ts: number) => {
    const next = { latitude: lat, longitude: lng };
    setProCoord(next);
    setTrail((prev) => [...prev.slice(-39), next]);
    setLastTs(ts);
  }, []);

  const serviceProgressParams = useMemo(
    () => ({
      professionalId,
      servicioId,
      categoriaId,
      distanciaKm: distanciaInicialParam,
      precioServicio,
      precioDomicilio,
      precioTotal,
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
      ...(params.profesional ? { profesional: params.profesional } : {}),
      ...(params.servicioNombre ? { servicioNombre: params.servicioNombre } : {}),
    }),
    [
      professionalId,
      servicioId,
      categoriaId,
      distanciaInicialParam,
      precioServicio,
      precioDomicilio,
      precioTotal,
      params.bookingId,
      params.profesional,
      params.servicioNombre,
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

  // --- Backend: socket + polling del tracking real ---
  useEffect(() => {
    if (!modoReal || !bookingId) return;
    let cancelled = false;
    let unsubLocation: (() => void) | undefined;
    let unsubEvent: (() => void) | undefined;
    let unsubStatus: (() => void) | undefined;

    const aplicarTracking = (t: {
      estado: string;
      ubicacion: { lat: number; lng: number; ts: number } | null;
      llegadaEn: number | null;
      cliente: { lat: number | null; lng: number | null };
    }) => {
      if (cancelled) return;
      if (t.cliente.lat !== null && t.cliente.lng !== null) {
        setClientCoord({ latitude: t.cliente.lat, longitude: t.cliente.lng });
      }
      if (t.ubicacion) applyPosition(t.ubicacion.lat, t.ubicacion.lng, t.ubicacion.ts);
      if (t.llegadaEn) setLlegada(true);
      if (t.estado) setEstado(t.estado);
    };

    const consultar = async () => {
      try {
        const t = await getBookingService().obtenerTracking(String(bookingId));
        aplicarTracking(t);
      } catch {
        /* el socket o el siguiente poll lo compensan */
      }
    };

    void consultar();
    const pollId = setInterval(() => void consultar(), POLL_MS);

    void (async () => {
      const session = await loadClientSession();
      if (cancelled || !session?.token || session.token === 'offline-local') return;
      connectClientRealtime(session.token);
      joinClientBookingRoom(String(bookingId));
      unsubLocation = onBookingLocation((p) => {
        if (p.bookingId !== String(bookingId)) return;
        applyPosition(p.lat, p.lng, p.ts);
      });
      unsubEvent = onBookingEvent((p) => {
        if (p.bookingId !== String(bookingId)) return;
        if (p.status === 'llegada') setLlegada(true);
      });
      unsubStatus = onBookingStatus((id, status) => {
        if (id !== String(bookingId)) return;
        setEstado(status);
      });
    })();

    return () => {
      cancelled = true;
      clearInterval(pollId);
      unsubLocation?.();
      unsubEvent?.();
      unsubStatus?.();
    };
  }, [modoReal, bookingId, applyPosition]);

  // --- Backend: al iniciar/completar (o cancelar) se detiene el rastreo ---
  useEffect(() => {
    if (!modoReal || !datosValidos) return;
    if (estado === 'in_progress' || estado === 'completed') {
      goToServiceInProgress();
    } else if (estado === 'cancelled' || estado === 'expired') {
      allowExitRef.current = true;
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [modoReal, datosValidos, estado, goToServiceInProgress, navigation]);

  // --- Demo: animación mock (sin backend) ---
  useEffect(() => {
    if (modoReal || !datosValidos) return;

    elapsedRef.current = 0;
    setProCoord(startCoord);
    setTrail([startCoord]);
    setDistanciaRestanteKm(distanciaInicialParam);
    clientCoordRef.current = MOCK_CLIENT_LOCATION;

    tickIdRef.current = setInterval(() => {
      if (alertOpenRef.current) return;

      elapsedRef.current += TICK_MS;
      const t = Math.min(1, elapsedRef.current / MOCK_TRACKING_MS);

      const lat = lerp(startCoord.latitude, MOCK_CLIENT_LOCATION.latitude, t);
      const lon = lerp(startCoord.longitude, MOCK_CLIENT_LOCATION.longitude, t);
      const next = { latitude: lat, longitude: lon };
      setProCoord(next);
      setTrail((prev) => [...prev.slice(-39), next]);

      setDistanciaRestanteKm(
        redondearDistanciaKm(
          distanciaKm(lat, lon, MOCK_CLIENT_LOCATION.latitude, MOCK_CLIENT_LOCATION.longitude)
        )
      );

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
  }, [modoReal, datosValidos, startCoord, distanciaInicialParam, goToServiceInProgress]);

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

  if (!datosValidos || !professional) {
    return null;
  }

  const segundosSinActualizar = lastTs !== null ? Math.max(0, Math.floor((nowTick - lastTs) / 1000)) : null;
  const sinSenal = modoReal && segundosSinActualizar !== null && segundosSinActualizar > 30;
  const follow = proCoord ?? clientCoord;
  const center = {
    latitude: (clientCoord.latitude + follow.latitude) / 2,
    longitude: (clientCoord.longitude + follow.longitude) / 2,
  };

  return (
    <View style={styles.root}>
      <LookifyMap
        initial={center}
        pins={[
          {
            id: 'cliente',
            latitude: clientCoord.latitude,
            longitude: clientCoord.longitude,
            title: 'Tu ubicación',
            color: colors.navy,
          },
          ...(proCoord
            ? [
                {
                  id: professional.id,
                  latitude: proCoord.latitude,
                  longitude: proCoord.longitude,
                  title: `${professional.nombre} · ${llegada ? 'Llegó' : 'En camino'}`,
                  color: colors.honey,
                },
              ]
            : []),
        ]}
        trail={trail}
        follow={follow}
      />

      <SafeAreaView style={styles.statusBar} edges={['top']} pointerEvents="none">
        <View style={styles.statusPill}>
          <MaterialCommunityIcons
            name={llegada ? 'map-marker-check' : 'car-side'}
            size={18}
            color={colors.white}
          />
          <Text style={styles.statusText}>{llegada ? 'El profesional llegó' : 'En camino'}</Text>
        </View>
      </SafeAreaView>

      <View style={styles.sheetWrap}>
        <SafeAreaView edges={['bottom']} style={styles.sheetSafe}>
          <View style={styles.sheet}>
            {modoReal && segundosSinActualizar === null ? (
              <>
                <Text style={styles.eta}>Conectando…</Text>
                <Text style={styles.distance}>Esperando la ubicación del profesional</Text>
              </>
            ) : (
              <>
                <Text style={styles.eta}>
                  ~{minutosLlegada} min{modoReal ? ' aprox.' : ''}
                </Text>
                <Text style={styles.distance}>A {distanciaRestanteKm.toFixed(1)} km</Text>
              </>
            )}

            {modoReal ? (
              <Text style={styles.updated}>
                {segundosSinActualizar === null
                  ? 'Sin posiciones todavía'
                  : `Última actualización hace ${segundosSinActualizar} s`}
              </Text>
            ) : null}

            {sinSenal ? (
              <View style={styles.warningBox}>
                <MaterialCommunityIcons name="wifi-alert" size={18} color={colors.error} />
                <Text style={styles.warningText}>
                  Sin señal del profesional hace {segundosSinActualizar} s. Reintentando…
                </Text>
              </View>
            ) : null}

            {llegada ? (
              <View style={styles.arrivedBox}>
                <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
                <Text style={styles.arrivedText}>
                  Tu profesional llegó. El servicio está por comenzar.
                </Text>
              </View>
            ) : null}

            <View style={styles.proRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{iniciales(professional.nombre)}</Text>
              </View>
              <View style={styles.proText}>
                <Text style={styles.proName}>{professional.nombre}</Text>
                <Text style={styles.proMeta}>
                  {nombreServicio} · ⭐ {professional.calificacion.toFixed(1)}
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
  updated: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.beige,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: colors.error,
  },
  arrivedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.beige,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  arrivedText: {
    flex: 1,
    fontSize: 12,
    color: colors.success,
    fontWeight: '600',
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
