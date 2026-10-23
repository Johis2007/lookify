// src/screens/ServiceSelectionScreen.tsx
// Pantalla 5: el cliente elige el servicio específico dentro de la categoría
// que venía seleccionada en Inicio. Al continuar pasamos a la búsqueda de
// profesional (Pantalla 6).

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import BackHeader from '../components/BackHeader';
import { CategoriaId } from '../data/mockProfessionals';
import { MockService, formatPrecio } from '../data/mockServices';
import { getCatalogService } from '../services/catalogService';
import { getBookingService } from '../services/bookingService';
import { isBackendEnabled } from '../services/backend/initBackend';
import { MOCK_CLIENT_LOCATION } from '../constants/geo';
import { ServiceError } from '../services/errors';

interface ServiceSelectionScreenProps {
  navigation: {
    navigate: (screen: string, params?: object) => void;
  };
  route: {
    params: {
      categoriaId: CategoriaId;
      categoriaNombre: string;
    };
  };
}

export default function ServiceSelectionScreen({
  navigation,
  route,
}: ServiceSelectionScreenProps) {
  const { categoriaId, categoriaNombre } = route.params;
  const [servicios, setServicios] = useState<MockService[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servicioSeleccionado, setServicioSeleccionado] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    getCatalogService()
      .listarServiciosPorCategoria()
      .then((categorias) => {
        if (!activo) return;
        const cat = categorias.find((c) => c.categoriaId === categoriaId);
        setServicios(
          (cat?.servicios ?? []).map((s) => ({
            id: s.id,
            nombre: s.nombre,
            duracionMin: s.duracionMin,
            precio: s.precio,
          })),
        );
      })
      .catch(() => {
        if (activo) setError('No pudimos cargar los servicios.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [categoriaId]);

  const handleContinuar = async () => {
    if (!servicioSeleccionado || creando) return;
    setError(null);

    // En modo demo no se crea reserva real: se pasa el flag sin bookingId.
    if (!isBackendEnabled()) {
      navigation.navigate('Matching', {
        categoriaId,
        categoriaNombre,
        servicioId: servicioSeleccionado,
        radioKm: 3,
        rejectionCount: 0,
        rejectedIds: [],
      });
      return;
    }

    const servicio = servicios.find((s) => s.id === servicioSeleccionado);
    if (!servicio) return;
    setCreando(true);
    try {
      const reserva = await getBookingService().crearReserva({
        serviceId: servicioSeleccionado,
        addressText: 'Dirección a confirmar',
        lat: MOCK_CLIENT_LOCATION.latitude,
        lng: MOCK_CLIENT_LOCATION.longitude,
      });
      navigation.navigate('Matching', {
        categoriaId,
        categoriaNombre,
        servicioId: servicioSeleccionado,
        radioKm: 3,
        rejectionCount: 0,
        rejectedIds: [],
        bookingId: reserva.bookingId,
      });
    } catch (e) {
      const code = e instanceof ServiceError ? e.code : 'UNKNOWN';
      setError(
        code === 'VALIDATION'
          ? 'Ese servicio ya no está disponible.'
          : 'No pudimos crear tu reserva. Intenta de nuevo.',
      );
    } finally {
      setCreando(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader title={categoriaNombre} variant="dark" />
        <Text style={styles.subtitle}>Elige el servicio que necesitas</Text>
      </View>

      <View style={styles.body}>
        {cargando ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.navy} />
          </View>
        ) : servicios.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No hay servicios disponibles por ahora.</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {servicios.map((servicio) => (
              <ServiceRow
                key={servicio.id}
                servicio={servicio}
                selected={servicio.id === servicioSeleccionado}
                onPress={() => setServicioSeleccionado(servicio.id)}
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.footer}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button
            label={creando ? 'Creando reserva…' : 'Continuar'}
            onPress={handleContinuar}
            disabled={!servicioSeleccionado || creando}
            style={styles.submitButton}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

interface ServiceRowProps {
  servicio: MockService;
  selected: boolean;
  onPress: () => void;
}

function ServiceRow({ servicio, selected, onPress }: ServiceRowProps) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{servicio.nombre}</Text>
        <Text style={styles.cardMeta}>
          {servicio.duracionMin} min · {formatPrecio(servicio.precio)}
        </Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textOnNavyMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardSelected: {
    borderColor: colors.navy,
    borderWidth: 2,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    ...typography.heading,
  },
  cardMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.navy,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.navy,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  submitButton: {
    marginBottom: 0,
  },
});
