import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { cop } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { readItems, readJson } from '@/lib/http';

/* eslint-disable react-hooks/set-state-in-effect */
import { useProLiveState } from '@/lib/proLiveState';

type Filter = 'week' | 'month' | 'all';
type Row = {
  id: number;
  serviceName: string;
  clientName: string;
  zone: string;
  total: number;
  date: string;
  rating?: number;
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Mes actual' },
  { key: 'all', label: 'Historial' },
];

// Lookify PRO - Historial de ingresos (diseño Stitch, móvil + web).
// Totales y lista desde bookings completed del profesional en Directus.
export default function Earnings() {
  const { isProfessional, authFetch } = useAuth();
  const proLive = useProLiveState();
  const pid = proLive.professionalId;
  const [filter, setFilter] = useState<Filter>('week');
  const [rows, setRows] = useState<Row[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!pid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [bk, prof] = await Promise.all([
        authFetch(
          `/items/bookings?filter[professional][_eq]=${pid}&filter[status][_eq]=completed&sort=-completed_at&limit=100&fields=*,service.*,client.*`
        ),
        authFetch(`/items/beauty_professionals/${pid}?fields=rating_avg`),
      ]);
      if (bk.ok) {
        const data = await readItems<any>(bk);
        setRows(
          data.map((b: any) => ({
            id: Number(b.id),
            serviceName: b.service?.name ?? `Servicio #${b.service}`,
            clientName: b.client?.first_name ?? 'Cliente',
            zone: b.address_text ?? 'Domicilio',
            total: Number(b.price_snapshot ?? 0),
            date: b.completed_at ?? b.created_at,
            rating: typeof b.rating === 'number' ? b.rating : undefined,
          }))
        );
      }
      if (prof.ok) {
        const data = (await readJson<any>(prof))?.data;
        setRating(typeof data?.rating_avg === 'number' ? data.rating_avg : null);
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch, pid]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const within = (iso?: string) => {
    if (filter === 'all' || !iso) return filter === 'all';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    if (filter === 'week') {
      const monday = new Date(now);
      monday.setHours(0, 0, 0, 0);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      return d >= monday;
    }
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  const visible = rows.filter((r) => within(r.date));
  const total = visible.reduce((s, r) => s + r.total, 0);
  const avg = visible.length ? total / visible.length : 0;

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const transfer = () => {
    Alert.alert(
      'Retiro de ganancias',
      `Tienes ${cop(total)} COP en este periodo. Los retiros automáticos (Wompi) están en integración: hoy la liquidación es manual los lunes.`,
      [{ text: 'Entendido' }]
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <Pressable onPress={() => router.push('/pro/profile')} style={styles.back}>
        <Text style={styles.backT}>← Mi perfil PRO</Text>
      </Pressable>
      <Text style={styles.h1}>Mis ganancias</Text>
      <Text style={styles.sub}>Resumen financiero de tus servicios completados.</Text>

      {!isProfessional || !pid ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aún no eres profesional</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/pro/profile')}>
            <Text style={styles.primaryT}>Ir a mi perfil PRO →</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <>
          <View style={[styles.card, styles.heroCard]}>
            <Text style={styles.heroLabel}>GANANCIAS ACUMULADAS</Text>
            <Text style={styles.heroTotal}>
              {cop(total)} <Text style={styles.heroCop}>COP</Text>
            </Text>
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricV}>{visible.length}</Text>
                <Text style={styles.metricL}>Servicios</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricV}>{rating !== null ? rating.toFixed(1) : '—'}</Text>
                <Text style={styles.metricL}>Calificación</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricV}>{visible.length ? cop(avg) : '—'}</Text>
                <Text style={styles.metricL}>Promedio</Text>
              </View>
            </View>
            <Pressable style={styles.transferBtn} onPress={transfer}>
              <Text style={styles.transferT}>Transferir a mi banco →</Text>
            </Pressable>
            <Text style={styles.heroNote}>Comisión Lookify 15% ya descontada · 100% de propinas para ti</Text>
          </View>

          <View style={styles.pills}>
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.pill, filter === f.key && styles.pillOn]}
              >
                <Text style={[styles.pillT, filter === f.key && styles.pillTOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>

          {visible.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.sub}>Sin servicios completados en este periodo.</Text>
            </View>
          ) : (
            visible.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.svcName}>{r.serviceName}</Text>
                    <Text style={styles.sub}>
                      {r.clientName} · {r.zone}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amount}>+{cop(r.total)}</Text>
                    <Text style={styles.sub}>{fmtDate(r.date)}</Text>
                  </View>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.done}>✓ Completado</Text>
                  {r.rating !== undefined ? <Text style={styles.sub}>★ {r.rating}.0</Text> : null}
                </View>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  back: { paddingHorizontal: 16, paddingTop: 16 },
  backT: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  h1: { fontSize: 24, fontWeight: '800', color: Stitch.colors.onSurface, paddingHorizontal: 16, paddingTop: 4 },
  sub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, paddingHorizontal: 16, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  heroCard: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: Stitch.colors.surfaceHigh },
  heroTotal: { fontSize: 32, fontWeight: '900', color: '#fff' },
  heroCop: { fontSize: 14, fontWeight: '700', color: Stitch.colors.surfaceHigh },
  heroNote: { fontSize: 11, color: Stitch.colors.surfaceHigh },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 6 },
  metric: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 },
  metricV: { fontSize: 15, fontWeight: '900', color: '#fff' },
  metricL: { fontSize: 11, color: Stitch.colors.surfaceHigh },
  transferBtn: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  transferT: { color: Stitch.colors.primaryContainer, fontWeight: '900' },
  pills: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  pill: { flex: 1, borderRadius: 12, padding: 11, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  pillT: { fontWeight: '800', fontSize: 12, color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  svcName: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  amount: { fontSize: 16, fontWeight: '900', color: Stitch.colors.onTertiaryContainer },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  done: { fontSize: 12, fontWeight: '800', color: Stitch.colors.onTertiaryContainer },
  primaryBtn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  primaryT: { color: '#fff', fontWeight: '800' },
});
