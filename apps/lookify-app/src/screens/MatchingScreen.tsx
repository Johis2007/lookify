// Pantalla 6: búsqueda de profesional.
//  - Modo demo (sin backend): simulación local como antes.
//  - Modo backend (4B): reserva real en el BFF, consultation por poll de
//    GET /api/bookings/:id y avisos por socket (booking:status).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import { RadarScan } from '../components/RadarScan';
import { filtrarCandidatosMatching } from '../data/mockProfessionals';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { promptCancelarSolicitud } from '../utils/cancelarSolicitudAlert';
import { redondearDistanciaKm } from '../utils/geo';
import { getBookingService } from '../services/bookingService';
import type { ReservaDetalle } from '../services/bookingService';
import { isBackendEnabled } from '../services/backend/initBackend';
import { getUltimoListadoCercanos } from '../services/backend/backendNearbyService';
import { MOCK_CLIENT_LOCATION } from '../constants/geo';
import {
  connectClientRealtime,
  disconnectClientRealtime,
  joinClientBookingRoom,
  onBookingStatus,
} from '../lib/backend/realtime';
import { loadClientSession } from '../lib/backend/clientAuth';

type Props = NativeStackScreenProps<RootStackParamList, 'Matching'>;

const MOCK_STEP_MS = 1500;
/** Frecuencia del poll de la reserva mientras se busca. */
const POLL_MS = 5000;

const CHECKLIST_LABELS = [
  'Solicitud enviada',
  (radioKm: number) => `Buscando profesionales a ${radioKm} km`,
  'Profesional confirmó disponibilidad',
] as const;

/** Radio de búsqueda por ronda (el servidor amplía solo). */
const RADIO_POR_RONDA: Record<number, number> = { 1: 3, 2: 6 };

