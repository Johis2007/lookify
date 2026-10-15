// Pantalla 9: servicio en progreso (checklist + PIN + progreso mock).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../theme/colors';
import { MOCK_PROFESSIONALS } from '../data/mockProfessionals';
import { SERVICIOS_POR_CATEGORIA } from '../data/mockServices';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  MOCK_FINAL_MS,
  MOCK_LLEGADA_MS,
  MOCK_PIN_INGRESO_MS,
  MOCK_SERVICIO_MS,
  MOCK_SERVICIO_TICK_MS,
} from '../constants/serviceInProgress';
import { alertServicioEnCurso } from '../utils/alertServicioEnCurso';
import {
  mockNotificarProfesionalCancelacion,
  promptCancelarServicio,
} from '../utils/cancelarServicioAlert';
import { generarPinServicioMock, pinAccessibilityLabel } from '../utils/mockServicePin';

type Props = NativeStackScreenProps<RootStackParamList, 'ServiceInProgress'>;

type Fase = 'llegada' | 'esperandoPin' | 'servicio' | 'finalizado';

const CHECKLIST_LABELS = [
  'Profesional llegó',
  'Servicio iniciado',
  'Servicio finalizado',
] as const;

export default function ServiceInProgressScreen({ navigation, route }: Props) {
  const params = route.params;
  const {
    professionalId,
    servicioId,
    categoriaId,
    distanciaKm,
    precioServicio,
    precioDomicilio,
    precioTotal,
  } = params;

  const professional = MOCK_PROFESSIONALS.find((p) => p.id === professionalId);
  const servicio = SERVICIOS_POR_CATEGORIA[categoriaId]?.find((s) => s.id === servicioId);
  const datosValidos = Boolean(professional && servicio);

  const [pinServicio] = useState(() => generarPinServicioMock());

  const allowExitRef = useRef(false);
  const alertOpenRef = useRef(false);
  const faseRef = useRef<Fase>('llegada');
  const pinValidadoRef = useRef(false);
  const timerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const servicioElapsedRef = useRef(0);
  const navigatedRef = useRef(false);

  const [fase, setFase] = useState<Fase>('llegada');
  const [completedSteps, setCompletedSteps] = useState(0);
  const [progressServicio, setProgressServicio] = useState(0);
  const [pinValidado, setPinValidado] = useState(false);

  faseRef.current = fase;
  pinValidadoRef.current = pinValidado;

  const paymentParams = useMemo(
    () => ({
      professionalId,
      servicioId,
      categoriaId,
      distanciaKm,
      precioServicio,
      precioDomicilio,
      precioTotal,
    }),
    [
      professionalId,
      servicioId,
      categoriaId,
      distanciaKm,
      precioServicio,
      precioDomicilio,
      precioTotal,
    ]
  );

  const clearTimers = useCallback(() => {
    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
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
    mockNotificarProfesionalCancelacion(professionalId);
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [clearTimers, navigation, professionalId]);

  const goToPayment = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    allowExitRef.current = true;
    clearTimers();
    navigation.replace('PaymentRating', paymentParams);
  }, [clearTimers, navigation, paymentParams]);

  useEffect(() => {
    if (!datosValidos) {
      allowExitRef.current = true;
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    }
  }, [datosValidos, navigation]);

  const runServicioInterval = useCallback(() => {
    if (intervalIdRef.current) return;

    intervalIdRef.current = setInterval(() => {
      if (alertOpenRef.current) return;

      servicioElapsedRef.current += MOCK_SERVICIO_TICK_MS;
      const t = Math.min(1, servicioElapsedRef.current / MOCK_SERVICIO_MS);
      setProgressServicio(t);

      if (t >= 1) {
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
          intervalIdRef.current = null;
        }
        setCompletedSteps(3);
        setFase('finalizado');
        schedule(() => {
          goToPayment();
        }, MOCK_FINAL_MS);
      }
    }, MOCK_SERVICIO_TICK_MS);
  }, [goToPayment, schedule]);

  const onPinValidadoMock = useCallback(() => {
    setPinValidado(true);
    setCompletedSteps(2);
    setFase('servicio');
    runServicioInterval();
  }, [runServicioInterval]);

  const startSimulation = useCallback(() => {
    clearTimers();
    servicioElapsedRef.current = 0;
    setFase('llegada');
    setCompletedSteps(0);
    setProgressServicio(0);
    setPinValidado(false);

    schedule(() => {
      setCompletedSteps(1);
      setFase('esperandoPin');
      schedule(() => {
        onPinValidadoMock();
      }, MOCK_PIN_INGRESO_MS);
    }, MOCK_LLEGADA_MS);
  }, [clearTimers, onPinValidadoMock, schedule]);

  const startSimulationRef = useRef(startSimulation);
  startSimulationRef.current = startSimulation;

  useEffect(() => {
    if (!datosValidos) return;
    startSimulation();
    return () => clearTimers();
  }, [datosValidos, startSimulation, clearTimers]);

  const showCancelarServicioAlert = useCallback(() => {
    clearTimers();
    promptCancelarServicio({
      alertVisibleRef: alertOpenRef,
      onContinuar: () => {
        if (!pinValidadoRef.current) {
          startSimulationRef.current();
        }
      },
      onConfirmCancel: resetToHome,
    });
  }, [clearTimers, resetToHome]);

  const handleBackBlocked = useCallback(() => {
    alertServicioEnCurso(alertOpenRef);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current) return;
      e.preventDefault();
      if (!pinValidadoRef.current) {
        showCancelarServicioAlert();
      } else {
        handleBackBlocked();
      }
    });
    return unsubscribe;
  }, [navigation, showCancelarServicioAlert, handleBackBlocked]);

  if (!datosValidos || !professional || !servicio) {
    return null;
  }

  const duracionLabel = `${servicio.duracionMin} min`;
  const showPin = fase === 'esperandoPin';
  const showEsperandoProfesional = fase === 'esperandoPin';
  const showProgress = fase === 'servicio' || (fase === 'finalizado' && progressServicio > 0);
  const progressPct = Math.round(progressServicio * 100);
  const pinDigits = pinServicio.split('');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <MaterialCommunityIcons name="timer-outline" size={56} color={colors.honeyLight} />

        <Text style={styles.title}>{servicio.nombre}</Text>
        <Text style={styles.subtitle}>Duración acordada: {duracionLabel}</Text>

        {showPin ? (
          <View style={styles.pinBlock}>
            <Text style={styles.pinHeading}>Código para iniciar</Text>
            <View
              style={styles.pinDigitsRow}
              accessible
              accessibilityRole="text"
              accessibilityLabel={pinAccessibilityLabel(pinServicio)}
            >
              {pinDigits.map((digit, index) => (
                <Text key={`${index}-${digit}`} style={styles.pinDigit}>
                  {digit}
                </Text>
              ))}
            </View>
            <Text style={styles.pinHint}>
              Comparte este código con tu profesional para que inicie el servicio.
            </Text>
            {showEsperandoProfesional ? (
              <Text style={styles.pinWaiting}>
                Esperando que el profesional ingrese el código
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.pinSpacer} />
        )}

        {showProgress ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{progressPct}%</Text>
          </View>
        ) : (
          <View style={styles.progressSpacer} />
        )}

        <View style={styles.checklist}>
          {CHECKLIST_LABELS.map((label, index) => {
            const done = completedSteps > index;
            return (
              <View key={label} style={styles.checkRow}>
                <MaterialCommunityIcons
                  name={done ? 'check-circle' : 'circle-outline'}
                  size={22}
                  color={done ? colors.honey : colors.textOnNavyMuted}
                />
                <Text style={[styles.checkText, done && styles.checkTextDone]}>{label}</Text>
              </View>
            );
          })}
        </View>

        {!pinValidado ? (
          <TouchableOpacity style={styles.cancelButton} onPress={showCancelarServicioAlert}>
            <Text style={styles.cancelButtonText}>Cancelar servicio</Text>
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
  title: {
    ...typography.heading,
    color: colors.textOnNavy,
    fontSize: 20,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textOnNavyMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  pinBlock: {
    alignSelf: 'stretch',
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  pinSpacer: {
    height: 8,
    marginBottom: spacing.md,
  },
  pinHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textOnNavyMuted,
    marginBottom: spacing.sm,
  },
  pinDigitsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  pinDigit: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.honey,
    letterSpacing: 2,
    minWidth: 36,
    textAlign: 'center',
  },
  pinHint: {
    fontSize: 13,
    color: colors.textOnNavyMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.sm,
  },
  pinWaiting: {
    fontSize: 14,
    color: colors.textOnNavy,
    textAlign: 'center',
    marginTop: spacing.md,
    fontWeight: '500',
  },
  progressBlock: {
    alignSelf: 'stretch',
    marginBottom: spacing.xl,
  },
  progressSpacer: {
    height: 24,
    marginBottom: spacing.lg,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.navyLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.honey,
    borderRadius: radius.full,
  },
  progressLabel: {
    fontSize: 13,
    color: colors.textOnNavyMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
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
  cancelButton: {
    alignSelf: 'stretch',
    marginTop: 'auto',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.textOnNavyMuted,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...typography.button,
    color: colors.textOnNavy,
  },
});
