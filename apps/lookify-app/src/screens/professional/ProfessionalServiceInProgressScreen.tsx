// App Profesional — pantalla 9: Servicio en curso (ruta: ProfessionalServiceInProgressPlaceholder).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfessionalStackParamList } from '../../navigation/ProfessionalStackNavigator';
import { resetProfessionalSession } from '../../navigation/professionalNavigation';
import BackHeader from '../../components/BackHeader';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import { colors, radius, spacing, typography } from '../../theme/colors';
import { getProfessionalServiceInProgressService } from '../../services/professionalServiceInProgressService';
import { ServiceError } from '../../services/errors';
import {
  ETIQUETA_ETAPA_SERVICIO,
  MOTIVOS_CANCELACION_PROFESIONAL,
  PIN_SERVICIO_LENGTH,
} from '../../constants/professionalServiceInProgress';
import { ProfessionalSessionRouteParams } from '../../types/professionalAuth';
import {
  EtapaServicioEnCurso,
  MotivoCancelacionProfesional,
  ProfessionalServiceInProgressRouteParams,
  ServicioEnCurso,
} from '../../types/professionalServiceInProgress';
import { formatCOP } from '../../utils/pricing';
import { useLiveLocation } from '../../hooks/useLiveLocation';
import { emitBookingLocation } from '../../lib/backend/realtime';

type Props = NativeStackScreenProps<
  ProfessionalStackParamList,
  'ProfessionalServiceInProgressPlaceholder'
>;

function sesionParaPanel(params: ProfessionalServiceInProgressRouteParams): ProfessionalSessionRouteParams {
  const sesion: ProfessionalSessionRouteParams = {
    profesionalId: params.profesionalId,
    nombre: params.nombre,
    email: params.email,
    estadoSolicitud: params.estadoSolicitud,
  };
  if (params.solicitudId !== undefined) sesion.solicitudId = params.solicitudId;
  if (params.onboardingPaso !== undefined) sesion.onboardingPaso = params.onboardingPaso;
  if (params.servicioIds !== undefined) sesion.servicioIds = params.servicioIds;
  return sesion;
}

