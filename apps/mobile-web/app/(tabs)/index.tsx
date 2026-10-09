import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import LookifyMap from '@/components/LookifyMap';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { fetchCategories, fetchOnlinePros, type ProWithMeta } from '@/lib/api';
import { useClientLocation } from '@/lib/useClientLocation';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

// Lookify Cliente - Inicio y Mapa (rediseño mock: header navy + chips beige +
// mapa redondeado + footer con conteo; datos reales Directus intactos).
// Ubicación real del cliente (GPS/manual/en vivo) con pin propio que sigue al GPS.
export default function HomeMap() {
  const { authFetch, user } = useAuth();
  const loc = useClientLocation();
  const pos = loc.coords;
  // Cuadrícula de ~110m para la consulta: el jitter del GPS en vivo no
  // refetchea la lista de profesionales con cada micro-movimiento. Los pines
  // siguen usando la posición exacta.
  const qLat = Math.round(pos.latitude * 1000) / 1000;
  const qLng = Math.round(pos.longitude * 1000) / 1000;
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 300);
  const [pros, setPros] = useState<ProWithMeta[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [cat, setCat] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);

  // El seguimiento en vivo se activa desde el radar (LocationGate): aquí el
  // mapa centra al usuario y muestra su fuente de ubicación real.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, p] = await Promise.all([
          fetchCategories(authFetch),
          fetchOnlinePros(authFetch, qLat, qLng, 10),
        ]);
        setCats(c);
        setPros(p);
      } catch {
        setPros([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLat, qLng]);

  const filtered = useMemo(() => {
    if (!dq) return pros;
    const needle = dq.toLowerCase();
    return pros.filter(
      (p) =>
        (p.display_name || '').toLowerCase().includes(needle) ||
        (p.specialties || '').toLowerCase().includes(needle)
    );
  }, [pros, dq]);

  const spotlight = filtered[0];
  const catList = cats.length
    ? cats
    : [{ id: 11, name: 'Uñas' }, { id: 12, name: 'Barbería' }, { id: 13, name: 'Maquillaje' }];

  return (
    <View style={styles.container}>
      {/* Header navy con ubicación + notificaciones (estilo mock) */}
      <View style={styles.header}>
        <Pressable style={styles.locBlock} onPress={() => router.push('/(tabs)/radar')}>
          <Text style={styles.headerLabel}>Ubicación actual</Text>
          <Text style={styles.headerLocation} numberOfLines={1}>
            {loc.coords.label ?? 'Soacha centro'}
          </Text>
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable style={styles.notifButton} onPress={() => router.push('/(tabs)/bookings')}>
            <Text style={styles.notifIcon}>🔔</Text>
          </Pressable>
          <View style={styles.avatar}>
            <Text style={styles.avatarT}>{(user?.first_name?.[0] || 'L').toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Buscador */}
        <View style={styles.search}>
          <Text>🔍</Text>
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar profesional o servicio..." style={styles.searchInput} placeholderTextColor="#75777e" />
        </View>

        {/* Selector de categorías (chips beige/navy, estilo mock) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesRow}>
          <Pressable style={[styles.categoryChip, !cat && styles.categoryChipActive]} onPress={() => setCat(undefined)}>
            <Text style={styles.categoryIcon}>✂️</Text>
            <Text style={[styles.categoryText, !cat && styles.categoryTextActive]}>Cabello</Text>
          </Pressable>
          {catList.map((c) => {
            const active = cat === c.id;
            return (
              <Pressable
                key={c.id}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setCat(active ? undefined : c.id)}
              >
                <Text style={styles.categoryIcon}>{catIcon(c.name)}</Text>
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Mapa redondeado */}
        <View style={styles.mapContainer}>
          <LookifyMap
            initial={pos}
            follow={loc.hasRealFix ? pos : null}
            pins={filtered.map((p) => ({
              id: String(p.id),
              latitude: p.current_lat ?? pos.latitude + 0.004,
              longitude: p.current_lng ?? pos.longitude + 0.004,
              title: p.display_name,
            }))}
            onProPress={() => router.push('/(tabs)/services')}
          />
          <View style={styles.mapBadge}>
            <View style={[styles.liveDot, loc.live && styles.liveDotOn]} />
            <Text style={styles.mapBadgeT}>
              {filtered.length} especialistas activos · {loc.live ? 'tu GPS en vivo' : loc.hasRealFix ? 'tu ubicación GPS' : '15-25 min'}
            </Text>
          </View>
        </View>

        {/* Resumen + acción principal (estilo mock) */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : spotlight ? (
          <View style={styles.sheet}>
            <Text style={styles.footerCount}>
              {filtered.length} {filtered.length === 1 ? 'profesional' : 'profesionales'} cerca de ti
            </Text>
            <View style={styles.spot}>
              <View style={styles.spotAvatar}>
                <Text style={styles.spotAvatarT}>{(spotlight.display_name?.[0] || 'L').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.spotName}>{spotlight.display_name}</Text>
                <Text style={styles.spotMeta}>
                  ★ {spotlight.rating_avg || 4.9} · {spotlight.distanceKm != null ? `${spotlight.distanceKm.toFixed(1)} km` : 'cerca'} · {spotlight.specialties || 'Corte & Styling'}
                </Text>
              </View>
            </View>
            <Pressable style={styles.cta} onPress={() => router.push('/(tabs)/services')}>
              <Text style={styles.ctaT}>Solicitar ahora</Text>
            </Pressable>
            <View style={styles.ghostRow}>
              <Pressable style={styles.ghost} onPress={() => router.push('/(tabs)/services')}>
                <Text style={styles.ghostT}>Explorar catálogo</Text>
              </Pressable>
              <Pressable style={styles.ghost} onPress={() => router.push('/(tabs)/radar')}>
                <Text style={styles.ghostT}>📡 Abrir radar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.sheet}>
            <Text style={styles.footerCount}>Sin profesionales en línea por aquí</Text>
            <Text style={styles.spotMeta}>Amplía el radio en el radar o intenta en unos minutos.</Text>
            <Pressable style={styles.cta} onPress={() => router.push('/(tabs)/radar')}>
              <Text style={styles.ctaT}>Abrir radar →</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function catIcon(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('uña')) return '💅';
  if (n.includes('barb')) return '🪒';
  if (n.includes('maquill')) return '💄';
  if (n.includes('cabello') || n.includes('pelo') || n.includes('corte')) return '✂️';
  if (n.includes('piel') || n.includes('skin') || n.includes('facial')) return '✨';
  if (n.includes('masaje')) return '💆';
  return '✨';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: Stitch.colors.primaryContainer,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locBlock: { flex: 1, paddingRight: 12 },
  headerLabel: { fontSize: 11, color: '#FFE9C2', opacity: 0.7 },
  headerLocation: { fontSize: 15, fontWeight: '600', color: '#fff', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Stitch.colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIcon: { fontSize: 16 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff22',
    borderWidth: 1,
    borderColor: '#ffffff44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarT: { color: '#fff', fontWeight: '800' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Stitch.colors.surfaceLow,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 14, color: Stitch.colors.onSurface },
  categoriesRow: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  categoryChip: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 88,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#FAF1E6',
  },
  categoryChipActive: { backgroundColor: Stitch.colors.primaryContainer },
  categoryIcon: { fontSize: 20 },
  categoryText: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, fontWeight: '500' },
  categoryTextActive: { color: '#fff' },
  mapContainer: { height: 280, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
  mapBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Stitch.colors.primaryContainer,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  mapBadgeT: { color: '#fff', fontSize: 11, fontWeight: '700' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Stitch.colors.secondaryContainer },
  liveDotOn: { backgroundColor: '#4edea3' },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    margin: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Stitch.colors.surfaceHigh,
  },
  footerCount: { fontSize: 17, fontWeight: '800', color: Stitch.colors.onSurface, marginBottom: 4 },
  spot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Stitch.colors.surfaceLow,
    borderRadius: 14,
    padding: 12,
  },
  spotAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Stitch.colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotAvatarT: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 20 },
  spotName: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  spotMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  cta: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center' },
  ctaT: { color: '#fff', fontWeight: '800', fontSize: 14 },
  ghostRow: { flexDirection: 'row', gap: 8 },
  ghost: { flex: 1, backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 12, padding: 12, alignItems: 'center' },
  ghostT: { fontWeight: '700', fontSize: 12, color: Stitch.colors.primaryContainer },
});
