import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { createBooking, fetchCategories, fetchServices } from '@/lib/api';
import { emitBookingNew } from '@/lib/socket';
import { getCurrentLatLng } from '@/lib/location';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

const FEE = 5000;

// Lookify Cliente - Selección de Servicios (diseño Stitch, móvil + web).
export default function Services() {
  const { authFetch, user } = useAuth();
  const [cats, setCats] = useState<any[]>([]);
  const [cat, setCat] = useState<number | undefined>();
  const [services, setServices] = useState<any[]>([]);
  const [q] = useState('');
  const dq = useDebouncedValue(q, 300);
  const [selected, setSelected] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories(authFetch).then(setCats).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setServices(await fetchServices(authFetch, cat));
      } catch {
        setServices(fallbackServices().filter((s) => !cat || s.catId === cat));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const list = services.filter((s) => !dq || s.name.toLowerCase().includes(dq.toLowerCase()));
  const total = (Number(selected?.price_base) || 0) + FEE;

  const book = async () => {
    const s = selected || list[0];
    if (!user || !s) return;
    setBusy(true);
    try {
      const ll = await getCurrentLatLng().catch(() => null);
      const b = await createBooking(authFetch, {
        client: user.id,
        professional: 1,
        service: typeof s.id === 'number' ? s.id : 1,
        price_snapshot: Number(s.price_base ?? 300),
        address_text: 'Ubicación actual',
        lat: ll?.latitude,
        lng: ll?.longitude,
      });
      try {
        emitBookingNew({ booking_id: b.id, professional_id: 1, service: b.service, client: user.id });
      } catch {}
      router.push(`/booking/${b.id}`);
    } catch {
      router.push('/(tabs)/radar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoL}>L</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CATÁLOGO PREMIUM</Text>
          <Text style={styles.title}>Cabello & Barbería</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable style={[styles.chip, !cat && styles.chipActive]} onPress={() => setCat(undefined)}>
          <Text style={[styles.chipT, !cat && styles.chipTActive]}>✂️ Cabello</Text>
        </Pressable>
        {(cats.length
          ? cats
          : [{ id: 11, name: 'Uñas' }, { id: 12, name: 'Barbería' }, { id: 13, name: 'Maquillaje' }]
        ).map((c) => (
          <Pressable key={c.id} style={[styles.chip, cat === c.id && styles.chipActive]} onPress={() => setCat(cat === c.id ? undefined : c.id)}>
            <Text style={[styles.chipT, cat === c.id && styles.chipTActive]}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTag}>⚡ Expertos certificados</Text>
          <Text style={styles.bannerT}>Profesionales a tu puerta</Text>
          <Text style={styles.bannerSub}>Kit completo y bioseguridad incluida.</Text>
        </View>
        <View style={styles.bannerIcon}>
          <Text style={{ fontSize: 28 }}>💈</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 170 }}>
        <Text style={styles.count}>Servicios disponibles · {list.length} opciones</Text>
        {loading && <ActivityIndicator />}
        {list.map((s) => {
          const active = selected?.id === s.id || (!selected && list[0]?.id === s.id);
          return (
            <Pressable key={s.id} onPress={() => setSelected(s)} style={[styles.card, active && styles.cardActive]}>
              <View style={styles.thumb}>
                <Text style={{ fontSize: 24 }}>{catEmoji(s)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.meta}>⏱ {s.duration_min} min · {s.category || ''}</Text>
                <Text style={styles.price}>${Number(s.price_base).toLocaleString('es-CO')}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioOn]}>
                {active && <Text style={styles.radioT}>✓</Text>}
              </View>
            </Pressable>
          );
        })}
        <View style={styles.trust}>
          <Text>🛡️</Text>
          <Text style={styles.trustT}>Garantía Lookify Clean & Safe · herramientas desinfectadas frente a ti.</Text>
        </View>
      </ScrollView>

      {/* CTA flotante Stitch */}
      <View style={styles.ctaBar}>
        <View style={styles.ctaRow}>
          <Text style={styles.ctaLabel}>Tu selección · {(selected || list[0])?.name || '—'}</Text>
          <Text style={styles.ctaFee}>🛵 Domicilio +${FEE.toLocaleString('es-CO')}</Text>
        </View>
        <Pressable style={[styles.ctaBtn, busy && { opacity: 0.7 }]} onPress={book} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaBtnT}>Continuar → ${total.toLocaleString('es-CO')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function catEmoji(s: any) {
  const c = (s.category || '').toLowerCase();
  if (c.includes('uña')) return '💅';
  if (c.includes('maquill')) return '💄';
  if (c.includes('pelu')) return '💇';
  if (c.includes('barb')) return '💈';
  return '✨';
}
function fallbackServices() {
  return [
    { id: 1, catId: 1, name: 'Corte hombre', category: 'barbería', price_base: 35000, duration_min: 40 },
    { id: 2, catId: 1, name: 'Corte mujer', category: 'peluquería', price_base: 55000, duration_min: 60 },
    { id: 3, catId: 1, name: 'Corte + Cepillado', category: 'peluquería', price_base: 60000, duration_min: 60 },
    { id: 4, catId: 12, name: 'Barbería completa', category: 'barbería', price_base: 45000, duration_min: 50 },
    { id: 5, catId: 12, name: 'Combo Corte + Barba', category: 'barbería', price_base: 70000, duration_min: 60 },
  ];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  logoCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  logoL: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 18 },
  eyebrow: { fontSize: 10, fontWeight: '800', color: Stitch.colors.secondary, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '800', color: Stitch.colors.onSurface },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  chip: { backgroundColor: Stitch.colors.surfaceLow, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  chipActive: { backgroundColor: Stitch.colors.primaryContainer },
  chipT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  chipTActive: { color: '#fff' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Stitch.colors.surfaceHigh, borderRadius: 16, marginHorizontal: 16, padding: 14 },
  bannerTag: { fontSize: 10, fontWeight: '800', color: Stitch.colors.onSecondaryContainer, backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, alignSelf: 'flex-start' },
  bannerT: { fontSize: 16, fontWeight: '800', color: Stitch.colors.primaryContainer, marginTop: 4 },
  bannerSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  bannerIcon: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 13, fontWeight: '700', color: Stitch.colors.onSurface },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  cardActive: { borderColor: Stitch.colors.primaryContainer, borderWidth: 2 },
  thumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  meta: { fontSize: 11, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  price: { fontSize: 15, fontWeight: '900', color: Stitch.colors.onSurface, marginTop: 2 },
  radio: { width: 24, height: 24, borderRadius: 12, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: Stitch.colors.primaryContainer },
  radioT: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 14 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12 },
  trustT: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, flex: 1 },
  ctaBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 14, gap: 8 },
  ctaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ctaLabel: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface, flex: 1 },
  ctaFee: { fontSize: 11, fontWeight: '800', color: Stitch.colors.secondary },
  ctaBtn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center' },
  ctaBtnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
