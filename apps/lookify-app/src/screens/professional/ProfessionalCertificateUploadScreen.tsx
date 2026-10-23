// App Profesional — pantalla 4: Carga de certificados (ruta stack: …UploadPlaceholder).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Pressable,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker, {
  DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { colors, radius, spacing, typography } from '../../theme/colors';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import { ProfessionalStackParamList } from '../../navigation/ProfessionalStackNavigator';
import { resetProfessionalSession } from '../../navigation/professionalNavigation';
import { getCatalogService } from '../../services/catalogService';
import { getProfessionalCertificateService } from '../../services/professionalCertificateService';
import { getProfessionalVerificationService } from '../../services/professionalVerificationService';
import { ServiceError } from '../../services/errors';
import { CertificadoArchivoDescriptor, CertificadoProfesional } from '../../types/professionalCertificates';
import {
  CERTIFICADO_IMAGE_PICKER_QUALITY,
  CERTIFICADO_MAX_POR_SERVICIO,
} from '../../constants/certificateUpload';
import {
  contarCertificadosPorServicio,
  puedeAsignarServicio,
  serviciosSinCubrir,
} from '../../utils/certificateCoverage';
import {
  esMimeCertificadoPermitido,
  resolverSizeBytes,
  validarTamanoCertificado,
} from '../../utils/certificateFile';
import {
  certificadoFormularioValido,
  validarEntidadEmisoraCertificado,
  validarFechaEmisionCertificado,
  validarNombreTipoCertificado,
} from '../../utils/validators';
import { formatDateLocalISO } from '../../utils/formatDateLocalISO';

type Props = NativeStackScreenProps<
  ProfessionalStackParamList,
  'ProfessionalCertificateUploadPlaceholder'
>;

type ServicioInfo = { id: string; nombre: string; categoriaNombre: string };

function mensajeErrorServicio(error: unknown): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'ARCHIVO_MUY_GRANDE':
        return 'El archivo supera el límite de 5 MB.';
      case 'ARCHIVO_INVALIDO':
        return 'Archivo no válido. Usa JPG, PNG o PDF (máx. 5 MB).';
      case 'LIMITE_CERTIFICADOS_SERVICIO':
        return 'Un servicio ya tiene 3 certificados. Quita uno o edita un certificado existente.';
      case 'SERVICIO_SIN_CERTIFICADO':
        return 'Falta al menos un certificado por servicio antes de enviar.';
      case 'NETWORK':
        return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
      case 'SOLICITUD_NO_ENCONTRADA':
      case 'CERTIFICADO_NO_ENCONTRADO':
      case 'VALIDATION':
      case 'SERVICIO_INVALIDO':
        return 'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.';
      default:
        return 'Ocurrió un error. Inténtalo de nuevo.';
    }
  }
  return 'Ocurrió un error. Inténtalo de nuevo.';
}

