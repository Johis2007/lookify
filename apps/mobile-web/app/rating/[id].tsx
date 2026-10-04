import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { createReview } from '@/lib/api';

const COMPLIMENTS = ['Puntual', 'Higiene impecable', 'Técnica experta', 'Muy amable', 'Protocolo seguro'];
const TIPS = [0, 3000, 5000, 10000];

// Lookify Cliente - Calificación y Resumen (diseño Stitch, móvil + web).
export default function Rating() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { authFetch, user } = useAuth();
  const [booking, setBooking] = useState<any>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [picks, setPicks] = useState<string[]>(['Higiene impecable', 'Técnica experta']);
  const [tip, setTip] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await authFetch(`/items/bookings/${id}?fields=*,service.*,professional.*`);
      if (r.ok) {
        const { data } = await r.json();
        setBooking(data);
        if (data.rating) {
          setStars(data.rating);
          setDone(true);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const togglePick = (c: string) =>
    setPicks((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const submit = async () => {
    if (!booking || !user) return;
    setBusy(true);
    try {
      const proId = typeof booking.professional === 'object' ? booking.professional?.id : booking.professional;
      await createReview(authFetch, {
        booking: Number(id),
        client: user.id,
        professional: proId,
        rating: stars,
        comment: `${comment}${picks.length ? ` [${picks.join(', ')}]` : ''}${tip ? ` (propina $${tip})` : ''}`,
      });
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  if (!booking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Cargando resumen…</Text>
      </View>
    );
  }
  const svc = typeof booking.service === 'object' ? booking.service : null;
  const proName = booking.professional?.display_name || 'Tu profesional';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      {/* Celebración */}
      <View style={styles.hero}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkT}>✓</Text>
        </View>
        <Text style={styles.heroTag}>SERVICIO COMPLETADO CON ÉXITO</Text>
        <Text style={styles.heroTitle}>¡Tu look quedó impecable!</Text>
      </View>

      {/* Pro capsule */}
      <View style={styles.card}>
        <View style={styles.proAvatar}>
          <Text style={styles.proAvatarT}>{(proName?.[0] || 'L').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.proName}>{proName}</Text>
          <Text style={styles.proMeta}>★ 4.95 · 148 servicios · Verificada ✓</Text>
        </View>
      </View>

      {/* Recibo */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧾 Resumen del cobro</Text>
        <View style={styles.fareRow}>
          <Text style={styles.fareL}>{svc?.name || 'Servicio Lookify'}</Text>
          <Text style={styles.fareV}>${Number(booking.price_snapshot || 0).toLocaleString('es-CO')}</Text>
        </View>
        <View style={styles.fareRow}>
          <Text style={styles.fareL}>Domicilio</Text>
          <Text style={styles.fareV}>$5.000</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalT}>Total cobrado · {booking.payment_method || 'efectivo'}</Text>
        </View>
      </View>

      {/* Rating */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>¿Cómo estuvo tu servicio?</Text>
        <Text style={styles.descriptor}>{starLabel(stars)}</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Pressable key={i} onPress={() => !done && setStars(i)}>
              <Text style={[styles.star, i <= stars && styles.starOn]}>★</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.miniLabel}>Destacados:</Text>
        <View style={styles.pills}>
          {COMPLIMENTS.map((c) => {
            const on = picks.includes(c);
            return (
              <Pressable key={c} onPress={() => !done && togglePick(c)} style={[styles.pill, on && styles.pillOn]}>
                <Text style={[styles.pillT, on && styles.pillTOn]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
        {!done && (
          <TextInput
            style={styles.input}
            placeholder="Cuéntanos: puntualidad, calidad, trato…"
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
            placeholderTextColor="#75777e"
          />
        )}
        {done && !!comment && <Text style={styles.doneComment}>{comment}</Text>}

        <Text style={styles.miniLabel}>Propina (100% para la profesional):</Text>
        <View style={styles.tips}>
          {TIPS.map((t) => (
            <Pressable key={t} onPress={() => !done && setTip(t)} style={[styles.tip, tip === t && styles.tipOn]}>
              <Text style={[styles.tipT, tip === t && styles.tipTOn]}>{t === 0 ? 'No' : `+$${t.toLocaleString('es-CO')}`}</Text>
            </Pressable>
          ))}
        </View>

        {!done ? (
          <Pressable style={[styles.submit, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#0f1e36" /> : <Text style={styles.submitT}>Enviar calificación y finalizar →</Text>}
          </Pressable>
        ) : (
          <Text style={styles.thanks}>¡Gracias por tu valoración! ✨</Text>
        )}
        <Pressable style={styles.ghost} onPress={() => router.replace('/(tabs)/bookings')}>
          <Text style={styles.ghostT}>Volver a mis reservas</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function starLabel(s: number) {
  return { 1: 'Podría mejorar', 2: 'Detalles por mejorar', 3: 'Buen servicio', 4: '¡Muy buen servicio!', 5: '¡Excelente servicio!' }[s] || '';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hero: { alignItems: 'center', gap: 6, paddingTop: 24, paddingHorizontal: 20 },
  checkCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  checkT: { color: Stitch.colors.secondaryContainer, fontSize: 30, fontWeight: '900' },
  heroTag: { fontSize: 10, fontWeight: '800', color: Stitch.colors.onTertiaryContainer, letterSpacing: 1 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: Stitch.colors.onSurface, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  proAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  proAvatarT: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 20 },
  proName: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  proMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  fareL: { fontSize: 13, color: Stitch.colors.onSurfaceVariant },
  fareV: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  totalRow: { backgroundColor: Stitch.colors.surfaceLow, borderRadius: 10, padding: 10, marginTop: 4 },
  totalT: { fontSize: 12, fontWeight: '800', color: Stitch.colors.onTertiaryContainer },
  descriptor: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  star: { fontSize: 38, color: '#d8e3fb' },
  starOn: { color: Stitch.colors.secondaryContainer },
  miniLabel: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Stitch.colors.surfaceContainer },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer },
  pillT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 12, minHeight: 70, textAlignVertical: 'top', backgroundColor: Stitch.colors.surfaceLow, fontSize: 14 },
  doneComment: { textAlign: 'center', fontStyle: 'italic', color: Stitch.colors.onSurfaceVariant },
  tips: { flexDirection: 'row', gap: 8 },
  tip: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: Stitch.colors.surfaceContainer },
  tipOn: { backgroundColor: Stitch.colors.secondaryContainer },
  tipT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  tipTOn: { color: Stitch.colors.primaryContainer, fontWeight: '900' },
  submit: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  submitT: { color: Stitch.colors.primaryContainer, fontWeight: '900', fontSize: 15 },
  thanks: { textAlign: 'center', fontSize: 15, fontWeight: '800', color: Stitch.colors.onTertiaryContainer, marginTop: 8 },
  ghost: { alignItems: 'center', padding: 10 },
  ghostT: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
});
