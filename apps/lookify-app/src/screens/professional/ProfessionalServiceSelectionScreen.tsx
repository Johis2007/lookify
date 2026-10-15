// App Profesional — pantalla 3: Selección de servicios.

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
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/colors';
import Button from '../../components/Button';
import { ProfessionalStackParamList } from '../../navigation/ProfessionalStackNavigator';
import { resetProfessionalSession } from '../../navigation/professionalNavigation';
import { getCatalogService, CatalogoCategoria } from '../../services/catalogService';
import { getProfessionalRegistrationService } from '../../services/professionalRegistrationService';
import { ServiceError } from '../../services/errors';
import { formatCOP } from '../../utils/pricing';
import { CATEGORIA_ICONOS } from '../../constants/categoryIcons';

type Props = NativeStackScreenProps<ProfessionalStackParamList, 'ProfessionalServiceSelection'>;

function pluralServicios(n: number): string {
  return n === 1 ? '1 servicio seleccionado' : `${n} servicios seleccionados`;
}

function mensajeErrorGuardar(error: unknown): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'NETWORK':
        return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
      case 'SERVICIO_INVALIDO':
      case 'SOLICITUD_NO_ENCONTRADA':
      case 'VALIDATION':
        return 'No pudimos guardar tu selección. Revisa los datos e inténtalo de nuevo.';
      default:
        return 'No pudimos guardar tu selección. Inténtalo de nuevo.';
    }
  }
  return 'No pudimos guardar tu selección. Inténtalo de nuevo.';
}

export default function ProfessionalServiceSelectionScreen({ navigation, route }: Props) {
  const params = route.params;
  const permitirSalida = useRef(false);

  const [catalogo, setCatalogo] = useState<CatalogoCategoria[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const cargarCatalogo = useCallback(async () => {
    setLoadingCatalog(true);
    setLoadError(false);
    try {
      const data = await getCatalogService().listarServiciosPorCategoria();
      setCatalogo(data);
    } catch {
      setLoadError(true);
      setCatalogo(null);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    if (!params.solicitudId) {
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalLogin');
      return;
    }
    cargarCatalogo();
  }, [params.solicitudId, navigation, cargarCatalogo]);

  const confirmarCerrarSesion = useCallback(() => {
    Alert.alert(
      '¿Cerrar sesión?',
      'Perderás el progreso de este paso si sales.',
      [
        { text: 'Seguir seleccionando', style: 'cancel' },
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

  const toggleServicio = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaveError(null);
  };

  const handleContinuar = async () => {
    if (!params.solicitudId || selected.size === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await getProfessionalRegistrationService().guardarServicios({
        solicitudId: params.solicitudId,
        servicioIds: [...selected],
      });
      permitirSalida.current = true;
      resetProfessionalSession(navigation, 'ProfessionalCertificateUploadPlaceholder', {
        profesionalId: params.profesionalId,
        solicitudId: params.solicitudId,
        nombre: params.nombre,
        email: params.email,
        estadoSolicitud: params.estadoSolicitud,
        onboardingPaso: result.onboardingPaso,
        servicioIds: result.servicioIds,
      });
    } catch (error) {
      setSaveError(mensajeErrorGuardar(error));
    } finally {
      setSaving(false);
    }
  };

  const count = selected.size;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Image source={require('../../../assets/logo-lookify.png')} style={styles.logo} />
        <Text style={styles.title}>¿Qué servicios ofreces?</Text>
        <Text style={styles.subtitle}>Marca todos los servicios que sabes prestar</Text>
        <TouchableOpacity onPress={confirmarCerrarSesion} activeOpacity={0.8}>
          <Text style={styles.logoutLink}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {loadingCatalog ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : loadError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>No pudimos cargar el catálogo.</Text>
            <Button label="Reintentar" onPress={cargarCatalogo} style={styles.retryButton} />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {catalogo?.map((cat) => (
              <View key={cat.categoriaId} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons
                    name={CATEGORIA_ICONOS[cat.categoriaId]}
                    size={22}
                    color={colors.navy}
                  />
                  <Text style={styles.sectionTitle}>{cat.categoriaNombre}</Text>
                </View>
                {cat.servicios.map((servicio) => {
                  const checked = selected.has(servicio.id);
                  return (
                    <Pressable
                      key={servicio.id}
                      onPress={() => toggleServicio(servicio.id)}
                      style={styles.row}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.serviceName}>{servicio.nombre}</Text>
                        <Text style={styles.serviceMeta}>
                          {servicio.duracionMin} min · Precio base {formatCOP(servicio.precio)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
          </ScrollView>
        )}

        {!loadingCatalog && !loadError ? (
          <View style={styles.footer}>
            <Text style={styles.counter}>{pluralServicios(count)}</Text>
            <Button
              label="Continuar"
              onPress={handleContinuar}
              loading={saving}
              disabled={count === 0}
              style={styles.continueButton}
            />
          </View>
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: spacing.sm,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
  },
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
  body: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    marginBottom: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  checkmark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  serviceMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  saveError: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  counter: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  continueButton: {
    marginBottom: 0,
  },
});
