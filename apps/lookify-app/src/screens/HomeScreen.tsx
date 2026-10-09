// src/screens/HomeScreen.tsx
// Pantalla 4: Inicio. Muestra el mapa con profesionales cercanos (datos de
// ejemplo por ahora), un selector de categorías, y el botón "Solicitar ahora".
//
// Usa PROVIDER_DEFAULT (no PROVIDER_GOOGLE) para no depender de una API key
// de Google Maps todavía: en iOS usa Apple Maps, en Android el mapa del
// sistema. Cuando tengas la API key, el cambio es una sola línea (ver TODO).

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LookifyMap from '../components/LookifyMap';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import { MOCK_PROFESSIONALS, CATEGORIAS, CategoriaId } from '../data/mockProfessionals';
import { MOCK_CLIENT_LOCATION } from '../constants/geo';

// El ícono es presentación, por eso vive aquí y no en el archivo de datos
// (que mañana se reemplaza por la respuesta del backend).
const CATEGORIA_ICONOS: Record<CategoriaId, keyof typeof MaterialCommunityIcons.glyphMap> = {
  peluqueria: 'content-cut',
  barberia: 'razor-double-edge',
  maquillaje: 'lipstick',
  unas: 'hand-back-right-outline',
};

interface HomeScreenProps {
  navigation: {
    navigate: (screen: string, params?: object) => void;
  };
}

const INITIAL_COORD = {
  latitude: MOCK_CLIENT_LOCATION.latitude,
  longitude: MOCK_CLIENT_LOCATION.longitude,
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [categoriaActiva, setCategoriaActiva] = useState<CategoriaId>('peluqueria');

  const profesionalesFiltrados = MOCK_PROFESSIONALS.filter(
    (p) => p.categoria === categoriaActiva
  );

  const pins = profesionalesFiltrados.map((p) => ({
    id: p.id,
    latitude: p.latitude,
    longitude: p.longitude,
    title: `${p.nombre} · ⭐ ${p.calificacion}`,
    color: colors.navy,
  }));

  // Al tocar un pin se avanza al flujo con la categoría de ese profesional.
  const handleProPress = (id: string) => {
    const pro = MOCK_PROFESSIONALS.find((p) => p.id === id);
    if (!pro) return;
    const categoria = CATEGORIAS.find((c) => c.id === pro.categoria);
    navigation.navigate('ServiceSelection', {
      categoriaId: pro.categoria,
      categoriaNombre: categoria?.nombre,
    });
  };

  const handleSolicitar = () => {
    const categoria = CATEGORIAS.find((c) => c.id === categoriaActiva);
    navigation.navigate('ServiceSelection', {
      categoriaId: categoriaActiva,
      categoriaNombre: categoria?.nombre,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header con ubicación */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>Ubicación actual</Text>
          <Text style={styles.headerLocation}>Chapinero, Bogotá</Text>
        </View>
        <TouchableOpacity style={styles.notifButton}>
          <Text style={styles.notifIcon}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* Selector de categorías */}
      <FlatList
        data={CATEGORIAS}
        horizontal
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesList}
        contentContainerStyle={styles.categoriesRow}
        renderItem={({ item }) => {
          const active = item.id === categoriaActiva;
          return (
            <TouchableOpacity
              style={[styles.categoryChip, active && styles.categoryChipActive]}
              onPress={() => setCategoriaActiva(item.id)}
            >
              <MaterialCommunityIcons
                name={CATEGORIA_ICONOS[item.id]}
                size={20}
                color={active ? colors.white : colors.textSecondary}
              />
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                {item.nombre}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Mapa unificado (nativo: react-native-maps · web: Leaflet).
          La separación web/móvil vive en el componente, no en la pantalla:
          Metro resuelve LookifyMap.native.tsx / LookifyMap.web.tsx. */}
      <View style={styles.mapContainer}>
        <LookifyMap initial={INITIAL_COORD} pins={pins} onProPress={handleProPress} />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            {profesionalesFiltrados.length} cerca · en vivo
          </Text>
        </View>
      </View>

      {/* Resumen + acción principal */}
      <View style={styles.footer}>
        <Text style={styles.footerCount}>
          {profesionalesFiltrados.length}{' '}
          {profesionalesFiltrados.length === 1 ? 'profesional' : 'profesionales'} cerca de ti
        </Text>
        <Button label="Solicitar ahora" onPress={handleSolicitar} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 11,
    color: colors.textOnNavyMuted,
  },
  headerLocation: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    marginTop: 2,
  },
  notifButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.honey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIcon: {
    fontSize: 16,
  },
  // flexGrow: 0 evita que la lista horizontal (un ScrollView por dentro)
  // se expanda verticalmente y estire los chips.
  categoriesList: {
    flexGrow: 0,
  },
  categoriesRow: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  categoryChip: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minWidth: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.beige,
  },
  categoryChipActive: {
    backgroundColor: colors.navy,
  },
  categoryText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: colors.white,
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.honey,
  },
  liveText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    padding: spacing.lg,
  },
  footerCount: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
});
