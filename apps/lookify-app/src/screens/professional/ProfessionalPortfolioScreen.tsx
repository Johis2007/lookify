// App Profesional — pantalla 7: Mi portafolio (ruta stack: ProfessionalPortfolioPlaceholder).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  Modal,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors, radius, spacing, typography } from '../../theme/colors';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import BackHeader from '../../components/BackHeader';
import { ProfessionalStackParamList } from '../../navigation/ProfessionalStackNavigator';
import { resetProfessionalSession } from '../../navigation/professionalNavigation';
import { getProfessionalPortfolioService } from '../../services/professionalPortfolioService';
import { ServiceError } from '../../services/errors';
import {
  PortfolioItem,
  PortfolioResponse,
  ServicioAsociable,
} from '../../types/professionalPortfolio';
import {
  PORTAFOLIO_AVISO_INFORMATIVO,
  PORTAFOLIO_DESCRIPCION_MAX_CHARS,
  PORTAFOLIO_FOTO_IMAGE_PICKER_QUALITY,
  PORTAFOLIO_MAX_FOTOS,
  PORTAFOLIO_MAX_VIDEOS,
  PORTAFOLIO_UMBRAL_FOTOS_AVISO,
} from '../../constants/professionalPortfolio';
import {
  normalizarDuracionSegDesdePicker,
  validarArchivoPortafolioFoto,
  validarArchivoPortafolioVideo,
} from '../../utils/portfolioFile';

type Props = NativeStackScreenProps<ProfessionalStackParamList, 'ProfessionalPortfolioPlaceholder'>;

function mensajeErrorPortafolio(error: unknown): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'LIMITE_FOTOS_PORTAFOLIO':
        return 'Ya tienes el máximo de 10 fotos. Elimina una para agregar otra.';
      case 'LIMITE_VIDEOS_PORTAFOLIO':
        return 'Ya tienes el máximo de 4 videos. Elimina uno para agregar otro.';
      case 'ARCHIVO_MUY_GRANDE':
        return 'El archivo supera el límite permitido (fotos 5 MB, videos 50 MB).';
      case 'ARCHIVO_INVALIDO':
        return 'Archivo no válido. Fotos: JPG o PNG (máx. 5 MB). Videos: MP4 o MOV (máx. 50 MB y 30 s).';
      case 'VIDEO_DURACION_EXCEDIDA':
        return 'El video supera el límite de 30 segundos.';
      case 'VALIDATION':
        return 'Revisa los datos e inténtalo de nuevo.';
      case 'ITEM_PORTAFOLIO_NO_ENCONTRADO':
        return 'No encontramos esa publicación. Actualiza e inténtalo de nuevo.';
      case 'NETWORK':
        return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
      case 'SOLICITUD_NO_ENCONTRADA':
      case 'PROFESIONAL_NO_HABILITADO':
        return 'No pudimos cargar tu portafolio. Vuelve a iniciar sesión.';
      default:
        return 'Ocurrió un error. Inténtalo de nuevo.';
    }
  }
  return 'Ocurrió un error. Inténtalo de nuevo.';
}

function alertPermisoMedios(tipo: 'galería' | 'cámara'): void {
  const msg =
    tipo === 'galería'
      ? 'Necesitamos acceso a tus fotos para tu portafolio. Actívalo en Ajustes.'
      : 'Necesitamos usar la cámara para tu portafolio. Actívalo en Ajustes.';
  Alert.alert('Permiso necesario', msg, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
  ]);
}

type VideoPreviewProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

function VideoPreviewModal({ visible, uri, onClose }: VideoPreviewProps) {
  const source = visible && uri ? uri : null;
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (visible && uri) {
      player.play();
    } else {
      player.pause();
    }
  }, [visible, uri, player]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.videoPreviewBackdrop}>
        <Pressable style={styles.videoPreviewClose} onPress={onClose} accessibilityLabel="Cerrar">
          <MaterialCommunityIcons name="close" size={28} color={colors.white} />
        </Pressable>
        {source ? (
          <VideoView style={styles.videoPreviewPlayer} player={player} nativeControls contentFit="contain" />
        ) : null}
      </View>
    </Modal>
  );
}

