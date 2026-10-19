// App Profesional — pantalla 6: Panel principal (ruta stack: ProfessionalDashboardPlaceholder; deuda de nombre).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  BackHandler,
  Switch,
  Pressable,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { colors, radius, spacing, typography } from '../../theme/colors';
import Button from '../../components/Button';
import StarRating from '../../components/StarRating';
import { BACKEND } from '../../lib/backend/config';
import { ProfessionalStackParamList } from '../../navigation/ProfessionalStackNavigator';
import { resetProfessionalSession } from '../../navigation/professionalNavigation';
import { getProfessionalDashboardService } from '../../services/professionalDashboardService';
import { getProfessionalIncomingRequestService } from '../../services/professionalIncomingRequestService';
import { getProfessionalServiceInProgressService } from '../../services/professionalServiceInProgressService';
import { ServiceError } from '../../services/errors';
import { PanelPrincipalResponse } from '../../types/professionalDashboard';
import { esEtapaServicioActiva, ServicioEnCurso } from '../../types/professionalServiceInProgress';
import { ETIQUETA_ETAPA_SERVICIO } from '../../constants/professionalServiceInProgress';
import { FOTO_PERFIL_IMAGE_PICKER_QUALITY } from '../../constants/professionalProfilePhoto';
import { formatCOP } from '../../utils/pricing';

type Props = NativeStackScreenProps<
  ProfessionalStackParamList,
  'ProfessionalDashboardPlaceholder'
>;

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function mensajeErrorPanel(error: unknown): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'NETWORK':
        return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
      case 'SOLICITUD_NO_ENCONTRADA':
      case 'VALIDATION':
        return 'No pudimos cargar tu panel. Vuelve a iniciar sesión.';
      default:
        return 'No pudimos cargar tu panel. Inténtalo de nuevo.';
    }
  }
  return 'No pudimos cargar tu panel. Inténtalo de nuevo.';
}

function mensajeErrorFoto(error: unknown): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'ARCHIVO_MUY_GRANDE':
        return 'La imagen supera el límite de 5 MB.';
      case 'ARCHIVO_INVALIDO':
        return 'Imagen no válida. Usa JPG o PNG (máx. 5 MB).';
      default:
        return 'No pudimos actualizar tu foto. Inténtalo de nuevo.';
    }
  }
  return 'No pudimos actualizar tu foto. Inténtalo de nuevo.';
}

function alertPermisoUbicacionDenegado(): void {
  Alert.alert(
    'Ubicación necesaria',
    'Para aparecer como disponible necesitamos tu permiso de ubicación en primer plano. Actívalo en Ajustes.',
    [
      { text: 'Entendido', style: 'cancel' },
      { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
    ]
  );
}

function alertPermisoMedios(tipo: 'galería' | 'cámara'): void {
  const msg =
    tipo === 'galería'
      ? 'Necesitamos acceso a tus fotos para cambiar tu foto de perfil. Actívalo en Ajustes.'
      : 'Necesitamos usar la cámara para tu foto de perfil. Actívalo en Ajustes.';
  Alert.alert('Permiso necesario', msg, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
  ]);
}

