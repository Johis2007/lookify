// App Profesional — pantalla 5: Estado de verificación (ruta: …VerificationPlaceholder).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  BackHandler,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ACTIVACION_CODE_LENGTH } from '../../constants/professionalActivation';
import {
  MSG_BLOQUEO_TEMPORAL,
  MSG_CODIGO_GENERICO,
  MSG_REENVIO_COOLDOWN,
  MSG_REENVIOS_AGOTADOS,
  MSG_SOPORTE_SIN_SALIDA,
} from '../../constants/verificationMessages';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import { BACKEND } from '../../lib/backend/config';
import { colors, radius, spacing, typography } from '../../theme/colors';
import { ProfessionalStackParamList } from '../../navigation/ProfessionalStackNavigator';
import { resetProfessionalSession } from '../../navigation/professionalNavigation';
import { getCatalogService } from '../../services/catalogService';
import { getProfessionalVerificationService } from '../../services/professionalVerificationService';
import { ServiceError } from '../../services/errors';
import { EstadoVerificacionResponse } from '../../types/professionalVerification';

type Props = NativeStackScreenProps<
  ProfessionalStackParamList,
  'ProfessionalVerificationPlaceholder'
>;

function formatRestanteMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}:${sec.toString().padStart(2, '0')}`;
  return `${sec} s`;
}

function mensajeError(error: unknown): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'CODIGO_EXPIRADO':
        return MSG_CODIGO_GENERICO;
      case 'CODIGO_INVALIDO':
        return MSG_CODIGO_GENERICO;
      case 'BLOQUEO_TEMPORAL':
      case 'DEMASIADOS_INTENTOS':
        return MSG_BLOQUEO_TEMPORAL;
      case 'REENVIO_NO_DISPONIBLE':
        return MSG_REENVIO_COOLDOWN;
      case 'REENVIOS_AGOTADOS':
        return MSG_REENVIOS_AGOTADOS;
      case 'NETWORK':
        return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
      default:
        return 'No pudimos completar la acción. Inténtalo de nuevo.';
    }
  }
  return 'No pudimos completar la acción. Inténtalo de nuevo.';
}

export default function ProfessionalVerificationScreen({ navigation, route }: Props) {
  const params = route.params;
  const permitirSalida = useRef(false);
  const [estado, setEstado] = useState<EstadoVerificacionResponse | null>(null);
  const [nombresServicios, setNombresServicios] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [corregiendo, setCorregiendo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [activando, setActivando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const [demoCodigoVisible, setDemoCodigoVisible] = useState<string | null>(null);

  const confirmarCerrarSesion = useCallback(() => {
    Alert.alert(
      '¿Cerrar sesión?',
      'Perderás el progreso de este paso si sales.',
      [
        { text: 'Seguir aquí', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: () => {
            permitirSalida.current = true;
            resetProfessionalSession(navigation, 'ProfessionalLogin');
          },
        },
      ],
      { cancelable: true }
    );
  }, [navigation]);

  const cargarEstado = useCallback(async () => {
    if (!params.solicitudId) {
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalLogin');
      return;
    }
    setLoadError(false);
    try {
      const data = await getProfessionalVerificationService().obtenerEstadoVerificacion({
        solicitudId: params.solicitudId,
      });
      setEstado(data);
      if (__DEV__ && data.codigoActivacionDemo) {
        setDemoCodigoVisible(data.codigoActivacionDemo);
      }
      const catalogo = await getCatalogService().listarServiciosPorCategoria();
      const map: Record<string, string> = {};
      for (const cat of catalogo) {
        for (const s of cat.servicios) {
          map[s.id] = s.nombre;
        }
      }
      setNombresServicios(map);
      setTickNow(Date.now());
    } catch {
      setLoadError(true);
    }
  }, [navigation, params.solicitudId]);

  useEffect(() => {
    const id = setTimeout(() => {
      cargarEstado().finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(id);
  }, [cargarEstado]);

  useEffect(() => {
    const onBack = () => {
      confirmarCerrarSesion();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [confirmarCerrarSesion]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (permitirSalida.current) return;
      e.preventDefault();
      confirmarCerrarSesion();
    });
    return unsubscribe;
  }, [navigation, confirmarCerrarSesion]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        setTickNow(Date.now());
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, []);

  const handleActualizar = async () => {
    if (!params.solicitudId || refreshing) return;
    setRefreshing(true);
    setActionError(null);
    try {
      const data = await getProfessionalVerificationService().actualizarEstadoVerificacion({
        solicitudId: params.solicitudId,
      });
      setEstado(data);
      if (__DEV__ && data.codigoActivacionDemo) {
        setDemoCodigoVisible(data.codigoActivacionDemo);
      }
      setTickNow(Date.now());
    } catch (error) {
      setActionError(mensajeError(error));
    } finally {
      setRefreshing(false);
    }
  };

  const handleCorregir = async () => {
    if (!params.solicitudId || corregiendo) return;
    setCorregiendo(true);
    setActionError(null);
    try {
      const result = await getProfessionalVerificationService().iniciarCorreccionCertificados({
        solicitudId: params.solicitudId,
      });
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalCertificateUploadPlaceholder', {
        profesionalId: result.profesionalId,
        solicitudId: result.solicitudId,
        nombre: result.nombre,
        email: result.email,
        estadoSolicitud: result.estadoSolicitud,
        onboardingPaso: result.onboardingPaso,
        servicioIds: result.servicioIds,
      });
    } catch (error) {
      setActionError(mensajeError(error));
    } finally {
      setCorregiendo(false);
    }
  };

  const handleReenviar = async () => {
    if (!params.solicitudId || reenviando) return;
    setReenviando(true);
    setActionError(null);
    try {
      const res = await getProfessionalVerificationService().reenviarCodigoActivacion({
        solicitudId: params.solicitudId,
      });
      await cargarEstado();
      if (__DEV__ && res.codigoActivacionDemo) {
        setDemoCodigoVisible(res.codigoActivacionDemo);
      }
    } catch (error) {
      setActionError(mensajeError(error));
    } finally {
      setReenviando(false);
    }
  };

  const handleActivar = async () => {
    if (!params.solicitudId || activando) return;
    setActivando(true);
    setActionError(null);
    try {
      const result = await getProfessionalVerificationService().validarCodigoActivacion({
        solicitudId: params.solicitudId,
        codigo,
      });
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalDashboardPlaceholder', {
        profesionalId: result.profesionalId,
        solicitudId: result.solicitudId,
        nombre: result.nombre,
        email: result.email,
        estadoSolicitud: result.estadoSolicitud,
      });
    } catch (error) {
      setActionError(mensajeError(error));
      await cargarEstado();
    } finally {
      setActivando(false);
    }
  };

  const simularAdmin = async (decision: 'APROBAR' | 'RECHAZAR') => {
    if (!params.solicitudId || !__DEV__) return;
    try {
      const data = await getProfessionalVerificationService().simularDecisionAdministrador({
        solicitudId: params.solicitudId,
        decision,
        motivoRechazo:
          decision === 'RECHAZAR'
            ? 'Certificado vencido o ilegible. Sube documentos actualizados.'
            : undefined,
        serviciosAfectadosIds: decision === 'RECHAZAR' ? ['bar-2'] : undefined,
      });
      setEstado(data);
      if (__DEV__ && data.codigoActivacionDemo) {
        setDemoCodigoVisible(data.codigoActivacionDemo);
      }
      setTickNow(Date.now());
    } catch (error) {
      setActionError(mensajeError(error));
    }
  };

  const expirarDemo = async () => {
    if (!params.solicitudId || !__DEV__) return;
    try {
      const data = await getProfessionalVerificationService().expirarCodigoActivacionDemo({
        solicitudId: params.solicitudId,
      });
      setEstado(data);
      setTickNow(Date.now());
    } catch (error) {
      setActionError(mensajeError(error));
    }
  };

  const activacion = estado?.activacion;
  const bloqueadoMs =
    activacion?.bloqueadoHastaMs != null
      ? activacion.bloqueadoHastaMs - tickNow
      : 0;
  const reenvioEsperaMs =
    activacion?.reenvioDisponibleEnMs != null
      ? activacion.reenvioDisponibleEnMs - tickNow
      : 0;
  const sinSalida = activacion?.sinSalidaActivacion === true;
  const puedeReenviar =
    !sinSalida &&
    (activacion?.reenviosRestantes ?? 0) > 0 &&
    bloqueadoMs <= 0 &&
    reenvioEsperaMs <= 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Image source={require('../../../assets/logo-lookify.png')} style={styles.logo} />
        <Text style={styles.title}>Estado de verificación</Text>
        <TouchableOpacity onPress={confirmarCerrarSesion} activeOpacity={0.8}>
          <Text style={styles.logoutLink}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : loadError || !estado ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>No pudimos cargar tu estado.</Text>
            <Button
              label="Reintentar"
              onPress={() => {
                setLoading(true);
                cargarEstado().finally(() => setLoading(false));
              }}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {estado.estadoSolicitud === 'EN_REVISION' ? (
              <>
                <Text style={styles.lead}>
                  Nuestro equipo está revisando tus documentos. Te avisaremos cuando haya novedades.
                </Text>
                {estado.resumen ? (
                  <View style={styles.card}>
                    <Text style={styles.cardLine}>
                      Certificados enviados: {estado.resumen.cantidadCertificados}
                    </Text>
                    <Text style={styles.cardLine}>
                      Servicios en tu solicitud: {estado.resumen.cantidadServicios}
                    </Text>
                  </View>
                ) : null}
                <Button
                  label="Actualizar estado"
                  onPress={handleActualizar}
                  loading={refreshing}
                  disabled={refreshing}
                />
              </>
            ) : null}

            {estado.estadoSolicitud === 'RECHAZADO' && estado.rechazo ? (
              <>
                <Text style={styles.lead}>Tu solicitud necesita ajustes antes de continuar.</Text>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Motivo</Text>
                  <Text style={styles.cardBody}>{estado.rechazo.motivo}</Text>
                  {estado.rechazo.serviciosAfectadosIds.length > 0 ? (
                    <>
                      <Text style={[styles.cardTitle, styles.cardTitleSpaced]}>Servicios afectados</Text>
                      {estado.rechazo.serviciosAfectadosIds.map((id) => (
                        <Text key={id} style={styles.cardLine}>
                          • {nombresServicios[id] ?? id}
                        </Text>
                      ))}
                    </>
                  ) : null}
                </View>
                <Button
                  label="Corregir certificados"
                  onPress={handleCorregir}
                  loading={corregiendo}
                  disabled={corregiendo}
                />
              </>
            ) : null}

            {estado.estadoSolicitud === 'APROBADO' && !estado.profesionalActivado ? (
              <>
                <Text style={styles.lead}>
                  ¡Bienvenido a Lookify PRO! Ingresa el código de 6 dígitos que enviamos a{' '}
                  {estado.emailEnmascarado} para activar tu cuenta.
                </Text>
                {__DEV__ && demoCodigoVisible ? (
                  <View style={styles.demoBox}>
                    <Text style={styles.demoBadge}>DEMO</Text>
                    <Text style={styles.demoText}>
                      Código de activación (solo desarrollo): {demoCodigoVisible}
                    </Text>
                  </View>
                ) : null}
                {sinSalida ? (
                  <View style={styles.cardWarn}>
                    <Text style={styles.cardBody}>{MSG_SOPORTE_SIN_SALIDA}</Text>
                  </View>
                ) : (
                  <>
                    <TextField
                      label="Código de activación"
                      value={codigo}
                      onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, ACTIVACION_CODE_LENGTH))}
                      keyboardType="number-pad"
                      maxLength={ACTIVACION_CODE_LENGTH}
                      editable={bloqueadoMs <= 0 && !activacion?.codigoExpirado}
                      accessibilityLabel="Código de activación de 6 dígitos"
                    />
                    {bloqueadoMs > 0 ? (
                      <Text style={styles.hint}>
                        Intentos bloqueados. Vuelve en {formatRestanteMs(bloqueadoMs)}.
                      </Text>
                    ) : null}
                    {activacion?.codigoExpirado && !sinSalida ? (
                      <Text style={styles.hint}>El código expiró. Solicita uno nuevo.</Text>
                    ) : null}
                    <Button
                      label="Activar cuenta"
                      onPress={handleActivar}
                      loading={activando}
                      disabled={
                        activando ||
                        codigo.length !== ACTIVACION_CODE_LENGTH ||
                        bloqueadoMs > 0 ||
                        activacion?.codigoExpirado === true
                      }
                    />
                    <Button
                      label={
                        reenvioEsperaMs > 0
                          ? `Reenviar código (${formatRestanteMs(reenvioEsperaMs)})`
                          : 'Reenviar código'
                      }
                      variant="outline"
                      onPress={handleReenviar}
                      loading={reenviando}
                      disabled={!puedeReenviar || reenviando}
                    />
                    <Text style={styles.hint}>
                      Reenvíos restantes: {activacion?.reenviosRestantes ?? 0}
                    </Text>
                  </>
                )}
              </>
            ) : null}

            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

            {/* DEMO solo en mocks: en backend decide el admin real. */}
            {__DEV__ && !BACKEND.enabled ? (
              <View style={styles.demoPanel}>
                <Text style={styles.demoBadge}>DEMO — simular admin</Text>
                <View style={styles.demoRow}>
                  <Button label="Aprobar" variant="outline" onPress={() => simularAdmin('APROBAR')} />
                  <Button label="Rechazar" variant="outline" onPress={() => simularAdmin('RECHAZAR')} />
                </View>
                <Button label="Expirar código" variant="outline" onPress={expirarDemo} />
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  logo: { width: 96, height: 96, marginBottom: spacing.sm, resizeMode: 'contain' },
  title: { fontSize: 18, fontWeight: '600', color: colors.white, textAlign: 'center' },
  logoutLink: {
    marginTop: spacing.md,
    fontSize: 13,
    color: colors.honey,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  body: {
    flex: 1,
    backgroundColor: colors.beige,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  centered: { flex: 1, justifyContent: 'center', padding: spacing.lg, alignItems: 'center' },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.md, textAlign: 'center' },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  lead: { fontSize: 15, color: colors.textPrimary, lineHeight: 22, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardWarn: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.navy },
  cardTitleSpaced: { marginTop: spacing.md },
  cardBody: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  cardLine: { fontSize: 14, color: colors.textPrimary, marginTop: spacing.xs },
  hint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  actionError: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  demoPanel: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  demoBox: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.honey,
  },
  demoBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: spacing.sm,
  },
  demoText: { fontSize: 13, color: colors.textSecondary },
  demoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
});