export default function MatchingScreen({ navigation, route }: Props) {
  const params = route.params;
  const { categoriaId, servicioId, radioKm, rejectionCount, rejectedIds, categoriaNombre } =
    params;
  const bookingId = params.bookingId;

  const modoReal = isBackendEnabled() && Boolean(bookingId);

  const [completedSteps, setCompletedSteps] = useState(0);
  const [showSpecialOptions, setShowSpecialOptions] = useState(false);
  // Estado real de la reserva (backend).
  const [estadoReal, setEstadoReal] = useState<
    'buscando' | 'aceptado' | 'expirado' | 'cancelado' | 'error'
  >('buscando');
  const [rondaReal, setRondaReal] = useState(1);
  const [expiraEn, setExpiraEn] = useState<number | null>(null);
  const [segundos, setSegundos] = useState<number | null>(null);
  const [errorReal, setErrorReal] = useState<string | null>(null);

  const allowExitRef = useRef(false);
  const alertOpenRef = useRef(false);
  const completedStepsRef = useRef(0);
  const timerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detalleRef = useRef<ReservaDetalle | null>(null);
  const fallosRef = useRef(0);
  const scanning = !showSpecialOptions;

  useEffect(() => {
    completedStepsRef.current = completedSteps;
  }, [completedSteps]);

  const clearTimers = useCallback(() => {
    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      if (alertOpenRef.current) return;
      fn();
    }, delayMs);
    timerIdsRef.current.push(id);
  }, []);

  const resetToHome = useCallback(() => {
    allowExitRef.current = true;
    clearTimers();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [clearTimers, navigation]);

  const goToOffer = useCallback(
    (professionalId: string, distanciaKm: number) => {
      allowExitRef.current = true;
      clearTimers();
      navigation.replace('ProfessionalOffer', {
        ...params,
        professionalId,
        distanciaKm,
      });
    },
    [clearTimers, navigation, params]
  );

  // --- Modo real: el profesional aceptó, se muestra su ficha ---------------
  const goToOfferReal = useCallback(() => {
    const detalle = detalleRef.current;
    const pro = detalle?.profesional;
    if (!pro) return;
    const cercano = getUltimoListadoCercanos().find((p) => p.id === pro.id);
    allowExitRef.current = true;
    clearTimers();
    navigation.replace('ProfessionalOffer', {
      ...params,
      professionalId: pro.id,
      distanciaKm: cercano?.distanciaKm ?? 1.2,
      profesional: pro,
      precioServidor: detalle?.precioTotal ?? null,
      servicioNombre: detalle?.servicioNombre ?? null,
    });
  }, [clearTimers, navigation, params]);

  // --- Modo real: aplicación del estado de la reserva ----------------------
  const aplicarEstado = useCallback(
    (estado: string, detalle?: { profesional: unknown; expiraEn: number | null; ronda: number }) => {
      if (estado === 'accepted') {
        setEstadoReal('aceptado');
        setCompletedSteps(3);
        goToOfferReal();
        return;
      }
      if (estado === 'expired') {
        setEstadoReal('expirado');
        setShowSpecialOptions(true);
        return;
      }
      if (estado === 'cancelled') {
        setEstadoReal('cancelado');
        setShowSpecialOptions(true);
        return;
      }
      // pending: sigue buscando.
      setEstadoReal('buscando');
      setShowSpecialOptions(false);
      setErrorReal(null);
      if (typeof detalle?.ronda === 'number' && detalle.ronda > 0) setRondaReal(detalle.ronda);
      if (detalle?.expiraEn) setExpiraEn(detalle.expiraEn);
    },
    [goToOfferReal]
  );

  const consultarReserva = useCallback(async () => {
    if (!bookingId) return;
    try {
      const detalle = await getBookingService().obtenerReserva(bookingId);
      fallosRef.current = 0;
      detalleRef.current = detalle;
      aplicarEstado(detalle.estado, {
        profesional: detalle.profesional,
        expiraEn: detalle.expiraEn,
        ronda: detalle.ronda,
      });
    } catch {
      // Fallos sueltos (red) no cierran la búsqueda: solo tras varios seguidos.
      fallosRef.current += 1;
      if (fallosRef.current >= 3) {
        setEstadoReal('error');
        setErrorReal('No pudimos consultar tu reserva. Revisa tu conexión.');
        setShowSpecialOptions(true);
      }
    }
  }, [aplicarEstado, bookingId]);

  // --- Modo demo: simulación local ----------------------------------------
  const runSimulation = useCallback(
    (fromStep: number) => {
      clearTimers();

      if (fromStep === 0) {
        setCompletedSteps(0);
        setShowSpecialOptions(false);
      }

      const candidates = filtrarCandidatosMatching(categoriaId, radioKm, rejectedIds);

      if (rejectionCount >= 3 || candidates.length === 0) {
        setShowSpecialOptions(true);
        return;
      }

      const candidate = candidates[0];
      const distanciaKm = redondearDistanciaKm(candidate.distanciaKm);

      let delay = 0;
      for (let step = fromStep; step < 3; step += 1) {
        delay += MOCK_STEP_MS;
        const stepIndex = step;
        schedule(() => setCompletedSteps(stepIndex + 1), delay);
      }

      schedule(() => {
        goToOffer(candidate.professional.id, distanciaKm);
      }, delay + MOCK_STEP_MS);
    },
    [
      categoriaId,
      radioKm,
      rejectedIds,
      rejectionCount,
      clearTimers,
      schedule,
      goToOffer,
    ]
  );

  const runSimulationRef = useRef(runSimulation);
  runSimulationRef.current = runSimulation;

  // Cancelar la reserva real (backend) o cerrar la búsqueda (demo).
  const cancelarYVolver = useCallback(async () => {
    if (modoReal && bookingId) {
      try {
        await getBookingService().cancelarReserva(bookingId);
      } catch {
        // Si el servidor ya la cerró, se vuelve al inicio de igual.
      }
    }
    allowExitRef.current = true;
    clearTimers();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }, [modoReal, bookingId, clearTimers, navigation]);

  const showCancelAlert = useCallback(
    (onConfirmExit: () => void) => {
      promptCancelarSolicitud({
        alertVisibleRef: alertOpenRef,
        // En backend el poll sigue corriendo: no se detiene al preguntar.
        onBeforeShow: modoReal ? undefined : clearTimers,
        onSeguirBuscando: () => {
          if (modoReal) {
            void consultarReserva();
            return;
          }
          if (!showSpecialOptions) {
            runSimulationRef.current(completedStepsRef.current);
          }
        },
        onConfirmCancel: modoReal ? () => void cancelarYVolver() : onConfirmExit,
      });
    },
    [clearTimers, showSpecialOptions, modoReal, consultarReserva, cancelarYVolver]
  );

  // --- Arranque ------------------------------------------------------------
  useEffect(() => {
    if (!modoReal) {
      runSimulation(0);
      return () => clearTimers();
    }

    let unsubscribeStatus: (() => void) | undefined;
    let cancelled = false;

    // La reserva se creó en la pantalla anterior: el primer paso ya está hecho.
    setCompletedSteps(1);

    (async () => {
      const session = await loadClientSession();
      if (cancelled) return;
      if (session?.token && session.token !== 'offline-local') {
        connectClientRealtime(session.token);
        joinClientBookingRoom(String(bookingId));
        unsubscribeStatus = onBookingStatus((id) => {
          if (String(id) !== String(bookingId)) return;
          void consultarReserva();
        });
      }
      await consultarReserva();
      if (cancelled) return;
      pollingRef.current = setInterval(() => {
        void consultarReserva();
      }, POLL_MS);
    })();

    return () => {
      cancelled = true;
      unsubscribeStatus?.();
      clearTimers();
      disconnectClientRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoReal, bookingId]);

  // Countdown de la oferta (solo modo real).
  useEffect(() => {
    if (!modoReal || !expiraEn) return;
    const tick = () => {
      const rest = Math.max(0, Math.ceil((expiraEn - Date.now()) / 1000));
      setSegundos(rest);
      if (rest === 0) void consultarReserva();
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [modoReal, expiraEn, consultarReserva]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current) return;
      e.preventDefault();
      showCancelAlert(resetToHome);
    });
    return unsubscribe;
  }, [navigation, showCancelAlert, resetToHome]);

  // Cancelar la reserva real (backend) o cerrar la búsqueda (demo).
  const handleCancelPress = useCallback(() => {
    showCancelAlert(resetToHome);
  }, [showCancelAlert, resetToHome]);

  const handleExpandRadio = () => {
    allowExitRef.current = true;
    clearTimers();
    navigation.replace('Matching', {
      categoriaId,
      categoriaNombre,
      servicioId,
      radioKm: 6,
      rejectionCount: 0,
      rejectedIds,
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
    });
  };

  // Reintento real: se crea una reserva nueva (ronda 1 otra vez) y se vuelve
  // a buscar. La reserva anterior ya expiró, así que no se cancela.
  const handleReintentar = useCallback(async () => {
    if (!modoReal) return;
    try {
      const reserva = await getBookingService().crearReserva({
        serviceId: servicioId,
        addressText: 'Dirección a confirmar',
        lat: MOCK_CLIENT_LOCATION.latitude,
        lng: MOCK_CLIENT_LOCATION.longitude,
      });
      allowExitRef.current = true;
      clearTimers();
      setShowSpecialOptions(false);
      setEstadoReal('buscando');
      setRondaReal(1);
      setErrorReal(null);
      navigation.replace('Matching', {
        categoriaId,
        categoriaNombre,
        servicioId,
        radioKm: 3,
        rejectionCount: 0,
        rejectedIds: [],
        bookingId: reserva.bookingId,
      });
    } catch {
      setErrorReal('No pudimos crear una nueva solicitud. Intenta de nuevo.');
    }
  }, [modoReal, servicioId, categoriaId, categoriaNombre, clearTimers, navigation]);

  const radioActual = modoReal ? (RADIO_POR_RONDA[rondaReal] ?? radioKm) : radioKm;
  const segundosTexto =
    segundos === null
      ? null
      : `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;

  const noMoreProsMessage =
    !modoReal && radioKm === 6
      ? 'No hay más profesionales disponibles en un radio de 6 km.'
      : undefined;

  const tituloSinResultados =
    modoReal && estadoReal === 'cancelado'
      ? 'Solicitud cancelada'
      : modoReal && estadoReal === 'error'
        ? 'Problema de conexión'
        : 'No encontramos profesionales disponibles';

  const cuerpoSinResultados =
    modoReal && estadoReal === 'cancelado'
      ? 'Tu solicitud se cerró sin costo.'
      : modoReal && estadoReal === 'error'
        ? errorReal ?? 'Intenta de nuevo en un momento.'
        : modoReal
          ? 'Ampliamos la búsqueda hasta 6 km. Puedes intentarlo de nuevo o cancelar sin costo.'
          : noMoreProsMessage;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Radar Stitch: ondas + barrido + núcleo, acelera al escanear */}
        <View style={styles.radarWrap}>
          <RadarScan
            scanning={scanning}
            statusText={
              showSpecialOptions
                ? 'Búsqueda detenida'
                : completedSteps >= 3
                  ? 'Profesional encontrado'
                  : `Buscando a ${radioActual} km`
            }
          />
        </View>

        {!showSpecialOptions ? (
          <View style={styles.checklist}>
            {CHECKLIST_LABELS.map((label, index) => {
              const text = typeof label === 'function' ? label(radioActual) : label;
              const done = completedSteps > index;
              return (
                <View key={text} style={styles.checkRow}>
                  <MaterialCommunityIcons
                    name={done ? 'check-circle' : 'circle-outline'}
                    size={22}
                    color={done ? colors.honey : colors.textOnNavyMuted}
                  />
                  <Text style={[styles.checkText, done && styles.checkTextDone]}>{text}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.specialBlock}>
            <Text style={styles.specialTitle}>{tituloSinResultados}</Text>
            {cuerpoSinResultados ? (
              <Text style={styles.specialBody}>{cuerpoSinResultados}</Text>
            ) : null}
            {!modoReal && radioKm === 3 ? (
              <Button
                label="Ampliar radio a 6 km"
                onPress={handleExpandRadio}
                variant="accent"
                style={styles.actionButton}
              />
            ) : null}
            {modoReal && estadoReal === 'expirado' ? (
              <Button
                label="Intentar de nuevo"
                onPress={handleReintentar}
                variant="accent"
                style={styles.actionButton}
              />
            ) : null}
            <TouchableOpacity style={styles.outlineButton} onPress={handleCancelPress}>
              <Text style={styles.outlineButtonText}>Cancelar sin costo</Text>
            </TouchableOpacity>
          </View>
        )}

        {modoReal && !showSpecialOptions && segundosTexto ? (
          <View style={styles.countdownRow}>
            <MaterialCommunityIcons name="timer-outline" size={18} color={colors.honey} />
            <Text style={styles.countdownText}>
              La oferta cierra en {segundosTexto} · ronda {rondaReal} de 2
            </Text>
          </View>
        ) : null}

        {rejectionCount > 0 && !showSpecialOptions ? (
          <Text style={styles.rejectionHint}>Rechazos: {rejectionCount} de 3</Text>
        ) : null}

        {!showSpecialOptions ? (
          <TouchableOpacity style={[styles.outlineButton, styles.cancelButton]} onPress={handleCancelPress}>
            <Text style={styles.outlineButtonText}>Cancelar solicitud</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: spacing.xl,
  },
  radarWrap: {
    marginBottom: spacing.lg,
  },
  checklist: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkText: {
    flex: 1,
    fontSize: 15,
    color: colors.textOnNavyMuted,
  },
  checkTextDone: {
    color: colors.textOnNavy,
    fontWeight: '600',
  },
  specialBlock: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  specialTitle: {
    ...typography.title,
    color: colors.textOnNavy,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  specialBody: {
    fontSize: 14,
    color: colors.textOnNavyMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  actionButton: {
    marginBottom: 0,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  countdownText: {
    fontSize: 13,
    color: colors.textOnNavyMuted,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: colors.textOnNavyMuted,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  outlineButtonText: {
    ...typography.button,
    color: colors.textOnNavy,
  },
  rejectionHint: {
    marginTop: spacing.lg,
    fontSize: 12,
    color: colors.textOnNavyMuted,
  },
  cancelButton: {
    marginTop: 'auto',
    marginBottom: spacing.lg,
    alignSelf: 'stretch',
  },
});
