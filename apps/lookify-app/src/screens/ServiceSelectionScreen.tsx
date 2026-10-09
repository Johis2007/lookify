// src/screens/ServiceSelectionScreen.tsx
// Pantalla 5: el cliente elige el servicio específico dentro de la categoría
// que venía seleccionada en Inicio. Al continuar pasamos a la búsqueda de
// profesional (Pantalla 6).

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import BackHeader from '../components/BackHeader';
import { CategoriaId } from '../data/mockProfessionals';
import { SERVICIOS_POR_CATEGORIA, MockService, formatPrecio } from '../data/mockServices';

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
  const servicios = SERVICIOS_POR_CATEGORIA[categoriaId];
  const [servicioSeleccionado, setServicioSeleccionado] = useState<string | null>(null);

  const handleContinuar = () => {
    if (!servicioSeleccionado) return;
    navigation.navigate('Matching', {
      categoriaId,
      categoriaNombre,
      servicioId: servicioSeleccionado,
      radioKm: 3,
      rejectionCount: 0,
      rejectedIds: [],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader title={categoriaNombre} variant="dark" />
        <Text style={styles.subtitle}>Elige el servicio que necesitas</Text>
      </View>

      <View style={styles.body}>
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

        <View style={styles.footer}>
          <Button
            label="Continuar"
            onPress={handleContinuar}
            disabled={!servicioSeleccionado}
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