function formatFechaLabel(date: Date | null): string {
  if (!date) return 'Fecha de emisión (opcional)';
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ProfessionalCertificateUploadScreen({ navigation, route }: Props) {
  const params = route.params;
  const permitirSalida = useRef(false);
  const modalAbierto = useRef(false);

  const [servicioIds, setServicioIds] = useState<string[]>([]);
  const [serviciosInfo, setServiciosInfo] = useState<ServicioInfo[]>([]);
  const [certificados, setCertificados] = useState<CertificadoProfesional[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombreTipo, setNombreTipo] = useState('');
  const [entidadEmisora, setEntidadEmisora] = useState('');
  const [fechaEmision, setFechaEmision] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedServicios, setSelectedServicios] = useState<Set<string>>(new Set());
  const [archivo, setArchivo] = useState<CertificadoArchivoDescriptor | null>(null);
  const [touched, setTouched] = useState({ nombre: false, entidad: false, fecha: false });
  const [modalError, setModalError] = useState<string | null>(null);
  const [savingModal, setSavingModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [motivoRechazoAviso, setMotivoRechazoAviso] = useState<string | null>(null);

  const counts = useMemo(
    () => contarCertificadosPorServicio(certificados, servicioIds),
    [certificados, servicioIds]
  );
  const faltantes = useMemo(() => serviciosSinCubrir(counts), [counts]);
  const puedeEnviar = faltantes.length === 0 && servicioIds.length > 0 && certificados.length > 0;

  const cerrarModal = useCallback(() => {
    modalAbierto.current = false;
    setModalVisible(false);
    setEditingId(null);
    setModalError(null);
  }, []);

  const modalTieneDatos = useCallback(() => {
    return (
      nombreTipo.trim().length > 0 ||
      entidadEmisora.trim().length > 0 ||
      fechaEmision !== null ||
      selectedServicios.size > 0 ||
      archivo !== null
    );
  }, [nombreTipo, entidadEmisora, fechaEmision, selectedServicios, archivo]);

  const confirmarCerrarModal = useCallback(() => {
    if (!modalTieneDatos()) {
      cerrarModal();
      return;
    }
    Alert.alert(
      '¿Descartar certificado?',
      'Perderás los datos que no hayas guardado.',
      [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: cerrarModal },
      ],
      { cancelable: true }
    );
  }, [cerrarModal, modalTieneDatos]);

  const confirmarCerrarSesion = useCallback(() => {
    Alert.alert(
      '¿Cerrar sesión?',
      'Perderás el progreso de este paso si sales.',
      [
        { text: 'Seguir cargando certificados', style: 'cancel' },
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

  const cargarDatos = useCallback(async () => {
    if (!params.solicitudId) {
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalLogin');
      return;
    }
    setLoadingInit(true);
    setLoadError(false);
    try {
      const certService = getProfessionalCertificateService();
      let ids = params.servicioIds?.length ? params.servicioIds : undefined;
      if (!ids?.length) {
        const res = await certService.obtenerServiciosDeSolicitud({
          solicitudId: params.solicitudId,
        });
        ids = res.servicioIds;
      }
      if (!ids.length) {
        permitirSalida.current = true;
        resetProfessionalSession(navigation, 'ProfessionalLogin');
        return;
      }
      setServicioIds(ids);
      const [certs, catalogo, aviso] = await Promise.all([
        certService.listarCertificados({ solicitudId: params.solicitudId }),
        getCatalogService().listarServiciosPorCategoria(),
        getProfessionalVerificationService().obtenerAvisoCorreccion({
          solicitudId: params.solicitudId,
        }),
      ]);
      setMotivoRechazoAviso(aviso.motivoRechazo);
      setCertificados(certs);
      const info: ServicioInfo[] = [];
      for (const cat of catalogo) {
        for (const s of cat.servicios) {
          if (ids.includes(s.id)) {
            info.push({ id: s.id, nombre: s.nombre, categoriaNombre: cat.categoriaNombre });
          }
        }
      }
      setServiciosInfo(info);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingInit(false);
    }
  }, [navigation, params.solicitudId, params.servicioIds]);

  useEffect(() => {
    const id = setTimeout(() => cargarDatos(), 0);
    return () => clearTimeout(id);
  }, [cargarDatos]);

  useEffect(() => {
    const onBack = () => {
      if (modalAbierto.current) {
        confirmarCerrarModal();
        return true;
      }
      confirmarCerrarSesion();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [confirmarCerrarModal, confirmarCerrarSesion]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (modalAbierto.current) {
        e.preventDefault();
        confirmarCerrarModal();
        return;
      }
      if (permitirSalida.current) return;
      e.preventDefault();
      confirmarCerrarSesion();
    });
    return unsubscribe;
  }, [navigation, confirmarCerrarModal, confirmarCerrarSesion]);

  const abrirModalNuevo = () => {
    setEditingId(null);
    setNombreTipo('');
    setEntidadEmisora('');
    setFechaEmision(null);
    setSelectedServicios(new Set());
    setArchivo(null);
    setTouched({ nombre: false, entidad: false, fecha: false });
    setModalError(null);
    modalAbierto.current = true;
    setModalVisible(true);
  };

  const abrirModalEditar = (cert: CertificadoProfesional) => {
    setEditingId(cert.id);
    setNombreTipo(cert.nombreTipo);
    setEntidadEmisora(cert.entidadEmisora);
    setFechaEmision(cert.fechaEmision ? new Date(`${cert.fechaEmision}T12:00:00`) : null);
    setSelectedServicios(new Set(cert.servicioIds));
    setArchivo({ ...cert.archivo });
    setTouched({ nombre: false, entidad: false, fecha: false });
    setModalError(null);
    modalAbierto.current = true;
    setModalVisible(true);
  };

  const procesarArchivo = async (
    uri: string,
    mimeType: string,
    fileName: string,
    sizeHint?: number
  ) => {
    if (!esMimeCertificadoPermitido(mimeType)) {
      setModalError('Formato no permitido. Usa JPG, PNG o PDF.');
      return;
    }
    const sizeBytes = await resolverSizeBytes(uri, sizeHint);
    const tam = validarTamanoCertificado(sizeBytes);
    if (tam === 'invalido') {
      setModalError('No pudimos verificar el tamaño del archivo. Elige otro archivo.');
      return;
    }
    if (tam === 'muy_grande') {
      setModalError('El archivo supera el límite de 5 MB.');
      return;
    }
    setArchivo({
      uri,
      mimeType,
      fileName,
      sizeBytes: sizeBytes!,
    });
    setModalError(null);
  };

  const pickGaleria = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permiso necesario',
        'Necesitamos acceso a tus fotos para subir certificados. Actívalo en Ajustes.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: CERTIFICADO_IMAGE_PICKER_QUALITY,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    await procesarArchivo(asset.uri, mime, asset.fileName ?? 'certificado.jpg', asset.fileSize);
  };

  const pickCamara = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permiso necesario',
        'Necesitamos usar la cámara para fotografiar certificados. Actívalo en Ajustes.'
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: CERTIFICADO_IMAGE_PICKER_QUALITY,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    await procesarArchivo(asset.uri, mime, asset.fileName ?? 'certificado.jpg', asset.fileSize);
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? 'application/pdf';
    await procesarArchivo(asset.uri, mime, asset.name ?? 'certificado.pdf', asset.size ?? undefined);
  };

  const toggleServicio = (id: string) => {
    const checked = selectedServicios.has(id);
    if (
      !checked &&
      !puedeAsignarServicio(id, certificados, servicioIds, editingId ?? undefined, false)
    ) {
      return;
    }
    setSelectedServicios((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setModalError(null);
  };

  const nombreError = touched.nombre ? validarNombreTipoCertificado(nombreTipo) : null;
  const entidadError = touched.entidad ? validarEntidadEmisoraCertificado(entidadEmisora) : null;
  const fechaError = touched.fecha ? validarFechaEmisionCertificado(fechaEmision) : null;
  const formValido = certificadoFormularioValido(
    nombreTipo,
    entidadEmisora,
    fechaEmision,
    [...selectedServicios],
    archivo !== null
  );

  const guardarModal = async () => {
    if (!params.solicitudId || savingModal || !formValido || !archivo) return;
    setSavingModal(true);
    setModalError(null);
    try {
      const payload = {
        nombreTipo,
        entidadEmisora,
        servicioIds: [...selectedServicios],
        archivo,
        ...(fechaEmision ? { fechaEmision: formatDateLocalISO(fechaEmision) } : {}),
      };
      const certService = getProfessionalCertificateService();
      if (editingId) {
        const updated = await certService.actualizarCertificado({
          solicitudId: params.solicitudId,
          certificadoId: editingId,
          certificado: payload,
        });
        setCertificados((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const created = await certService.agregarCertificado({
          solicitudId: params.solicitudId,
          certificado: payload,
        });
        setCertificados((prev) => [...prev, created]);
      }
      permitirSalida.current = false;
      cerrarModal();
      setActionError(null);
    } catch (error) {
      setModalError(mensajeErrorServicio(error));
    } finally {
      setSavingModal(false);
    }
  };

  const eliminarCertificado = (certificadoId: string) => {
    if (!params.solicitudId || deletingId) return;
    Alert.alert('Eliminar certificado', '¿Quieres eliminar este certificado?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(certificadoId);
          try {
            await getProfessionalCertificateService().eliminarCertificado({
              solicitudId: params.solicitudId!,
              certificadoId,
            });
            setCertificados((prev) => prev.filter((c) => c.id !== certificadoId));
          } catch (error) {
            setActionError(mensajeErrorServicio(error));
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const enviarRevision = async () => {
    if (!params.solicitudId || sending || !puedeEnviar) return;
    setSending(true);
    setActionError(null);
    try {
      const result = await getProfessionalCertificateService().enviarSolicitudVerificacion({
        solicitudId: params.solicitudId,
      });
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalVerificationPlaceholder', {
        profesionalId: result.profesionalId,
        solicitudId: result.solicitudId,
        nombre: result.nombre,
        email: result.email,
        estadoSolicitud: result.estadoSolicitud,
        onboardingPaso: result.onboardingPaso,
        servicioIds,
      });
    } catch (error) {
      setActionError(mensajeErrorServicio(error));
    } finally {
      setSending(false);
    }
  };

  const onFechaChange = (_event: DateTimePickerChangeEvent, selected: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    setFechaEmision(selected);
    setTouched((p) => ({ ...p, fecha: true }));
  };

  const closeDatePicker = () => {
    setShowDatePicker(false);
    setTouched((p) => ({ ...p, fecha: true }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Image source={require('../../../assets/logo-lookify.png')} style={styles.logo} />
        <Text style={styles.title}>Certificados</Text>
        <Text style={styles.subtitle}>
          Sube certificados que cubran todos los servicios que ofreces
        </Text>
        <TouchableOpacity onPress={confirmarCerrarSesion} activeOpacity={0.8}>
          <Text style={styles.logoutLink}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {loadingInit ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : loadError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>No pudimos cargar tus datos.</Text>
            <Button label="Reintentar" onPress={cargarDatos} style={styles.retryButton} />
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {motivoRechazoAviso ? (
                <View style={styles.avisoRechazo}>
                  <Text style={styles.avisoRechazoTitle}>Motivo del rechazo anterior</Text>
                  <Text style={styles.avisoRechazoText}>{motivoRechazoAviso}</Text>
                </View>
              ) : null}
              <Text style={styles.sectionLabel}>Cobertura por servicio</Text>
              {serviciosInfo.map((s) => {
                const n = counts[s.id] ?? 0;
                const falta = n === 0;
                return (
                  <View key={s.id} style={[styles.coverageRow, falta && styles.coverageRowWarn]}>
                    <Text style={styles.coverageName}>{s.nombre}</Text>
                    <Text style={[styles.coverageCount, falta && styles.coverageCountWarn]}>
                      {n} de {CERTIFICADO_MAX_POR_SERVICIO}
                      {falta ? ' · Falta certificado' : ''}
                    </Text>
                  </View>
                );
              })}

              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Tus certificados</Text>
              {certificados.length === 0 ? (
                <Text style={styles.emptyHint}>Aún no has agregado certificados.</Text>
              ) : (
                certificados.map((cert) => (
                  <View key={cert.id} style={styles.certCard}>
                    <View style={styles.certHeader}>
                      <MaterialCommunityIcons
                        name={
                          cert.archivo.mimeType === 'application/pdf'
                            ? 'file-pdf-box'
                            : 'file-image'
                        }
                        size={28}
                        color={colors.navy}
                      />
                      <View style={styles.certHeaderText}>
                        <Text style={styles.certTitle}>{cert.nombreTipo}</Text>
                        <Text style={styles.certMeta}>{cert.entidadEmisora}</Text>
                        <Text style={styles.certMeta}>
                          {cert.servicioIds.length} servicio
                          {cert.servicioIds.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.certActions}>
                      <Button
                        label="Editar"
                        variant="outline"
                        onPress={() => abrirModalEditar(cert)}
                        disabled={deletingId !== null || sending}
                        style={styles.certActionBtn}
                      />
                      <Button
                        label="Eliminar"
                        variant="outline"
                        onPress={() => eliminarCertificado(cert.id)}
                        loading={deletingId === cert.id}
                        disabled={deletingId !== null || sending}
                        style={styles.certActionBtn}
                      />
                    </View>
                  </View>
                ))
              )}
              {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              <Button
                label="Agregar certificado"
                onPress={abrirModalNuevo}
                disabled={savingModal || sending || deletingId !== null}
                style={styles.footerBtn}
              />
              <Button
                label="Enviar a revisión"
                onPress={enviarRevision}
                loading={sending}
                disabled={!puedeEnviar || savingModal || deletingId !== null}
                style={styles.footerBtn}
              />
              {!puedeEnviar && servicioIds.length > 0 ? (
                <Text style={styles.footerHint}>
                  Cada servicio necesita al menos 1 certificado (máx. {CERTIFICADO_MAX_POR_SERVICIO}{' '}
                  por servicio).
                </Text>
              ) : null}
            </View>
          </>
        )}
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={confirmarCerrarModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={confirmarCerrarModal} style={styles.modalClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.navy} />
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingId ? 'Editar certificado' : 'Nuevo certificado'}
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalSection}>Archivo (JPG, PNG o PDF · máx. 5 MB)</Text>
            <View style={styles.pickRow}>
              <Button label="Galería" variant="outline" onPress={pickGaleria} disabled={savingModal} />
              <Button label="Cámara" variant="outline" onPress={pickCamara} disabled={savingModal} />
              <Button label="PDF" variant="outline" onPress={pickPdf} disabled={savingModal} />
            </View>
            {archivo ? (
              <Text style={styles.fileName} numberOfLines={1}>
                {archivo.fileName}
              </Text>
            ) : null}

            <TextField
              label="Nombre o tipo de certificado"
              value={nombreTipo}
              onChangeText={setNombreTipo}
              onBlur={() => setTouched((p) => ({ ...p, nombre: true }))}
              error={nombreError ?? undefined}
            />
            <TextField
              label="Entidad emisora"
              value={entidadEmisora}
              onChangeText={setEntidadEmisora}
              onBlur={() => setTouched((p) => ({ ...p, entidad: true }))}
              error={entidadError ?? undefined}
            />
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={styles.dateField}
            >
              <Text style={styles.dateLabel}>Fecha de emisión (opcional)</Text>
              <Text style={styles.dateValue}>{formatFechaLabel(fechaEmision)}</Text>
            </Pressable>
            {fechaError ? <Text style={styles.fieldError}>{fechaError}</Text> : null}
            {showDatePicker ? (
              <DateTimePicker
                value={fechaEmision ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onValueChange={onFechaChange}
                onDismiss={closeDatePicker}
              />
            ) : null}

            <Text style={styles.modalSection}>Servicios que cubre</Text>
            {serviciosInfo.map((s) => {
              const checked = selectedServicios.has(s.id);
              const limite =
                !checked &&
                !puedeAsignarServicio(
                  s.id,
                  certificados,
                  servicioIds,
                  editingId ?? undefined,
                  checked
                );
              return (
                <Pressable
                  key={s.id}
                  onPress={() => !limite && toggleServicio(s.id)}
                  style={[styles.checkRow, limite && styles.checkRowDisabled]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: limite }}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <View style={styles.checkText}>
                    <Text style={styles.checkTitle}>{s.nombre}</Text>
                    {limite ? (
                      <Text style={styles.limitHint}>
                        Ya tienes {CERTIFICADO_MAX_POR_SERVICIO} certificados para este servicio
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}

            {modalError ? <Text style={styles.modalError}>{modalError}</Text> : null}
            <Button
              label={editingId ? 'Guardar cambios' : 'Agregar certificado'}
              onPress={guardarModal}
              loading={savingModal}
              disabled={!formValido || savingModal}
              style={styles.modalSubmit}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  subtitle: {
    fontSize: 13,
    color: colors.textOnNavyMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  logoutLink: {
    marginTop: spacing.md,
    fontSize: 13,
    color: colors.honey,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  body: { flex: 1, backgroundColor: colors.beige, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  retryButton: { minWidth: 160 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  avisoRechazo: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.honey,
  },
  avisoRechazoTitle: { fontSize: 13, fontWeight: '600', color: colors.navy, marginBottom: spacing.xs },
  avisoRechazoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.navy, marginBottom: spacing.sm },
  sectionLabelSpaced: { marginTop: spacing.lg },
  coverageRow: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  coverageRowWarn: { borderWidth: 1, borderColor: colors.error },
  coverageName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  coverageCount: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  coverageCountWarn: { color: colors.error },
  emptyHint: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.md },
  certCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  certHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  certHeaderText: { flex: 1 },
  certTitle: { fontSize: 15, fontWeight: '600', color: colors.navy },
  certMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  certActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  certActionBtn: { flex: 1, marginBottom: 0 },
  actionError: { fontSize: 13, color: colors.error, textAlign: 'center', marginTop: spacing.md },
  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.beige,
  },
  footerBtn: { marginBottom: spacing.sm },
  footerHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  modalContainer: { flex: 1, backgroundColor: colors.white },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalClose: { padding: spacing.sm },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.navy, textAlign: 'center', marginRight: 40 },
  modalScroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  modalSection: { fontSize: 14, fontWeight: '600', color: colors.navy, marginBottom: spacing.sm, marginTop: spacing.md },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  fileName: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  dateField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dateLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  dateValue: { fontSize: 15, color: colors.textPrimary },
  fieldError: { fontSize: 12, color: colors.error, marginTop: -spacing.sm, marginBottom: spacing.md },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  checkRowDisabled: { opacity: 0.55 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.navy },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: '700' },
  checkText: { flex: 1 },
  checkTitle: { fontSize: 14, color: colors.textPrimary },
  limitHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  modalError: { fontSize: 13, color: colors.error, textAlign: 'center', marginVertical: spacing.md },
  modalSubmit: { marginTop: spacing.md },
});
