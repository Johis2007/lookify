// App Profesional — pantalla 8: Solicitud entrante.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  BackHandler,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../../theme/colors';
import Button from '../../components/Button';
import StarRating from '../../components/StarRating';
import BackHeader from '../../components/BackHeader';
import { BACKEND } from '../../lib/backend/config';
import { ProfessionalStackParamList } from '../../navigation/ProfessionalStackNavigator';
import { resetProfessionalSession } from '../../navigation/professionalNavigation';
import { getProfessionalIncomingRequestService } from '../../services/professionalIncomingRequestService';
import { ServiceError } from '../../services/errors';
import { SolicitudEntrante } from '../../types/professionalIncomingRequest';
import { SOLICITUD_ENTRANTE_ALERT_RECHAZAR_TITULO } from '../../constants/professionalIncomingRequest';
import { formatCOP } from '../../utils/pricing';
import { redondearDistanciaKm } from '../../utils/geo';

type Props = NativeStackScreenProps<ProfessionalStackParamList, 'ProfessionalIncomingRequest'>;

function formatRestanteSeg(expiraEn: number, now: number): string {
  const ms = Math.max(0, expiraEn - now);
  const sec = Math.ceil(ms / 1000);
  return `${sec} s`;
}

function mensajeTerminal(estado: SolicitudEntrante['estado']): string {
  switch (estado) {
    case 'CERRADA_EXPIRADA':
      return 'La solicitud expiró. Sigue disponible para nuevas ofertas.';
    case 'CERRADA_RECHAZADA_CLIENTE':
      return 'El cliente eligió otro profesional. Sigue disponible.';
    case 'CERRADA_RECHAZADA_PRO':
      return 'Rechazaste esta solicitud.';
    case 'CERRADA_YA_ASIGNADA':
      return 'Esta solicitud ya no está disponible.';
    default:
      return 'Esta solicitud ya no está disponible.';
  }
}

