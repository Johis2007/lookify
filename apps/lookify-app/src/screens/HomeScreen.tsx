// src/screens/HomeScreen.tsx
// Pantalla 4: Inicio. Muestra el mapa con profesionales cercanos (datos de
// ejemplo por ahora), un selector de categorías, y el botón "Solicitar ahora".
//
// Ubicación en vivo con expo-location (sin API key de Google): si el usuario
// concede el permiso, el mapa se centra en su GPS real y dibuja su recorrido
// (Polyline) con distancia acumulada. Si lo niega, se usa el punto mock.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LookifyMap from '../components/LookifyMap';
import { confirmNative } from '../components/ConfirmDialog';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import { clearClientSession } from '../lib/backend/clientAuth';
import { MOCK_PROFESSIONALS, CATEGORIAS, CategoriaId } from '../data/mockProfessionals';
import { MOCK_CLIENT_LOCATION } from '../constants/geo';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { useRememberedPlace } from '../hooks/useRememberedPlace';
import { distanciaKm } from '../utils/geo';

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
    reset: (state: { index: number; routes: { name: string }[] }) => void;
  };
}

const INITIAL_COORD = {
  latitude: MOCK_CLIENT_LOCATION.latitude,
  longitude: MOCK_CLIENT_LOCATION.longitude,
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [categoriaActiva, setCategoriaActiva] = useState<CategoriaId>('peluqueria');

  // GPS en vivo (expo-location, 2 s / 5 m) + punto recordado (ej. Soacha).
  const { location: live, error: liveError } = useLiveLocation(true);
  const place = useRememberedPlace(live);
  const clientCoord = place.coords;

  // Recorrido propio (rastro GPS): acumula fixes en vivo, distancia en km.
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const [walkKm, setWalkKm] = useState(0);
  useEffect(() => {
    if (!live) return;
    const point = { latitude: live.latitude, longitude: live.longitude };
    setTrail((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        setWalkKm((d) => d + distanciaKm(last.latitude, last.longitude, point.latitude, point.longitude));
      }
      return [...prev.slice(-499), point];
    });
  }, [live]);

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

  // Abre el mapa en vivo con ruta por calles hacia el primer profesional
  // de la categoría activa (sin API key: OSRM + OSM).
  const handleVerRuta = () => {
    const dest = profesionalesFiltrados[0];
    navigation.navigate('LiveRoute', {
      latitude: dest?.latitude ?? MOCK_CLIENT_LOCATION.latitude + 0.01,
      longitude: dest?.longitude ?? MOCK_CLIENT_LOCATION.longitude + 0.01,
      nombre: dest ? `${dest.nombre} · ⭐ ${dest.calificacion}` : 'Destino demo',
    });
  };

  const handleLogout = async () => {
    const ok = await confirmNative(
      'Cerrar sesión',
      '¿Seguro que quieres salir de tu cuenta?',
      'Salir',
    );
    if (!ok) return;
    await clearClientSession();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header con ubicación: nombre recordado (ej. Soacha) + coords */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>Ubicación actual</Text>
          <Text style={styles.headerLocation}>
            {place.hasFix
              ? `${place.label} · ${place.coords.latitude.toFixed(5)}, ${place.coords.longitude.toFixed(5)}`
              : 'Chapinero, Bogotá'}
          </Text>
          {live ? (
            <Text style={styles.headerSub}>
              En vivo · ±{Math.round(live.accuracy ?? 0)} m · {(live.speed ?? 0).toFixed(1)} m/s
              {walkKm > 0 ? ` · ${walkKm.toFixed(2)} km` : ''}
            </Text>
          ) : place.hasFix ? (
            <Text style={styles.headerSub}>Recordada · activando GPS…</Text>
          ) : liveError ? (
            <Text style={styles.headerSub}>{liveError} · usando punto aproximado</Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.notifButton}>
            <Text style={styles.notifIcon}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
          >
            <MaterialCommunityIcons name="logout" size={18} color={colors.navy} />
          </TouchableOpacity>
        </View>
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

      {/* Mapa unificado (nativo: react-native-maps + OSM · web: Leaflet).
          La separación web/móvil vive en el componente, no en la pantalla:
          Metro resuelve LookifyMap.native.tsx / LookifyMap.web.tsx. */}
      <View style={styles.mapContainer}>
        <LookifyMap
          initial={INITIAL_COORD}
          pins={[
            // Tu punto siempre visible (en vivo, recordado o mock).
            {
              id: 'yo',
              latitude: clientCoord.latitude,
              longitude: clientCoord.longitude,
              title: place.isLive ? `Estás aquí · ${place.label}` : `${place.label} (recordada)`,
              color: colors.honey,
            },
            ...pins,
          ]}
          trail={trail}
          follow={place.hasFix ? clientCoord : null}
          onProPress={handleProPress}
        />
        <View style={styles.liveBadge}>
          <View style={[styles.liveDot, (live || place.hasFix) && styles.liveDotOn]} />
          <Text style={styles.liveText}>
            {live
              ? `En vivo · ${profesionalesFiltrados.length} cerca`
              : place.hasFix
                ? `${place.label} · ${profesionalesFiltrados.length} cerca`
                : `${profesionalesFiltrados.length} cerca · activando GPS…`}
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
        <Button label="Ver ruta en vivo" variant="outline" onPress={handleVerRuta} />
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
  headerSub: {
    fontSize: 11,
    color: colors.textOnNavyMuted,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoutButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.white,
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
    // Fondo diagnóstico: si el mapa no renderiza se ve azul claro;
    // si fallan los tiles se ve cuadrícula gris + logo Google.
    backgroundColor: '#e8edf3',
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
    backgroundColor: colors.textSecondary,
  },
  liveDotOn: {
    backgroundColor: colors.honey,
  },
  liveText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  footerCount: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
});
