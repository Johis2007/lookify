import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { createReview } from '@/lib/api';
import { readJson } from '@/lib/http';

const COMPLIMENTS = ['Puntual', 'Higiene impecable', 'Técnica experta', 'Muy amable', 'Protocolo seguro'];
const TIPS = [0, 3000, 5000, 10000];
const MAX_COMMENT = 280;
const PAY_METHODS = ['efectivo', 'tarjeta', 'nequi'] as const;

// Lookify Cliente - Pago y Calificación (rediseño mock: fondo beige + hoja
// blanca con acento honey superior, resumen de pago en bloque beige,
// estrellas grandes + comentario con contador; lógica Directus intacta).
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch(`/items/bookings/${id}?fields=*,service.*,professional.*`);
        if (r.ok) {
          const data = (await readJson<{ data?: any }>(r))?.data;
          if (data) {
            setBooking(data);
            if (data.rating) {
              setStars(data.rating);
              setDone(true);
            }
          }
        }
      } catch {
        /* sin red: queda cargando */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const togglePick = (c: string) =>
    setPicks((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const submit = async () => {
    if (!booking || !user) return;
    setBusy(true);
    setError(null);
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
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar. Revisa tu conexión.');
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
  const svcName = svc?.name || 'Servicio Lookify';
  const priceSvc = Number(booking.price_snapshot || 0);
  const priceDom = 5000;
  const priceTotal = priceSvc + priceDom;
  const payMethod: string = booking.payment_method || 'efectivo';
  const cop = (n: number) => `$${n.toLocaleString('es-CO')}`;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetAccent} />

          {/* Éxito (estilo mock) */}
          <View style={styles.checkCircle}>
            <Text style={styles.checkT}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Servicio finalizado</Text>
          <Text style={styles.successSubtitle}>
            {svcName} · {proName}
          </Text>

          {/* Resumen de pago */}
          <Text style={styles.sectionTitle}>Resumen de pago</Text>
          <View style={styles.priceBlock}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Servicio ({svcName})</Text>
              <Text style={styles.priceValue}>{cop(priceSvc)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Domicilio</Text>
              <Text style={styles.priceValue}>{cop(priceDom)}</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>Total</Text>
              <Text style={styles.priceTotalValue}>{cop(priceTotal)}</Text>
            </View>
          </View>

          {/* Método de pago (solo lectura: viene de la reserva) */}
          <Text style={styles.sectionTitle}>Método de pago</Text>
          <View style={styles.payRow}>
            {PAY_METHODS.map((m) => {
              const on = payMethod === m;
              return (
                <View key={m} style={[styles.payPill, on && styles.payPillOn]}>
                  <Text style={[styles.payT, on && styles.payTOn]}>
                    {m === 'efectivo' ? '💵 Efectivo' : m === 'tarjeta' ? '💳 Tarjeta' : '📱 Nequi'}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.payHint}>Cobro registrado como {payMethod}</Text>

          {/* Pro capsule */}
          <View style={styles.proRow}>
            <View style={styles.proAvatar}>
              <Text style={styles.proAvatarT}>{(proName?.[0] || 'L').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.proName}>{proName}</Text>
              <Text style={styles.proMeta}>★ 4.95 · 148 servicios · Verificada ✓</Text>
            </View>
          </View>

          {/* Calificación */}
          <Text style={styles.sectionTitle}>¿Cómo fue tu experiencia?</Text>
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

          <View style={styles.commentBlock}>
            {!done ? (
              <TextInput
                style={styles.input}
                placeholder="Cuéntanos cómo te fue…"
                value={comment}
                onChangeText={setComment}
                maxLength={MAX_COMMENT}
                multiline
                numberOfLines={4}
                placeholderTextColor="#75777e"
              />
            ) : (
              !!comment && <Text style={styles.doneComment}>{comment}</Text>
            )}
            <Text style={styles.charCount}>
              {comment.length}/{MAX_COMMENT}
            </Text>
          </View>

          <Text style={styles.miniLabel}>Propina (100% para la profesional):</Text>
          <View style={styles.tips}>
            {TIPS.map((t) => (
              <Pressable key={t} onPress={() => !done && setTip(t)} style={[styles.tip, tip === t && styles.tipOn]}>
                <Text style={[styles.tipT, tip === t && styles.tipTOn]}>{t === 0 ? 'No' : `+$${t.toLocaleString('es-CO')}`}</Text>
              </Pressable>
            ))}
          </View>

          {!done ? (
            <Pressable
              style={[styles.submit, (busy || stars < 1) && { opacity: 0.55 }]}
              onPress={submit}
              disabled={busy || stars < 1}
            >
              {busy ? (
                <ActivityIndicator color="#0f1e36" />
              ) : (
                <Text style={styles.submitT}>Enviar calificación</Text>
              )}
            </Pressable>
          ) : (
            <Text style={styles.thanks}>¡Gracias por tu valoración! ✨</Text>
          )}
          {error && !done ? <Text style={styles.err}>{error}</Text> : null}
          <Pressable style={styles.ghost} onPress={() => router.replace('/(tabs)/bookings')}>
            <Text style={styles.ghostT}>Volver a mis reservas</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function starLabel(s: number) {
  return { 1: 'Podría mejorar', 2: 'Detalles por mejorar', 3: 'Buen servicio', 4: '¡Muy buen servicio!', 5: '¡Excelente servicio!' }[s] || '';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F1E8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 32 },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
  },
  sheetAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: Stitch.colors.secondaryContainer,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Stitch.colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 8,
  },
  checkT: { color: Stitch.colors.primaryContainer, fontSize: 28, fontWeight: '900' },
  successTitle: { fontSize: 19, fontWeight: '800', color: Stitch.colors.onSurface, textAlign: 'center', marginTop: 12 },
  successSubtitle: { fontSize: 14, color: Stitch.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Stitch.colors.onSurface, marginBottom: 8, marginTop: 12 },
  priceBlock: { backgroundColor: '#FAF3E8', borderRadius: 12, padding: 14 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  priceLabel: { flex: 1, fontSize: 13, color: Stitch.colors.onSurfaceVariant, paddingRight: 8 },
  priceValue: { fontSize: 14, color: Stitch.colors.onSurface, fontWeight: '500' },
  priceDivider: { height: 1, backgroundColor: Stitch.colors.surfaceHigh, marginVertical: 8 },
  priceTotalLabel: { fontSize: 15, fontWeight: '700', color: Stitch.colors.primaryContainer },
  priceTotalValue: { fontSize: 16, fontWeight: '700', color: Stitch.colors.primaryContainer },
  payRow: { flexDirection: 'row', gap: 8 },
  payPill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Stitch.colors.surfaceContainer,
  },
  payPillOn: { backgroundColor: Stitch.colors.primaryContainer },
  payT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  payTOn: { color: '#fff' },
  payHint: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 8, marginBottom: 4 },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  proAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Stitch.colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proAvatarT: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 20 },
  proName: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  proMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  descriptor: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  star: { fontSize: 38, color: '#d8e3fb' },
  starOn: { color: Stitch.colors.secondaryContainer },
  miniLabel: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, marginTop: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Stitch.colors.surfaceContainer },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer },
  pillT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  commentBlock: { marginTop: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: Stitch.colors.surfaceHigh,
    borderRadius: 12,
    padding: 12,
    minHeight: 96,
    textAlignVertical: 'top',
    backgroundColor: Stitch.colors.surfaceLow,
    fontSize: 14,
    color: Stitch.colors.onSurface,
  },
  doneComment: { textAlign: 'center', fontStyle: 'italic', color: Stitch.colors.onSurfaceVariant },
  charCount: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, textAlign: 'right', marginTop: 4 },
  tips: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tip: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: Stitch.colors.surfaceContainer },
  tipOn: { backgroundColor: Stitch.colors.secondaryContainer },
  tipT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  tipTOn: { color: Stitch.colors.primaryContainer, fontWeight: '900' },
  submit: {
    backgroundColor: Stitch.colors.secondaryContainer,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  submitT: { color: Stitch.colors.primaryContainer, fontWeight: '900', fontSize: 15 },
  thanks: { textAlign: 'center', fontSize: 15, fontWeight: '800', color: Stitch.colors.onTertiaryContainer, marginTop: 12 },
  err: { textAlign: 'center', fontSize: 13, fontWeight: '700', color: Stitch.colors.error, marginTop: 8 },
  ghost: { alignItems: 'center', padding: 10 },
  ghostT: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
});