function formatReloj(ms: number): string {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const horas = Math.floor(totalSeg / 3600);
  const minutos = Math.floor((totalSeg % 3600) / 60);
  const segundos = totalSeg % 60;
  const mm = String(minutos).padStart(2, '0');
  const ss = String(segundos).padStart(2, '0');
  if (horas > 0) return `${horas}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function mensajeError(error: unknown): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'NETWORK':
        return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
      case 'ETAPA_NO_PERMITE_ACCION':
        return 'Esa acción no está disponible en este momento del servicio.';
      case 'VALIDATION':
        return 'Revisa los datos e inténtalo de nuevo.';
      default:
        return 'No pudimos completar la acción. Inténtalo de nuevo.';
    }
  }
  return 'No pudimos completar la acción. Inténtalo de nuevo.';
}

export default function ProfessionalServiceInProgressScreen({ navigation, route }: Props) {
  const {
    profesionalId,
    solicitudEntranteId,
    solicitudId,
    nombre,
    email,
    estadoSolicitud,
    onboardingPaso,
    servicioIds,
    abrirMotivosCancelacion,
  } = route.params;
  const permitirSalida = useRef(false);
  const alertaAbierta = useRef(false);
  const accionEnCurso = useRef(false);
  const etapaRef = useRef<EtapaServicioEnCurso | null>(null);
  const eligiendoMotivoRef = useRef(false);
  const loadErrorRef = useRef<string | null>(null);
  const motivosAutoAbiertos = useRef(false);

  const [servicio, setServicio] = useState<ServicioEnCurso | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinDemo, setPinDemo] = useState<string | null>(null);
  const [eligiendoMotivo, setEligiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState<MotivoCancelacionProfesional | null>(null);
  const [desfaseMs, setDesfaseMs] = useState(0);
  const [tickNow, setTickNow] = useState(() => Date.now());

  useEffect(() => {
    etapaRef.current = servicio?.etapa ?? null;
    eligiendoMotivoRef.current = eligiendoMotivo;
    loadErrorRef.current = loadError;
  }, [servicio?.etapa, eligiendoMotivo, loadError]);

  const aplicarReloj = useCallback((ahoraServidor: number) => {
    setDesfaseMs(ahoraServidor - Date.now());
    setTickNow(Date.now());
  }, []);

  const volverAlPanel = useCallback(() => {
    permitirSalida.current = true;
    navigation.navigate(
      'ProfessionalDashboardPlaceholder',
      sesionParaPanel({
        profesionalId,
        solicitudEntranteId,
        solicitudId,
        nombre,
        email,
        estadoSolicitud,
        onboardingPaso,
        servicioIds,
      })
    );
  }, [
    email,
    estadoSolicitud,
    navigation,
    nombre,
    onboardingPaso,
    profesionalId,
    servicioIds,
    solicitudEntranteId,
    solicitudId,
  ]);

  const cargar = useCallback(async () => {
    if (!profesionalId || !solicitudEntranteId) {
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalLogin');
      return;
    }
    setLoadError(null);
    try {
      const res = await getProfessionalServiceInProgressService().obtenerServicioActivo({
        profesionalId,
      });
      aplicarReloj(res.ahoraServidor);
      if (!res.servicio || res.servicio.id !== solicitudEntranteId) {
        volverAlPanel();
        return;
      }
      setServicio(res.servicio);
    } catch (error) {
      if (
        error instanceof ServiceError &&
        (error.code === 'PROFESIONAL_NO_HABILITADO' || error.code === 'VALIDATION')
      ) {
        permitirSalida.current = true;
        resetProfessionalSession(navigation, 'ProfessionalLogin');
        return;
      }
      setLoadError(mensajeError(error));
      setServicio(null);
    }
  }, [aplicarReloj, navigation, profesionalId, solicitudEntranteId, volverAlPanel]);

  useEffect(() => {
    const id = setTimeout(() => {
      cargar().finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(id);
  }, [cargar]);

  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void cargar();
      }
    });
    return () => listener.remove();
  }, [cargar]);

  const servicioId = servicio?.id;
  const enCamino = servicio?.etapa === 'EN_CAMINO';

  // 4C-2: mientras va en camino comparte GPS en primer plano (5 s / 15 m).
  // El servidor solo lo acepta en 'accepted' y lo corta al iniciar/finalizar.
  const {
    location: gpsLocation,
    error: gpsError,
    permission: gpsPermission,
  } = useLiveLocation(Boolean(enCamino), { timeInterval: 5000, distanceInterval: 15 });

  useEffect(() => {
    if (!enCamino || !servicioId || !gpsLocation) return;
    emitBookingLocation(servicioId, gpsLocation.latitude, gpsLocation.longitude);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCamino, servicioId, gpsLocation?.latitude, gpsLocation?.longitude]);

  useEffect(() => {
    if (!__DEV__ || !servicioId || !profesionalId) {
      return;
    }
    let cancelado = false;
    void getProfessionalServiceInProgressService()
      .obtenerPinDemo({
        profesionalId,
        servicioId,
      })
      .then((res) => {
        if (!cancelado) setPinDemo(res.pin);
      })
      .catch(() => {
        if (!cancelado) setPinDemo(null);
      });
    return () => {
      cancelado = true;
    };
  }, [profesionalId, servicioId]);

  useEffect(() => {
    if (!abrirMotivosCancelacion || !servicio || motivosAutoAbiertos.current) return;
    if (servicio.etapa === 'EN_CAMINO' || servicio.etapa === 'LLEGUE') {
      const id = setTimeout(() => {
        motivosAutoAbiertos.current = true;
        setMotivo(null);
        setEligiendoMotivo(true);
        navigation.setParams({ abrirMotivosCancelacion: false });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [abrirMotivosCancelacion, navigation, servicio]);

  const mostrarAlertaYaEmpezo = useCallback(() => {
    if (alertaAbierta.current) return;
    alertaAbierta.current = true;
    Alert.alert(
      'El servicio ya empezó',
      undefined,
      [{ text: 'Entendido', onPress: () => { alertaAbierta.current = false; } }],
      { cancelable: true, onDismiss: () => { alertaAbierta.current = false; } }
    );
  }, []);

  const mostrarAlertaCancelar = useCallback(() => {
    if (alertaAbierta.current) return;
    alertaAbierta.current = true;
    Alert.alert(
      '¿Cancelar este servicio?',
      'El cliente no pagará y se buscará otro profesional.',
      [
        { text: 'Seguir', style: 'cancel', onPress: () => { alertaAbierta.current = false; } },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: () => {
            alertaAbierta.current = false;
            setMotivo(null);
            setEligiendoMotivo(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => { alertaAbierta.current = false; } }
    );
  }, []);

  const solicitarSalida = useCallback(() => {
    if (permitirSalida.current) return;
    if (eligiendoMotivoRef.current) {
      setEligiendoMotivo(false);
      return;
    }
    const etapa = etapaRef.current;
    if (etapa === 'INICIADO') {
      mostrarAlertaYaEmpezo();
      return;
    }
    if (etapa === 'EN_CAMINO' || etapa === 'LLEGUE') {
      mostrarAlertaCancelar();
      return;
    }
    if (loadErrorRef.current) {
      volverAlPanel();
    }
  }, [mostrarAlertaCancelar, mostrarAlertaYaEmpezo, volverAlPanel]);

  useEffect(() => {
    const onBack = () => {
      if (permitirSalida.current) return false;
      solicitarSalida();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [solicitarSalida]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (permitirSalida.current) return;
      e.preventDefault();
      solicitarSalida();
    });
    return unsubscribe;
  }, [navigation, solicitarSalida]);

  const horaServidor = tickNow + desfaseMs;
  const bloqueoRestanteMs =
    servicio?.bloqueadoHasta != null ? servicio.bloqueadoHasta - horaServidor : 0;
  const pinBloqueado = bloqueoRestanteMs > 0;
  const transcurridoMs =
    servicio?.iniciadoEn != null ? Math.max(0, horaServidor - servicio.iniciadoEn) : 0;

  const ejecutarLlegada = async () => {
    if (!servicio || accionEnCurso.current) return;
    accionEnCurso.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const res = await getProfessionalServiceInProgressService().marcarLlegada({
        profesionalId,
        servicioId: servicio.id,
      });
      aplicarReloj(res.ahoraServidor);
      setServicio(res.servicio);
    } catch (error) {
      setActionError(mensajeError(error));
    } finally {
      accionEnCurso.current = false;
      setBusy(false);
    }
  };

  const ejecutarPin = async () => {
    if (!servicio || accionEnCurso.current || pinBloqueado) return;
    if (!new RegExp(`^\\d{${PIN_SERVICIO_LENGTH}}$`).test(pin)) return;
    accionEnCurso.current = true;
    setBusy(true);
    setActionError(null);
    setPinError(null);
    try {
      const res = await getProfessionalServiceInProgressService().validarPin({
        profesionalId,
        servicioId: servicio.id,
        pin,
      });
      aplicarReloj(res.ahoraServidor);
      setServicio(res.servicio);
      setPin('');
      if (res.resultado === 'INVALIDO') {
        const n = res.intentosRestantes;
        setPinError(
          `Código incorrecto. Te quedan ${n} ${n === 1 ? 'intento' : 'intentos'}.`
        );
      }
    } catch (error) {
      setActionError(mensajeError(error));
    } finally {
      accionEnCurso.current = false;
      setBusy(false);
    }
  };

  const ejecutarCancelacion = async () => {
    if (!servicio || !motivo || accionEnCurso.current) return;
    accionEnCurso.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const res = await getProfessionalServiceInProgressService().cancelarPorProfesional({
        profesionalId,
        servicioId: servicio.id,
        motivo,
      });
      aplicarReloj(res.ahoraServidor);
      volverAlPanel();
    } catch (error) {
      setActionError(mensajeError(error));
    } finally {
      accionEnCurso.current = false;
      setBusy(false);
    }
  };

  const confirmarMotivo = () => {
    if (!motivo) return;
    const etiqueta = MOTIVOS_CANCELACION_PROFESIONAL.find((item) => item.codigo === motivo)?.etiqueta;
    Alert.alert(
      'Confirmar cancelación',
      `Motivo: ${etiqueta ?? ''}. El cliente no pagará y se buscará otro profesional.`,
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: () => void ejecutarCancelacion() },
      ]
    );
  };

  const confirmarFinalizar = () => {
    Alert.alert('¿Finalizar el servicio?', 'Seguirás ocupado hasta que tú te pongas disponible.', [
      { text: 'Seguir', style: 'cancel' },
      { text: 'Finalizar', style: 'destructive', onPress: () => void ejecutarFinalizar() },
    ]);
  };

  const ejecutarFinalizar = async () => {
    if (!servicio || accionEnCurso.current) return;
    accionEnCurso.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const res = await getProfessionalServiceInProgressService().finalizarServicio({
        profesionalId,
        servicioId: servicio.id,
      });
      aplicarReloj(res.ahoraServidor);
      volverAlPanel();
    } catch (error) {
      setActionError(mensajeError(error));
    } finally {
      accionEnCurso.current = false;
      setBusy(false);
    }
  };

  const abrirMapa = () => {
    if (!servicio) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(servicio.direccionExacta)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Mapa', 'No pudimos abrir el mapa en este celular.');
    });
  };

  const quitarBloqueoDemo = async () => {
    if (!__DEV__ || !servicio || accionEnCurso.current) return;
    accionEnCurso.current = true;
    setBusy(true);
    try {
      const res = await getProfessionalServiceInProgressService().expirarBloqueoPinDemo({
        profesionalId,
        servicioId: servicio.id,
      });
      aplicarReloj(res.ahoraServidor);
      setServicio(res.servicio);
      setPin('');
      setPinError(null);
    } catch (error) {
      setActionError(mensajeError(error));
    } finally {
      accionEnCurso.current = false;
      setBusy(false);
    }
  };

  const irAlPanelDemo = () => {
    if (!__DEV__) return;
    volverAlPanel();
  };

  const muestraDireccion = servicio?.etapa === 'EN_CAMINO' || servicio?.etapa === 'LLEGUE';

  return (
    <SafeAreaView style={styles.container}>
      <BackHeader title="Servicio en curso" onBack={solicitarSalida} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Button label="Reintentar" onPress={() => void cargar()} />
        </View>
      ) : servicio ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pill}>
              <Text style={styles.pillText}>{ETIQUETA_ETAPA_SERVICIO[servicio.etapa]}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.serviceName}>{servicio.servicioNombre}</Text>
              <Text style={styles.meta}>Duración estimada: {servicio.duracionMin} min</Text>
              <Text style={styles.clientLabel}>Cliente</Text>
              <Text style={styles.clientName}>{servicio.clientePrimerNombre}</Text>

              {muestraDireccion ? (
                <View style={styles.addressBlock}>
                  <Text style={styles.clientLabel}>Dirección</Text>
                  <Text style={styles.address}>{servicio.direccionExacta}</Text>
                  <Button label="Abrir en el mapa" variant="outline" onPress={abrirMapa} />
                </View>
              ) : null}

              {enCamino ? (
                <View style={styles.gpsBox}>
                  <Text style={styles.gpsText}>
                    {gpsPermission === 'denied'
                      ? 'Activa el permiso de ubicación para compartir tu ruta con el cliente.'
                      : gpsError
                        ? gpsError
                        : gpsLocation
                          ? 'Compartiendo tu ubicación en vivo. Mantén la app abierta.'
                          : 'Obteniendo tu ubicación…'}
                  </Text>
                </View>
              ) : null}

              <View style={styles.priceBlock}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Precio base</Text>
                  <Text style={styles.priceValue}>{formatCOP(servicio.desglose.precioBaseCop)}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Domicilio</Text>
                  <Text style={styles.priceValue}>{formatCOP(servicio.desglose.precioDomicilioCop)}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatCOP(servicio.desglose.precioTotalCop)}</Text>
                </View>
              </View>
            </View>

            {servicio.etapa === 'INICIADO' ? (
              <View style={styles.timerCard}>
                <Text style={styles.timerCaption}>Tiempo del servicio</Text>
                <Text style={styles.timer}>{formatReloj(transcurridoMs)}</Text>
              </View>
            ) : null}

            {servicio.etapa === 'LLEGUE' && !eligiendoMotivo ? (
              <View style={styles.card}>
                <Text style={styles.pinHint}>Pide al cliente su código de 4 dígitos.</Text>
                <TextField
                  label="Código del cliente"
                  value={pin}
                  onChangeText={(texto) => {
                    setPin(texto.replace(/\D/g, '').slice(0, PIN_SERVICIO_LENGTH));
                    setPinError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={PIN_SERVICIO_LENGTH}
                  editable={!pinBloqueado && !busy}
                  error={pinError ?? undefined}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {pinBloqueado ? (
                  <Text style={styles.blockText}>
                    Podrás intentar de nuevo en {formatReloj(bloqueoRestanteMs)}.
                  </Text>
                ) : null}
                <Button
                  label="Iniciar servicio"
                  variant="accent"
                  onPress={() => void ejecutarPin()}
                  disabled={pin.length !== PIN_SERVICIO_LENGTH || pinBloqueado}
                  loading={busy}
                />
              </View>
            ) : null}

            {eligiendoMotivo ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>¿Por qué cancelas?</Text>
                {MOTIVOS_CANCELACION_PROFESIONAL.map((item) => {
                  const selected = motivo === item.codigo;
                  return (
                    <Pressable
                      key={item.codigo}
                      onPress={() => setMotivo(item.codigo)}
                      style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.radio, selected && styles.radioSelected]} />
                      <Text style={styles.reasonLabel}>{item.etiqueta}</Text>
                    </Pressable>
                  );
                })}
                <Button
                  label="Confirmar cancelación"
                  variant="accent"
                  onPress={confirmarMotivo}
                  disabled={motivo == null}
                  loading={busy}
                />
              </View>
            ) : null}

            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

            {!eligiendoMotivo && servicio.etapa === 'EN_CAMINO' ? (
              <Button
                label="Ya llegué"
                variant="accent"
                onPress={() => void ejecutarLlegada()}
                loading={busy}
              />
            ) : null}

            {!eligiendoMotivo && servicio.etapa === 'INICIADO' ? (
              <Button
                label="Finalizar servicio"
                variant="accent"
                onPress={confirmarFinalizar}
                loading={busy}
              />
            ) : null}

            {!eligiendoMotivo &&
            (servicio.etapa === 'EN_CAMINO' || servicio.etapa === 'LLEGUE') ? (
              <Button label="Cancelar servicio" variant="outline" onPress={mostrarAlertaCancelar} />
            ) : null}

            {__DEV__ ? (
              <View style={styles.demoBox}>
                <Text style={styles.demoTitle}>DEMO</Text>
                {pinDemo ? <Text style={styles.demoPin}>PIN del cliente: {pinDemo}</Text> : null}
                {pinBloqueado ? (
                  <Button
                    label="DEMO — Quitar bloqueo"
                    variant="outline"
                    onPress={() => void quitarBloqueoDemo()}
                    loading={busy}
                  />
                ) : null}
                <Button label="DEMO — Ir al panel" variant="outline" onPress={irAlPanelDemo} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.beige,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 3,
    gap: spacing.md,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.honey,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillText: {
    color: colors.navy,
    fontWeight: '700',
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  serviceName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.navy,
  },
  meta: {
    ...typography.body,
    color: colors.textSecondary,
  },
  clientLabel: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.navy,
  },
  addressBlock: {
    gap: spacing.sm,
  },
  address: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  gpsBox: {
    backgroundColor: colors.beige,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  gpsText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  priceBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  priceLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  timerCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  timerCaption: {
    color: colors.textOnNavyMuted,
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  timer: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 1,
  },
  pinHint: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  blockText: {
    color: colors.error,
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonRowSelected: {
    borderColor: colors.honey,
    backgroundColor: colors.beige,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.navy,
  },
  radioSelected: {
    backgroundColor: colors.honey,
    borderColor: colors.honey,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  demoBox: {
    borderWidth: 1,
    borderColor: colors.honey,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
  },
  demoTitle: {
    fontWeight: '700',
    color: colors.honey,
    fontSize: 13,
  },
  demoPin: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
});
