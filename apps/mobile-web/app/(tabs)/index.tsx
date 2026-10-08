import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import LookifyMap from '@/components/LookifyMap';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { fetchCategories, fetchOnlinePros, type ProWithMeta } from '@/lib/api';
import { useClientLocation } from '@/lib/useClientLocation';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

// Lookify Cliente - Inicio y Mapa (diseño Stitch, móvil + web).
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

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Header Stitch: logo + ubicación + avatar */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoL}>L</Text>
          </View>
          <Pressable style={styles.locPill} onPress={() => router.push('/(tabs)/radar')}>
            <Text>📍</Text>
            <Text style={styles.locT} numberOfLines={1}>
              {loc.coords.label ?? 'Soacha centro'} · {loc.coords.latitude.toFixed(3)},{loc.coords.longitude.toFixed(3)}
            </Text>
          </Pressable>
          <View style={styles.avatar}>
            <Text style={styles.avatarT}>{(user?.first_name?.[0] || 'L').toUpperCase()}</Text>
          </View>
        </View>

        {/* Buscador */}
        <View style={styles.search}>
          <Text>🔍</Text>
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar profesional o servicio..." style={styles.searchInput} placeholderTextColor="#75777e" />
        </View>

        {/* Categorías */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
          <Pressable style={[styles.catPill, !cat && styles.catActive]} onPress={() => setCat(undefined)}>
            <Text style={[styles.catT, !cat && styles.catTActive]}>✂️ Cabello</Text>
          </Pressable>
          {(cats.length
            ? cats
            : [{ id: 11, name: 'Uñas' }, { id: 12, name: 'Barbería' }, { id: 13, name: 'Maquillaje' }]
          ).map((c) => (
            <Pressable key={c.id} style={[styles.catPill, cat === c.id && styles.catActive]} onPress={() => setCat(cat === c.id ? undefined : c.id)}>
              <Text style={[styles.catT, cat === c.id && styles.catTActive]}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Mapa (sigue tu ubicación real) */}
        <View style={styles.mapWrap}>
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

      {/* Spotlight */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 16 }} />
      ) : spotlight ? (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>⭐ {filtered.length} profesionales disponibles</Text>
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
              <Text style={styles.ctaT}>⚡ Solicitar ahora a domicilio →</Text>
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
            <Text style={styles.sheetTitle}>📡 Sin profesionales en línea por aquí</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  logoCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  logoL: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 18 },
  locPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 },
  locT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface, flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  avatarT: { color: '#fff', fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, marginHorizontal: 16, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, fontSize: 14, color: Stitch.colors.onSurface },
  cats: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  catPill: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  catActive: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  catT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  catTActive: { color: '#fff' },
  mapWrap: { height: 280, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
  mapBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.primaryContainer, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  mapBadgeT: { color: '#fff', fontSize: 11, fontWeight: '700' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Stitch.colors.secondaryContainer },
  liveDotOn: { backgroundColor: '#4edea3' },
  sheet: { backgroundColor: '#fff', borderRadius: 20, margin: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.primaryContainer },
  spot: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 14, padding: 12 },
  spotAvatar: { width: 48, height: 48, borderRadius: 12, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  spotAvatarT: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 20 },
  spotName: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  spotMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  cta: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center' },
  ctaT: { color: '#fff', fontWeight: '800', fontSize: 14 },
  ghostRow: { flexDirection: 'row', gap: 8 },
  ghost: { flex: 1, backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 12, padding: 12, alignItems: 'center' },
  ghostT: { fontWeight: '700', fontSize: 12, color: Stitch.colors.primaryContainer },
});