export default function ProfessionalDashboardScreen({ navigation, route }: Props) {
  const params = route.params;
  const permitirSalida = useRef(false);
  const togglingDisponibilidad = useRef(false);
  const subiendoFoto = useRef(false);

  const [panel, setPanel] = useState<PanelPrincipalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [fotoBusy, setFotoBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [solicitudEntranteActiva, setSolicitudEntranteActiva] = useState(false);
  const [servicioActivo, setServicioActivo] = useState<ServicioEnCurso | null>(null);
  const servicioActivoRef = useRef<ServicioEnCurso | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  servicioActivoRef.current = servicioActivo;

  const refrescarSolicitudActiva = useCallback(async () => {
    if (!params.profesionalId) {
      setSolicitudEntranteActiva(false);
      return;
    }
    try {
      const activa = await getProfessionalIncomingRequestService().obtenerSolicitudActiva({
        profesionalId: params.profesionalId,
      });
      const vigente =
        activa != null &&
        (activa.estado === 'PENDIENTE_PRO' || activa.estado === 'ESPERANDO_CLIENTE');
      setSolicitudEntranteActiva(vigente);
    } catch {
      setSolicitudEntranteActiva(false);
    }
  }, [params.profesionalId]);

  const refrescarServicioActivo = useCallback(async () => {
    if (!params.profesionalId) {
      setServicioActivo(null);
      return;
    }
    try {
      const res = await getProfessionalServiceInProgressService().obtenerServicioActivo({
        profesionalId: params.profesionalId,
      });
      const activo =
        res.servicio && esEtapaServicioActiva(res.servicio.etapa) ? res.servicio : null;
      setServicioActivo(activo);
    } catch {
      setServicioActivo(null);
    }
  }, [params.profesionalId]);

  const ejecutarCierreSesion = useCallback(async () => {
    const activo = servicioActivoRef.current;
    if (activo && esEtapaServicioActiva(activo.etapa)) {
      return;
    }
    permitirSalida.current = true;
    try {
      await getProfessionalIncomingRequestService().alCerrarSesion({
        profesionalId: params.profesionalId,
      });
      await getProfessionalDashboardService().registrarCierreSesion({
        profesionalId: params.profesionalId,
      });
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'SERVICIO_EN_CURSO_ACTIVO') {
        permitirSalida.current = false;
        return;
      }
    }
    resetProfessionalSession(navigation, 'ProfessionalLogin');
  }, [navigation, params.profesionalId]);

  const confirmarCerrarSesion = useCallback(() => {
    void (async () => {
    let activo = servicioActivoRef.current;
    if (params.profesionalId) {
      try {
        const res = await getProfessionalServiceInProgressService().obtenerServicioActivo({
          profesionalId: params.profesionalId,
        });
        activo = res.servicio && esEtapaServicioActiva(res.servicio.etapa) ? res.servicio : null;
        setServicioActivo(activo);
      } catch {
        activo = servicioActivoRef.current;
      }
    }
    if (activo && (activo.etapa === 'EN_CAMINO' || activo.etapa === 'LLEGUE')) {
      Alert.alert(
        '¿Cancelar este servicio?',
        'El cliente no pagará y se buscará otro profesional.',
        [
          { text: 'Seguir', style: 'cancel' },
          {
            text: 'Cancelar',
            style: 'destructive',
            onPress: () => {
              navigation.navigate('ProfessionalServiceInProgressPlaceholder', {
                ...params,
                solicitudEntranteId: activo.id,
                abrirMotivosCancelacion: true,
              });
            },
          },
        ]
      );
      return;
    }
    if (activo && activo.etapa === 'INICIADO') {
      Alert.alert('El servicio ya empezó', undefined, [{ text: 'Entendido' }]);
      return;
    }
    Alert.alert(
      '¿Cerrar sesión?',
      undefined,
      [
        { text: 'Seguir aquí', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: () => ejecutarCierreSesion() },
      ],
      { cancelable: true }
    );
    })();
  }, [ejecutarCierreSesion, navigation, params]);

  const cargarPanel = useCallback(async () => {
    if (!params.profesionalId || !params.solicitudId) {
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalLogin');
      return;
    }
    setLoadError(false);
    try {
      const data = await getProfessionalDashboardService().obtenerPanelPrincipal({
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId,
      });
      setPanel(data);
    } catch {
      setLoadError(true);
      setPanel(null);
    }
  }, [navigation, params.profesionalId, params.solicitudId]);

  useEffect(() => {
    setLoading(true);
    cargarPanel().finally(() => setLoading(false));
  }, [cargarPanel]);

  useFocusEffect(
    useCallback(() => {
      void refrescarSolicitudActiva();
      void refrescarServicioActivo();
      void cargarPanel();
    }, [refrescarSolicitudActiva, refrescarServicioActivo, cargarPanel])
  );

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

  const handleToggleDisponibilidad = async (quiereDisponible: boolean) => {
    if (toggleBusy || togglingDisponibilidad.current || !panel || !params.solicitudId) return;

    if (!quiereDisponible) {
      togglingDisponibilidad.current = true;
      setToggleBusy(true);
      setToggleError(null);
      try {
        const res = await getProfessionalDashboardService().cambiarDisponibilidad({
          profesionalId: params.profesionalId,
          solicitudId: params.solicitudId,
          disponibilidad: 'OCUPADO',
        });
        setPanel((prev) => (prev ? { ...prev, disponibilidad: res.disponibilidad } : prev));
      } catch {
        setToggleError('No pudimos actualizar tu estado. Inténtalo de nuevo.');
      } finally {
        togglingDisponibilidad.current = false;
        setToggleBusy(false);
      }
      return;
    }

    togglingDisponibilidad.current = true;
    setToggleBusy(true);
    setToggleError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        alertPermisoUbicacionDenegado();
        return;
      }

      const res = await getProfessionalDashboardService().cambiarDisponibilidad({
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId,
        disponibilidad: 'DISPONIBLE',
      });
      setPanel((prev) => (prev ? { ...prev, disponibilidad: res.disponibilidad } : prev));
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'PROFESIONAL_NO_HABILITADO') {
        setToggleError('Tu cuenta aún no está habilitada para recibir solicitudes.');
      } else if (error instanceof ServiceError && error.code === 'SERVICIO_EN_CURSO_ACTIVO') {
        setToggleError('Termina o cancela el servicio en curso antes de ponerte disponible.');
      } else {
        setToggleError('No pudimos actualizar tu estado. Inténtalo de nuevo.');
      }
    } finally {
      togglingDisponibilidad.current = false;
      setToggleBusy(false);
    }
  };

  const subirFoto = async (uri: string, mimeType: string, sizeBytes?: number) => {
    if (subiendoFoto.current) return;
    subiendoFoto.current = true;
    setFotoBusy(true);
    setFotoError(null);
    try {
      const res = await getProfessionalDashboardService().actualizarFotoPerfil({
        profesionalId: params.profesionalId,
        archivo: { uri, mimeType, sizeBytes },
      });
      setPanel((prev) => (prev ? { ...prev, fotoPerfil: res.fotoPerfil } : prev));
    } catch (error) {
      setFotoError(mensajeErrorFoto(error));
    } finally {
      subiendoFoto.current = false;
      setFotoBusy(false);
    }
  };

  const pickGaleria = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alertPermisoMedios('galería');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: FOTO_PERFIL_IMAGE_PICKER_QUALITY,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await subirFoto(asset.uri, asset.mimeType ?? 'image/jpeg', asset.fileSize);
  };

  const pickCamara = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      alertPermisoMedios('cámara');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: FOTO_PERFIL_IMAGE_PICKER_QUALITY,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await subirFoto(asset.uri, asset.mimeType ?? 'image/jpeg', asset.fileSize);
  };

  const handleCambiarFoto = () => {
    if (fotoBusy) return;
    Alert.alert('Cambiar foto', 'Elige una opción', [
      { text: 'Galería', onPress: () => pickGaleria() },
      { text: 'Cámara', onPress: () => pickCamara() },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handlePortafolio = () => {
    navigation.navigate('ProfessionalPortfolioPlaceholder', params);
  };

  const handleDemoSolicitudEntrante = async () => {
    if (demoBusy || !params.solicitudId) {
      return;
    }
    setDemoBusy(true);
    try {
      await getProfessionalIncomingRequestService().simularSolicitudEntrante({
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId,
      });
      await refrescarSolicitudActiva();
    } catch {
      Alert.alert('Demo', 'No se pudo simular la solicitud. Debes estar disponible.');
    } finally {
      setDemoBusy(false);
    }
  };

  const disponible = panel?.disponibilidad === 'DISPONIBLE';
  const demoSolicitudDeshabilitado =
    !disponible || solicitudEntranteActiva || demoBusy || !params.solicitudId;
  const tieneResenas = (panel?.totalResenas ?? 0) > 0;

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{mensajeErrorPanel(undefined)}</Text>
          <Button label="Reintentar" onPress={cargarPanel} style={styles.retryButton} />
        </View>
      ) : panel ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileRow}>
            <View style={styles.avatarWrap}>
              {panel.fotoPerfil ? (
                <Image source={{ uri: panel.fotoPerfil.uri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{iniciales(panel.nombre)}</Text>
                </View>
              )}
              {fotoBusy ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={colors.white} />
                </View>
              ) : null}
            </View>
            <View style={styles.profileText}>
              <Text style={styles.profileName}>{panel.nombre}</Text>
              {tieneResenas && panel.calificacionPromedio != null ? (
                <View style={styles.ratingRow}>
                  <StarRating value={panel.calificacionPromedio} readOnly size={18} />
                  <Text style={styles.ratingMeta}>
                    {panel.calificacionPromedio.toFixed(1)} · {panel.totalResenas}{' '}
                    {panel.totalResenas === 1 ? 'reseña' : 'reseñas'}
                  </Text>
                </View>
              ) : null}
              <Pressable
                onPress={handleCambiarFoto}
                disabled={fotoBusy}
                style={styles.cambiarFotoBtn}
                accessibilityRole="button"
                accessibilityLabel="Cambiar foto de perfil"
              >
                <Text style={styles.cambiarFotoText}>Cambiar foto</Text>
              </Pressable>
              {fotoError ? <Text style={styles.inlineError}>{fotoError}</Text> : null}
            </View>
          </View>

          <View style={[styles.card, disponible ? styles.cardDisponible : styles.cardOcupado]}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabels}>
                <Text style={styles.toggleTitle}>
                  {disponible ? 'Disponible' : 'Ocupado'}
                </Text>
                <Text style={styles.toggleHint}>
                  {servicioActivo
                    ? 'Tienes un servicio en curso. Termínalo o cancélalo para poder ponerte disponible.'
                    : disponible
                      ? 'Puedes recibir solicitudes de clientes'
                      : 'No recibirás nuevas solicitudes'}
                </Text>
              </View>
              <Switch
                value={disponible}
                onValueChange={handleToggleDisponibilidad}
                disabled={toggleBusy}
                trackColor={{ false: colors.textSecondary, true: colors.honey }}
                thumbColor={colors.white}
                accessibilityRole="switch"
                accessibilityLabel="Disponible u ocupado"
                accessibilityState={{ checked: disponible, busy: toggleBusy }}
              />
            </View>
            {toggleBusy ? (
              <ActivityIndicator style={styles.toggleSpinner} color={colors.navy} />
            ) : null}
            {toggleError ? <Text style={styles.inlineError}>{toggleError}</Text> : null}
          </View>

          {servicioActivo ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Tienes un servicio en curso</Text>
              <Text style={styles.serviceName}>{servicioActivo.servicioNombre}</Text>
              <Text style={styles.serviceMeta}>{ETIQUETA_ETAPA_SERVICIO[servicioActivo.etapa]}</Text>
              <Button
                label="Continuar servicio"
                onPress={() =>
                  navigation.navigate('ProfessionalServiceInProgressPlaceholder', {
                    ...params,
                    solicitudEntranteId: servicioActivo.id,
                  })
                }
              />
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Resumen del día</Text>
            {__DEV__ && panel.resumenDia.muestraEtiquetaDatosEjemplo ? (
              <Text style={styles.mockBadge}>Datos de ejemplo</Text>
            ) : null}
            <Text style={styles.statLine}>
              Servicios realizados:{' '}
              <Text style={styles.statValue}>{panel.resumenDia.serviciosRealizados}</Text>
            </Text>
            <Text style={styles.statLine}>
              Ingresos:{' '}
              <Text style={styles.statValue}>{formatCOP(panel.resumenDia.ingresosCop)}</Text>
            </Text>
            <Button
              label="Mis ingresos"
              variant="outline"
              onPress={() => navigation.navigate('ProfessionalEarningsHistory', params)}
              style={styles.ingresosButton}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Mis calificaciones</Text>
            {tieneResenas ? (
              <>
                <Text style={styles.resenasResumen}>
                  Promedio {panel.calificacionPromedio?.toFixed(1)} · {panel.totalResenas}{' '}
                  {panel.totalResenas === 1 ? 'reseña' : 'reseñas'}
                </Text>
                {panel.ultimasResenas.map((r, idx) => (
                  <View key={`${r.autor}-${idx}`} style={styles.reviewItem}>
                    <Text style={styles.reviewAuthor}>{r.autor}</Text>
                    <StarRating value={r.estrellas} readOnly size={16} />
                    <Text style={styles.reviewBody}>{r.texto}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.emptyText}>Todavía no tienes reseñas</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Mis servicios</Text>
            {panel.serviciosOfrecidos.length === 0 ? (
              <>
                <Text style={styles.emptyText}>
                  No encontramos servicios asociados a tu cuenta. Esto no debería ocurrir.
                </Text>
                <Button label="Reintentar" onPress={cargarPanel} variant="outline" />
              </>
            ) : (
              panel.serviciosOfrecidos.map((s) => (
                <View key={s.servicioId} style={styles.serviceRow}>
                  <Text style={styles.serviceName}>{s.nombre}</Text>
                  <Text style={styles.serviceMeta}>
                    {s.duracionMin} min · Precio base {formatCOP(s.precioBaseCop)}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* DEMO solo en mocks: en backend la solicitud llega por socket. */}
          {__DEV__ && !BACKEND.enabled ? (
            <Button
              label="DEMO — simular solicitud entrante"
              variant="outline"
              onPress={() => void handleDemoSolicitudEntrante()}
              disabled={demoSolicitudDeshabilitado}
              loading={demoBusy}
            />
          ) : null}

          <Button label="Mi portafolio" variant="outline" onPress={handlePortafolio} />
          <Button
            label="Cerrar sesión"
            variant="outline"
            onPress={confirmarCerrarSesion}
            style={styles.logoutButton}
          />
        </ScrollView>
      ) : null}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  errorText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    minWidth: 160,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: colors.navy,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: colors.textOnNavy,
    fontSize: 28,
    fontWeight: '600',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  ratingMeta: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cambiarFotoBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  cambiarFotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
    textDecorationLine: 'underline',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cardDisponible: {
    borderWidth: 2,
    borderColor: colors.honey,
  },
  cardOcupado: {
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleLabels: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.navy,
  },
  toggleHint: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  toggleSpinner: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: spacing.sm,
  },
  mockBadge: {
    ...typography.caption,
    alignSelf: 'flex-start',
    backgroundColor: colors.beige,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  statLine: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  resenasResumen: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  reviewItem: {
    marginBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.beige,
  },
  reviewAuthor: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: 4,
  },
  reviewBody: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  serviceRow: {
    marginBottom: spacing.md,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
  },
  serviceMeta: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inlineError: {
    fontSize: 13,
    color: colors.error,
    marginTop: spacing.xs,
  },
  logoutButton: {
    marginTop: spacing.sm,
  },
  ingresosButton: {
    marginTop: spacing.md,
  },
});
