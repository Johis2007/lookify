// Pantalla 6: búsqueda simulada de profesional disponible.

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

type Props = NativeStackScreenProps<RootStackParamList, 'Matching'>;

const MOCK_STEP_MS = 1500;

const CHECKLIST_LABELS = [
  'Solicitud enviada',
  (radioKm: number) => `Buscando profesionales a ${radioKm} km`,
  'Profesional confirmó disponibilidad',
] as const;

export default function MatchingScreen({ navigation, route }: Props) {
  const params = route.params;
  const { categoriaId, servicioId, radioKm, rejectionCount, rejectedIds, categoriaNombre } =
    params;

  const [completedSteps, setCompletedSteps] = useState(0);
  const [showSpecialOptions, setShowSpecialOptions] = useState(false);

  const allowExitRef = useRef(false);
  const alertOpenRef = useRef(false);
  const completedStepsRef = useRef(0);
  const timerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scanning = !showSpecialOptions;

  useEffect(() => {
    completedStepsRef.current = completedSteps;
  }, [completedSteps]);

  const clearTimers = useCallback(() => {
    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];
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

  const showCancelAlert = useCallback(
    (onConfirmExit: () => void) => {
      promptCancelarSolicitud({
        alertVisibleRef: alertOpenRef,
        onBeforeShow: clearTimers,
        onSeguirBuscando: () => {
          if (!showSpecialOptions) {
            runSimulationRef.current(completedStepsRef.current);
          }
        },
        onConfirmCancel: onConfirmExit,
      });
    },
    [clearTimers, showSpecialOptions]
  );

  useEffect(() => {
    runSimulation(0);
    return () => clearTimers();
  }, [runSimulation, clearTimers]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current) return;
      e.preventDefault();
      showCancelAlert(resetToHome);
    });
    return unsubscribe;
  }, [navigation, showCancelAlert, resetToHome]);

  const handleCancelPress = () => {
    showCancelAlert(resetToHome);
  };

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
    });
  };

  const noMoreProsMessage =
    radioKm === 6
      ? 'No hay más profesionales disponibles en un radio de 6 km.'
      : undefined;

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
                  : `Buscando a ${radioKm} km`
            }
          />
        </View>

        {!showSpecialOptions ? (
          <View style={styles.checklist}>
            {CHECKLIST_LABELS.map((label, index) => {
              const text = typeof label === 'function' ? label(radioKm) : label;
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
            {rejectionCount >= 3 ? (
              <Text style={styles.specialTitle}>Límite de rechazos alcanzado</Text>
            ) : (
              <Text style={styles.specialTitle}>No encontramos profesionales disponibles</Text>
            )}
            {noMoreProsMessage ? (
              <Text style={styles.specialBody}>{noMoreProsMessage}</Text>
            ) : null}
            {radioKm === 3 ? (
              <Button
                label="Ampliar radio a 6 km"
                onPress={handleExpandRadio}
                variant="accent"
                style={styles.actionButton}
              />
            ) : null}
            <TouchableOpacity style={styles.outlineButton} onPress={handleCancelPress}>
              <Text style={styles.outlineButtonText}>Cancelar sin costo</Text>
            </TouchableOpacity>
          </View>
        )}

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