export default function ProfessionalPortfolioScreen({ navigation, route }: Props) {
  const params = route.params;
  const { width } = useWindowDimensions();
  const cellSize = Math.floor((width - spacing.lg * 2 - spacing.sm * 2) / 3);

  const modalEdicionAbierto = useRef(false);
  const accionEnCurso = useRef(false);

  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [servicios, setServicios] = useState<ServicioAsociable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editItem, setEditItem] = useState<PortfolioItem | null>(null);
  const [draftDescripcion, setDraftDescripcion] = useState('');
  const [draftServicioId, setDraftServicioId] = useState<string | null>(null);
  const [draftDescError, setDraftDescError] = useState<string | null>(null);

  const [videoPreviewUri, setVideoPreviewUri] = useState<string | null>(null);

  const mostrarAviso = (data?.totalFotos ?? 0) < PORTAFOLIO_UMBRAL_FOTOS_AVISO;

  const fotosOrdenadas = useMemo(() => {
    if (!data) return [];
    return [...data.fotos].sort((a, b) => a.orden - b.orden);
  }, [data]);

  const videosOrdenados = useMemo(() => {
    if (!data) return [];
    return [...data.videos].sort((a, b) => a.orden - b.orden);
  }, [data]);

  const recargar = useCallback(async () => {
    if (!params.profesionalId || !params.solicitudId) {
      resetProfessionalSession(navigation, 'ProfessionalLogin');
      return;
    }
    setLoadError(false);
    try {
      const svc = getProfessionalPortfolioService();
      const [portafolio, serviciosAsoc] = await Promise.all([
        svc.obtenerPortafolio({
          profesionalId: params.profesionalId,
          solicitudId: params.solicitudId,
        }),
        svc.listarServiciosAsociables({
          profesionalId: params.profesionalId,
          solicitudId: params.solicitudId,
        }),
      ]);
      setData(portafolio);
      setServicios(serviciosAsoc);
    } catch {
      setLoadError(true);
      setData(null);
    }
  }, [navigation, params.profesionalId, params.solicitudId]);

  useEffect(() => {
    setLoading(true);
    recargar().finally(() => setLoading(false));
  }, [recargar]);

  useEffect(() => {
    const onBack = () => {
      if (videoPreviewUri) {
        setVideoPreviewUri(null);
        return true;
      }
      if (modalEdicionAbierto.current) {
        modalEdicionAbierto.current = false;
        setEditItem(null);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [videoPreviewUri]);

  const runAction = async (fn: () => Promise<void>) => {
    if (accionEnCurso.current) return;
    accionEnCurso.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await recargar();
    } catch (error) {
      setActionError(mensajeErrorPortafolio(error));
    } finally {
      accionEnCurso.current = false;
      setBusy(false);
    }
  };

  const agregarFotoDesdeAsset = async (
    uri: string,
    mimeType: string,
    sizeBytes?: number
  ) => {
    const pre = await validarArchivoPortafolioFoto(uri, mimeType, sizeBytes);
    if (pre === 'muy_grande') {
      setActionError('La imagen supera el límite de 5 MB.');
      return;
    }
    if (pre === 'invalido') {
      setActionError('Imagen no válida. Usa JPG o PNG (máx. 5 MB).');
      return;
    }
    await getProfessionalPortfolioService().agregarFoto({
      profesionalId: params.profesionalId,
      solicitudId: params.solicitudId!,
      archivo: { uri, mimeType, sizeBytes },
    });
  };

  const pickFotoGaleria = () => {
    void runAction(async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alertPermisoMedios('galería');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: PORTAFOLIO_FOTO_IMAGE_PICKER_QUALITY,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await agregarFotoDesdeAsset(
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
        asset.fileSize
      );
    });
  };

  const pickFotoCamara = () => {
    void runAction(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        alertPermisoMedios('cámara');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: PORTAFOLIO_FOTO_IMAGE_PICKER_QUALITY,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await agregarFotoDesdeAsset(
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
        asset.fileSize
      );
    });
  };

  const promptAgregarFoto = () => {
    if ((data?.totalFotos ?? 0) >= PORTAFOLIO_MAX_FOTOS) {
      setActionError('Ya tienes el máximo de 10 fotos. Elimina una para agregar otra.');
      return;
    }
    Alert.alert('Agregar foto', 'Elige una opción', [
      { text: 'Galería', onPress: pickFotoGaleria },
      { text: 'Cámara', onPress: pickFotoCamara },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const pickVideoGaleria = () => {
    void runAction(async () => {
      if ((data?.totalVideos ?? 0) >= PORTAFOLIO_MAX_VIDEOS) {
        setActionError('Ya tienes el máximo de 4 videos. Elimina uno para agregar otro.');
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alertPermisoMedios('galería');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'video/mp4';
      const duracionSeg = normalizarDuracionSegDesdePicker(asset.duration);
      const pre = await validarArchivoPortafolioVideo(
        asset.uri,
        mimeType,
        duracionSeg,
        asset.fileSize
      );
      if (pre === 'muy_grande') {
        setActionError('El video supera el límite de 50 MB.');
        return;
      }
      if (pre === 'duracion_excedida') {
        setActionError('El video supera el límite de 30 segundos.');
        return;
      }
      if (pre === 'invalido') {
        setActionError('Video no válido. Usa MP4 o MOV (máx. 50 MB y 30 s).');
        return;
      }
      await getProfessionalPortfolioService().agregarVideo({
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId!,
        archivo: {
          uri: asset.uri,
          mimeType,
          sizeBytes: asset.fileSize,
          duracionSeg,
        },
      });
    });
  };

  const abrirEdicion = (item: PortfolioItem) => {
    setEditItem(item);
    setDraftDescripcion(item.descripcion ?? '');
    setDraftServicioId(item.servicioId ?? null);
    setDraftDescError(null);
    modalEdicionAbierto.current = true;
  };

  const cerrarEdicion = () => {
    modalEdicionAbierto.current = false;
    setEditItem(null);
    setDraftDescError(null);
  };

  const guardarEdicion = () => {
    if (!editItem || !params.solicitudId) return;
    const trimmed = draftDescripcion.trim();
    if (trimmed.length > PORTAFOLIO_DESCRIPCION_MAX_CHARS) {
      setDraftDescError('La descripción no puede superar 100 caracteres.');
      return;
    }
    void runAction(async () => {
      await getProfessionalPortfolioService().actualizarItem({
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId!,
        itemId: editItem.id,
        descripcion: trimmed,
        servicioId: draftServicioId,
      });
      cerrarEdicion();
    });
  };

  const confirmarEliminar = () => {
    if (!editItem) return;
    const esFoto = editItem.tipo === 'FOTO';
    Alert.alert(
      esFoto ? '¿Eliminar esta foto?' : '¿Eliminar este video?',
      undefined,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void runAction(async () => {
              await getProfessionalPortfolioService().eliminarItem({
                profesionalId: params.profesionalId,
                solicitudId: params.solicitudId!,
                itemId: editItem.id,
              });
              cerrarEdicion();
            });
          },
        },
      ]
    );
  };

  const reemplazarArchivo = () => {
    if (!editItem) return;
    if (editItem.tipo === 'FOTO') {
      Alert.alert('Reemplazar foto', 'Elige una opción', [
        {
          text: 'Galería',
          onPress: () => {
            void runAction(async () => {
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!perm.granted) {
                alertPermisoMedios('galería');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: PORTAFOLIO_FOTO_IMAGE_PICKER_QUALITY,
              });
              if (result.canceled || !result.assets[0]) return;
              const asset = result.assets[0];
              const mimeType = asset.mimeType ?? 'image/jpeg';
              const pre = await validarArchivoPortafolioFoto(asset.uri, mimeType, asset.fileSize);
              if (pre !== 'ok') {
                setActionError(
                  pre === 'muy_grande'
                    ? 'La imagen supera el límite de 5 MB.'
                    : 'Imagen no válida. Usa JPG o PNG (máx. 5 MB).'
                );
                return;
              }
              await getProfessionalPortfolioService().reemplazarArchivo({
                profesionalId: params.profesionalId,
                solicitudId: params.solicitudId!,
                itemId: editItem.id,
                archivo: { uri: asset.uri, mimeType, sizeBytes: asset.fileSize },
              });
              cerrarEdicion();
            });
          },
        },
        {
          text: 'Cámara',
          onPress: () => {
            void runAction(async () => {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) {
                alertPermisoMedios('cámara');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                allowsEditing: false,
                quality: PORTAFOLIO_FOTO_IMAGE_PICKER_QUALITY,
              });
              if (result.canceled || !result.assets[0]) return;
              const asset = result.assets[0];
              const mimeType = asset.mimeType ?? 'image/jpeg';
              const pre = await validarArchivoPortafolioFoto(asset.uri, mimeType, asset.fileSize);
              if (pre !== 'ok') {
                setActionError(
                  pre === 'muy_grande'
                    ? 'La imagen supera el límite de 5 MB.'
                    : 'Imagen no válida. Usa JPG o PNG (máx. 5 MB).'
                );
                return;
              }
              await getProfessionalPortfolioService().reemplazarArchivo({
                profesionalId: params.profesionalId,
                solicitudId: params.solicitudId!,
                itemId: editItem.id,
                archivo: { uri: asset.uri, mimeType, sizeBytes: asset.fileSize },
              });
              cerrarEdicion();
            });
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
      return;
    }
    void runAction(async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alertPermisoMedios('galería');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'video/mp4';
      const duracionSeg = normalizarDuracionSegDesdePicker(asset.duration);
      const pre = await validarArchivoPortafolioVideo(
        asset.uri,
        mimeType,
        duracionSeg,
        asset.fileSize
      );
      if (pre !== 'ok') {
        setActionError(
          pre === 'muy_grande'
            ? 'El video supera el límite de 50 MB.'
            : pre === 'duracion_excedida'
              ? 'El video supera el límite de 30 segundos.'
              : 'Video no válido. Usa MP4 o MOV (máx. 50 MB y 30 s).'
        );
        return;
      }
      await getProfessionalPortfolioService().reemplazarArchivo({
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId!,
        itemId: editItem.id,
        archivo: {
          uri: asset.uri,
          mimeType,
          sizeBytes: asset.fileSize,
          duracionSeg,
        },
      });
      cerrarEdicion();
    });
  };

  const moverItem = (direccion: 'ARRIBA' | 'ABAJO') => {
    if (!editItem) return;
    void runAction(async () => {
      const res = await getProfessionalPortfolioService().moverItem({
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId!,
        itemId: editItem.id,
        direccion,
      });
      setData(res);
      const lista = editItem.tipo === 'FOTO' ? res.fotos : res.videos;
      const actualizado = lista.find((x) => x.id === editItem.id);
      if (actualizado) {
        setEditItem(actualizado);
      }
    });
  };

  const hacerPortada = () => {
    if (!editItem || editItem.tipo !== 'FOTO') return;
    void runAction(async () => {
      const res = await getProfessionalPortfolioService().definirPortada({
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId!,
        itemId: editItem.id,
      });
      setData(res);
      const actualizado = res.fotos.find((x) => x.id === editItem.id);
      if (actualizado) {
        setEditItem(actualizado);
      }
    });
  };

  const idxEnLista = editItem
    ? (editItem.tipo === 'FOTO' ? fotosOrdenadas : videosOrdenados).findIndex((x) => x.id === editItem.id)
    : -1;
  const puedeSubir = idxEnLista > 0;
  const puedeBajar =
    idxEnLista >= 0 &&
    idxEnLista < (editItem?.tipo === 'FOTO' ? fotosOrdenadas.length : videosOrdenados.length) - 1;

  return (
    <SafeAreaView style={styles.container}>
      <BackHeader title="Mi portafolio" />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>No pudimos cargar tu portafolio. Inténtalo de nuevo.</Text>
          <Button label="Reintentar" onPress={() => recargar()} style={styles.retryButton} />
        </View>
      ) : data ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {mostrarAviso ? (
            <View style={styles.avisoCard}>
              <MaterialCommunityIcons name="information-outline" size={22} color={colors.honey} />
              <Text style={styles.avisoText}>{PORTAFOLIO_AVISO_INFORMATIVO}</Text>
            </View>
          ) : null}

          {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Fotos</Text>
            <Text style={styles.counter}>
              {data.totalFotos} de {PORTAFOLIO_MAX_FOTOS}
            </Text>
          </View>

          <View style={styles.grid}>
            {fotosOrdenadas.map((foto) => (
              <Pressable
                key={foto.id}
                style={[styles.cell, { width: cellSize, height: cellSize }]}
                onPress={() => abrirEdicion(foto)}
                accessibilityLabel="Editar foto"
              >
                <Image source={{ uri: foto.uri }} style={styles.cellImage} />
                {foto.esPortada ? (
                  <View style={styles.portadaBadge}>
                    <Text style={styles.portadaBadgeText}>Portada</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
            {data.totalFotos < PORTAFOLIO_MAX_FOTOS ? (
              <Pressable
                style={[styles.cell, styles.addCell, { width: cellSize, height: cellSize }]}
                onPress={promptAgregarFoto}
                disabled={busy}
                accessibilityLabel="Agregar foto"
              >
                <MaterialCommunityIcons name="plus" size={32} color={colors.navy} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Videos</Text>
            <Text style={styles.counter}>
              {data.totalVideos} de {PORTAFOLIO_MAX_VIDEOS}
            </Text>
          </View>

          <View style={styles.videoList}>
            {videosOrdenados.map((video) => (
              <Pressable
                key={video.id}
                style={styles.videoCard}
                onPress={() => setVideoPreviewUri(video.uri)}
                onLongPress={() => abrirEdicion(video)}
                accessibilityLabel="Reproducir video"
              >
                <MaterialCommunityIcons name="play-circle-outline" size={48} color={colors.navy} />
                <Pressable
                  style={styles.videoEditLink}
                  onPress={() => abrirEdicion(video)}
                  hitSlop={8}
                >
                  <Text style={styles.videoEditText}>Editar</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>

          {data.totalVideos < PORTAFOLIO_MAX_VIDEOS ? (
            <Button
              label="Agregar video"
              variant="outline"
              onPress={pickVideoGaleria}
              disabled={busy}
              style={styles.addVideoButton}
            />
          ) : null}

          {busy ? (
            <ActivityIndicator style={styles.footerSpinner} color={colors.navy} />
          ) : null}
        </ScrollView>
      ) : null}

      <Modal
        visible={editItem != null}
        animationType="slide"
        transparent
        onRequestClose={cerrarEdicion}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {editItem?.tipo === 'FOTO' ? 'Editar foto' : 'Editar video'}
              </Text>
              {editItem?.tipo === 'FOTO' ? (
                <Image source={{ uri: editItem.uri }} style={styles.modalPreviewImage} />
              ) : (
                <View style={styles.modalPreviewVideo}>
                  <MaterialCommunityIcons name="play-circle-outline" size={56} color={colors.navy} />
                </View>
              )}

              <TextField
                label="Descripción (opcional)"
                value={draftDescripcion}
                onChangeText={setDraftDescripcion}
                maxLength={PORTAFOLIO_DESCRIPCION_MAX_CHARS}
                error={draftDescError ?? undefined}
                onBlur={() => {
                  if (draftDescripcion.trim().length > PORTAFOLIO_DESCRIPCION_MAX_CHARS) {
                    setDraftDescError('La descripción no puede superar 100 caracteres.');
                  } else {
                    setDraftDescError(null);
                  }
                }}
              />

              <Text style={styles.modalLabel}>Servicio asociado</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, draftServicioId === null && styles.chipSelected]}
                  onPress={() => setDraftServicioId(null)}
                >
                  <Text
                    style={[styles.chipText, draftServicioId === null && styles.chipTextSelected]}
                  >
                    Sin servicio
                  </Text>
                </Pressable>
                {servicios.map((s) => (
                  <Pressable
                    key={s.servicioId}
                    style={[styles.chip, draftServicioId === s.servicioId && styles.chipSelected]}
                    onPress={() => setDraftServicioId(s.servicioId)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        draftServicioId === s.servicioId && styles.chipTextSelected,
                      ]}
                    >
                      {s.nombre}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.modalRow}>
                <Button
                  label="Mover antes"
                  variant="outline"
                  onPress={() => moverItem('ARRIBA')}
                  disabled={!puedeSubir || busy}
                  style={styles.modalHalfButton}
                />
                <Button
                  label="Mover después"
                  variant="outline"
                  onPress={() => moverItem('ABAJO')}
                  disabled={!puedeBajar || busy}
                  style={styles.modalHalfButton}
                />
              </View>

              {editItem?.tipo === 'FOTO' && !editItem.esPortada ? (
                <Button
                  label="Hacer portada"
                  variant="outline"
                  onPress={hacerPortada}
                  disabled={busy}
                  style={styles.modalAction}
                />
              ) : null}

              <Button
                label="Reemplazar"
                variant="outline"
                onPress={reemplazarArchivo}
                disabled={busy}
                style={styles.modalAction}
              />

              <Button
                label="Eliminar"
                variant="outline"
                onPress={confirmarEliminar}
                disabled={busy}
                style={styles.modalAction}
              />

              <Button label="Guardar" onPress={guardarEdicion} disabled={busy} style={styles.modalAction} />
              <Button label="Cancelar" variant="outline" onPress={cerrarEdicion} disabled={busy} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <VideoPreviewModal
        visible={videoPreviewUri != null}
        uri={videoPreviewUri}
        onClose={() => setVideoPreviewUri(null)}
      />
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
    flexGrow: 1,
  },
  avisoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.honey,
  },
  avisoText: {
    ...typography.body,
    color: colors.navy,
    flex: 1,
  },
  inlineError: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    alignSelf: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.navy,
  },
  counter: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cell: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  addCell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  portadaBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    backgroundColor: colors.honey,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  portadaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.navy,
  },
  videoList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  videoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoEditLink: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.sm,
  },
  videoEditText: {
    ...typography.caption,
    color: colors.navy,
    fontWeight: '600',
  },
  addVideoButton: {
    marginBottom: spacing.lg,
  },
  footerSpinner: {
    marginVertical: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 42, 74, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: spacing.md,
  },
  modalPreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  modalPreviewVideo: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    backgroundColor: colors.beige,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  chipText: {
    ...typography.caption,
    color: colors.navy,
  },
  chipTextSelected: {
    color: colors.white,
  },
  modalRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalHalfButton: {
    flex: 1,
  },
  modalAction: {
    marginBottom: spacing.sm,
  },
  videoPreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  videoPreviewClose: {
    position: 'absolute',
    top: 48,
    right: spacing.lg,
    zIndex: 2,
    padding: spacing.sm,
  },
  videoPreviewPlayer: {
    width: '100%',
    height: 280,
  },
});