export default function ProfessionalIncomingRequestScreen({ navigation, route }: Props) {
  const params = route.params;
  const permitirSalida = useRef(false);
  const expiracionEnviada = useRef(false);
  const accionEnCurso = useRef(false);

  const [solicitud, setSolicitud] = useState<SolicitudEntrante | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [tickNow, setTickNow] = useState(Date.now());

  const cargar = useCallback(async () => {
    if (!params.profesionalId || !params.solicitudEntranteId) {
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalLogin');
      return;
    }
    try {
      const s = await getProfessionalIncomingRequestService().obtenerSolicitud({
        profesionalId: params.profesionalId,
        solicitudEntranteId: params.solicitudEntranteId,
      });
      setSolicitud(s);
    } catch {
      setSolicitud(null);
    }
  }, [navigation, params.profesionalId, params.solicitudEntranteId]);

  useEffect(() => {
    setLoading(true);
    cargar().finally(() => setLoading(false));
  }, [cargar]);

  useEffect(() => {
    if (!params.profesionalId) {
      return;
    }
    const svc = getProfessionalIncomingRequestService();
    const unsub = svc.suscribirseASolicitudesEntrantes({ profesionalId: params.profesionalId }, (ev) => {
      if (ev.solicitud.id !== params.solicitudEntranteId) {
        return;
      }
      setSolicitud({ ...ev.solicitud });
      if (ev.solicitud.estado === 'LISTA_PARA_SERVICIO') {
        permitirSalida.current = true;
        navigation.replace('ProfessionalServiceInProgressPlaceholder', {
          profesionalId: params.profesionalId,
          solicitudId: params.solicitudId,
          nombre: params.nombre,
          email: params.email,
          estadoSolicitud: params.estadoSolicitud,
          onboardingPaso: params.onboardingPaso,
          servicioIds: params.servicioIds,
          solicitudEntranteId: params.solicitudEntranteId,
        });
      }
    });
    return unsub;
  }, [navigation, params]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        setTickNow(Date.now());
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!solicitud || solicitud.estado !== 'PENDIENTE_PRO') {
      return;
    }
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [solicitud?.estado, solicitud?.id]);

  useEffect(() => {
    if (!solicitud || solicitud.estado !== 'PENDIENTE_PRO') {
      return;
    }
    const restante = solicitud.expiraEn - tickNow;
    if (restante > 0 || expiracionEnviada.current) {
      return;
    }
    expiracionEnviada.current = true;
    void (async () => {
      try {
        const res = await getProfessionalIncomingRequestService().procesarExpiracion({
          profesionalId: params.profesionalId,
          solicitudEntranteId: params.solicitudEntranteId,
        });
        if (res.solicitud) {
          setSolicitud(res.solicitud);
        } else {
          await cargar();
        }
      } catch {
        await cargar();
      }
    })();
  }, [tickNow, solicitud, params.profesionalId, params.solicitudEntranteId, cargar]);

  const volverOrigen = useCallback(() => {
    permitirSalida.current = true;
    navigation.goBack();
  }, [navigation]);

  const ejecutarRechazo = useCallback(async () => {
    if (accionEnCurso.current) {
      return;
    }
    accionEnCurso.current = true;
    setBusy(true);
    setErrorAccion(null);
    try {
      await getProfessionalIncomingRequestService().rechazarSolicitud({
        profesionalId: params.profesionalId,
        solicitudEntranteId: params.solicitudEntranteId,
      });
      volverOrigen();
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'SOLICITUD_ENTRANTE_NO_ENCONTRADA') {
        volverOrigen();
        return;
      }
      setErrorAccion('No pudimos rechazar la solicitud. Inténtalo de nuevo.');
    } finally {
      accionEnCurso.current = false;
      setBusy(false);
    }
  }, [params.profesionalId, params.solicitudEntranteId, volverOrigen]);

  const confirmarRechazo = useCallback(() => {
    Alert.alert(SOLICITUD_ENTRANTE_ALERT_RECHAZAR_TITULO, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: () => void ejecutarRechazo() },
    ]);
  }, [ejecutarRechazo]);

  useEffect(() => {
    const onBack = () => {
      if (permitirSalida.current) {
        return false;
      }
      if (
        solicitud?.estado === 'PENDIENTE_PRO' ||
        solicitud?.estado === 'ESPERANDO_CLIENTE'
      ) {
        confirmarRechazo();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [confirmarRechazo, solicitud?.estado]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (permitirSalida.current) {
        return;
      }
      if (
        solicitud?.estado !== 'PENDIENTE_PRO' &&
        solicitud?.estado !== 'ESPERANDO_CLIENTE'
      ) {
        return;
      }
      e.preventDefault();
      confirmarRechazo();
    });
    return unsubscribe;
  }, [navigation, confirmarRechazo, solicitud?.estado]);

  const handleAceptar = async () => {
    if (accionEnCurso.current || busy) {
      return;
    }
    accionEnCurso.current = true;
    setBusy(true);
    setErrorAccion(null);
    try {
      const res = await getProfessionalIncomingRequestService().aceptarSolicitud({
        profesionalId: params.profesionalId,
        solicitudEntranteId: params.solicitudEntranteId,
      });
      if (res.solicitud) {
        setSolicitud(res.solicitud);
      }
      if (res.resultado === 'EXPIRADA') {
        expiracionEnviada.current = true;
      }
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.code === 'SOLICITUD_NO_VIGENTE' || error.code === 'SOLICITUD_ENTRANTE_NO_ENCONTRADA') {
          await cargar();
        } else {
          setErrorAccion('No pudimos aceptar la solicitud. Inténtalo de nuevo.');
        }
      } else {
        setErrorAccion('No pudimos aceptar la solicitud. Inténtalo de nuevo.');
      }
    } finally {
      accionEnCurso.current = false;
      setBusy(false);
    }
  };

  const handleRechazar = () => {
    confirmarRechazo();
  };

  const demoClienteAcepta = () => {
    void (async () => {
      try {
        await getProfessionalIncomingRequestService().simularClienteAcepta({
          profesionalId: params.profesionalId,
          solicitudEntranteId: params.solicitudEntranteId,
        });
      } catch {
        setErrorAccion('No pudimos simular la respuesta del cliente.');
      }
    })();
  };

  const demoClienteRechaza = () => {
    void (async () => {
      try {
        await getProfessionalIncomingRequestService().simularClienteRechaza({
          profesionalId: params.profesionalId,
          solicitudEntranteId: params.solicitudEntranteId,
        });
      } catch {
        setErrorAccion('No pudimos simular la respuesta del cliente.');
      }
    })();
  };

  const demoExpirar = () => {
    void (async () => {
      try {
        await getProfessionalIncomingRequestService().simularExpiracionSolicitud({
          profesionalId: params.profesionalId,
          solicitudEntranteId: params.solicitudEntranteId,
        });
      } catch {
        setErrorAccion('No pudimos simular la expiración.');
      }
    })();
  };

  const esPendiente = solicitud?.estado === 'PENDIENTE_PRO';
  const esEsperaCliente = solicitud?.estado === 'ESPERANDO_CLIENTE';
  const esTerminal =
    solicitud != null &&
    !esPendiente &&
    !esEsperaCliente &&
    solicitud.estado !== 'LISTA_PARA_SERVICIO';

  const restanteLabel =
    solicitud && esPendiente ? formatRestanteSeg(solicitud.expiraEn, tickNow) : null;

  const distanciaLabel =
    solicitud != null ? redondearDistanciaKm(solicitud.distanciaKmAprox).toFixed(1) : '';

  return (
    <SafeAreaView style={styles.container}>
      <BackHeader
        title="Nueva solicitud"
        onBack={
          esPendiente || esEsperaCliente
            ? confirmarRechazo
            : () => {
                volverOrigen();
              }
        }
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : !solicitud ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>No encontramos esta solicitud.</Text>
          <Button label="Volver" onPress={volverOrigen} style={styles.actionButton} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {esPendiente && restanteLabel ? (
            <View style={styles.timerCard}>
              <Text style={styles.timerLabel}>Tiempo para responder</Text>
              <Text style={styles.timerValue}>{restanteLabel}</Text>
            </View>
          ) : null}

          {esEsperaCliente ? (
            <View style={styles.waitCard}>
              <ActivityIndicator color={colors.navy} style={styles.waitSpinner} />
              <Text style={styles.waitTitle}>Esperando respuesta del cliente</Text>
              <Text style={styles.waitHint}>
                Si el cliente confirma, pasarás al servicio. Si no, volverás a estar listo para
                nuevas solicitudes.
              </Text>
            </View>
          ) : null}

          {esTerminal ? (
            <View style={styles.terminalCard}>
              <Text style={styles.terminalText}>{mensajeTerminal(solicitud.estado)}</Text>
              <Button label="Volver al panel" onPress={volverOrigen} style={styles.actionButton} />
            </View>
          ) : null}

          {!esTerminal ? (
            <View style={styles.card}>
              <Text style={styles.serviceName}>{solicitud.servicioNombre}</Text>
              <Text style={styles.meta}>
                {solicitud.duracionMin} min · ~{distanciaLabel} km
              </Text>

              <Text style={styles.sectionLabel}>Cliente</Text>
              <Text style={styles.clientName}>{solicitud.clientePrimerNombre}</Text>
              {solicitud.clienteTotalResenas > 0 && solicitud.clienteCalificacionPromedio != null ? (
                <View style={styles.ratingRow}>
                  <StarRating
                    value={Math.round(solicitud.clienteCalificacionPromedio)}
                    readOnly
                    size={18}
                  />
                  <Text style={styles.ratingMeta}>
                    {solicitud.clienteCalificacionPromedio.toFixed(1)} ·{' '}
                    {solicitud.clienteTotalResenas} reseñas
                  </Text>
                </View>
              ) : (
                <Text style={styles.sinResenas}>Sin reseñas aún</Text>
              )}

              <Text style={styles.sectionLabel}>Precio</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Precio base</Text>
                <Text style={styles.priceValue}>{formatCOP(solicitud.desglose.precioBaseCop)}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Domicilio (~{distanciaLabel} km)</Text>
                <Text style={styles.priceValue}>
                  {formatCOP(solicitud.desglose.precioDomicilioCop)}
                </Text>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>Total</Text>
                <Text style={styles.priceTotalValue}>
                  {formatCOP(solicitud.desglose.precioTotalCop)}
                </Text>
              </View>
            </View>
          ) : null}

          {errorAccion ? <Text style={styles.inlineError}>{errorAccion}</Text> : null}

          {esPendiente ? (
            <>
              <Button
                label="Aceptar"
                variant="accent"
                onPress={handleAceptar}
                loading={busy}
                disabled={busy}
              />
              <Button
                label="Rechazar"
                variant="outline"
                onPress={handleRechazar}
                disabled={busy}
                style={styles.actionButton}
              />
            </>
          ) : null}

          {/* DEMO solo en mocks: en backend no hay actor cliente simulado. */}
          {__DEV__ && !BACKEND.enabled && esEsperaCliente ? (
            <View style={styles.demoBlock}>
              <Text style={styles.demoTitle}>DEMO — respuesta del cliente</Text>
              <Button label="Cliente acepta" onPress={demoClienteAcepta} variant="outline" />
              <Button
                label="Cliente rechaza"
                onPress={demoClienteRechaza}
                variant="outline"
                style={styles.actionButton}
              />
              <Button label="Expirar solicitud" onPress={demoExpirar} variant="outline" />
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.beige,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  timerCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  timerLabel: {
    color: colors.white,
    fontSize: 14,
    opacity: 0.9,
  },
  timerValue: {
    color: colors.honey,
    fontSize: 36,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  waitCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  waitSpinner: {
    marginBottom: spacing.sm,
  },
  waitTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.navy,
    textAlign: 'center',
  },
  waitHint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  terminalCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  terminalText: {
    ...typography.body,
    color: colors.navy,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.honey,
  },
  serviceName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.navy,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.navy,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  ratingMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sinResenas: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  priceLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: 15,
    color: colors.navy,
    fontWeight: '500',
  },
  priceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  priceTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
  },
  priceTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  inlineError: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  actionButton: {
    marginTop: spacing.sm,
  },
  demoBlock: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  demoTitle: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.navy,
  },
});
