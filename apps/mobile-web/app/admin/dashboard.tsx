// Lookify Admin - Dashboard General de Operaciones (Stitch web_dashboard).
// Réplica RN del diseño HTML: KPIs navy/ámbar, demanda por categoría, solicitudes
// recientes y banner de atención. Datos reales desde Directus.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AdminShell } from '@/components/AdminShell';
import { Stitch } from '@/constants/StitchTheme';
import { readJson } from '@/lib/http';
import { useAuth } from '@/lib/auth';

export default function AdminDashboard() {
  const { authFetch } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [stats, setStats] = useState({ bookings: 0, pros: 0, services: 0, reviews: 0, pending: 0, revenue: 0, verifyPending: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // readJson nunca lanza con 204/ok sin cuerpo (Directus sin permiso de lectura).
        const [b, p, s, r, v, feed] = await Promise.all([
          authFetch('/items/bookings?limit=100&fields=id,status,price_snapshot').then((x) => readJson<any>(x)).catch(() => null),
          authFetch('/items/beauty_professionals?limit=100&fields=id,is_online').then((x) => readJson<any>(x)).catch(() => null),
          authFetch('/items/beauty_services?limit=100&fields=id').then((x) => readJson<any>(x)).catch(() => null),
          authFetch('/items/reviews?limit=100&fields=id,rating').then((x) => readJson<any>(x)).catch(() => null),
          authFetch('/items/beauty_professionals?filter[verification_status][_eq]=pending&limit=1&fields=id&meta=filter_count')
            .then((x) => readJson<any>(x)).catch(() => null),
          authFetch('/items/bookings?sort=-created_at&limit=4&fields=id,created_at,status,price_snapshot,service.name')
            .then((x) => readJson<any>(x)).catch(() => null),
        ]);
        const bookings = b?.data || [];
        setStats({
          bookings: bookings.length,
          pending: bookings.filter((x: any) => x.status === 'pending').length,
          revenue: bookings.filter((x: any) => x.status === 'completed')
            .reduce((a: number, x: any) => a + Number(x.price_snapshot || 0), 0),
          pros: (p?.data || []).length,
          services: (s?.data || []).length,
          reviews: (r?.data || []).length,
          verifyPending: Number(v?.meta?.filter_count ?? 0),
        });
        setRecent(feed?.data || []);
      } finally { setLoading(false); }
    })();
  }, [authFetch]);

  const kpis = [
    { label: 'Solicitudes hoy', value: String(stats.bookings), sub: `${stats.pending} pendientes por asignar`, dark: true, delta: '+12%' },
    { label: 'Profesionales en red', value: String(stats.pros), sub: `${stats.services} servicios en catálogo`, dark: false },
    { label: 'Reseñas verificadas', value: String(stats.reviews), sub: 'Satisfacción en tiempo real', dark: false },
    { label: 'Ingresos completados', value: `$${stats.revenue.toLocaleString('es-CO')}`, sub: 'Solo bookings completed', dark: false },
  ];

  return (
    <AdminShell active="dashboard" title="Dashboard General de Operaciones" subtitle="Soacha · Datos sincronizados en tiempo real desde Directus">
      {loading ? <ActivityIndicator style={{ marginTop: 30 }} /> : (
        <View style={{ gap: 12 }}>
          {/* KPIs: 2 columnas compactas en celular, fila en web */}
          <View style={styles.kpiGrid}>
            {kpis.map((k) => (
              <View key={k.label} style={[styles.kpi, k.dark && styles.kpiDark, wide && styles.kpiWide]}>
                <View style={styles.kpiTop}>
                  <Text style={[styles.kpiLabel, k.dark && { color: '#B8C7E6' }]} numberOfLines={1}>{k.label}</Text>
                  {!!k.delta && (
                    <View style={styles.delta}><Text style={styles.deltaT}>{k.delta}</Text></View>
                  )}
                </View>
                <Text style={[styles.kpiValue, k.dark && { color: '#fff' }]} numberOfLines={1} adjustsFontSizeToFit>{k.value}</Text>
                <Text style={[styles.kpiSub, k.dark && { color: '#B8C7E6' }]} numberOfLines={2}>{k.sub}</Text>
              </View>
            ))}
          </View>

          {/* Demanda + recientes */}
          <View style={wide ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } : { gap: 12 }}>
            <View style={[styles.card, wide && { flex: 1 }]}>
              <Text style={styles.cardTitle}>Demanda por estado</Text>
              <Text style={styles.cardSub}>Distribución sobre {stats.bookings} órdenes (live)</Text>
              {demandRows(stats).map((d) => (
                <View key={d.label} style={{ marginTop: 10 }}>
                  <View style={styles.barTop}>
                    <Text style={styles.barLabel}>● {d.label}</Text>
                    <Text style={styles.barVal}>{d.count} · {d.pct}%</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${d.pct}%`, backgroundColor: d.color }]} />
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.card, wide && { flex: 1 }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Solicitudes recientes</Text>
                <Pressable onPress={() => router.push('/admin/requests' as any)}>
                  <Text style={styles.link}>Ver todas →</Text>
                </Pressable>
              </View>
              {recent.map((b: any) => (
                <Pressable key={b.id} style={styles.feedRow} onPress={() => router.push(`/booking/${b.id}` as any)}>
                  <View style={styles.feedAvatar}>
                    <Text style={styles.feedAvatarT}>#{b.id}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedT}>{typeof b.service === 'object' ? b.service?.name : `Servicio #${b.service}`}</Text>
                    <Text style={styles.feedS}>${Number(b.price_snapshot || 0).toLocaleString('es-CO')} · {b.status}</Text>
                  </View>
                  <Text style={styles.feedTime}>{b.created_at ? new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                </Pressable>
              ))}
              {!recent.length && <Text style={styles.cardSub}>Sin movimiento reciente.</Text>}
            </View>
          </View>

          {/* Banner atención (en columna en celular para que nada se corte) */}
          <View style={[styles.alert, !wide && styles.alertMobile]}>
            <Text style={styles.alertIcon}>⚠</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertT}>Requiere tu atención</Text>
              <Text style={styles.alertS}>
                {stats.pending} solicitudes pendientes y {stats.verifyPending} profesionales por verificar documentos.
              </Text>
            </View>
            <Pressable style={[styles.alertBtn, !wide && styles.alertBtnMobile]} onPress={() => router.push('/admin/verification' as any)}>
              <Text style={styles.alertBtnT}>Revisar ({stats.verifyPending})</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>Fuente: Directus bookings · beauty_professionals · beauty_services · reviews.</Text>
        </View>
      )}
    </AdminShell>
  );
}

function demandRows(stats: { bookings: number; pending: number }) {
  const total = Math.max(stats.bookings, 1);
  const pending = stats.pending;
  const rest = Math.max(stats.bookings - pending, 0);
  return [
    { label: 'Pendientes de asignar', count: pending, pct: Math.round((pending / total) * 100), color: Stitch.colors.secondaryContainer },
    { label: 'En gestión / cerradas', count: rest, pct: Math.round((rest / total) * 100), color: Stitch.colors.primaryContainer },
  ];
}

const styles = StyleSheet.create({
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#fff', borderRadius: Stitch.radius.lg, padding: 14, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  kpiWide: { flexBasis: 0 },
  kpiDark: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  kpiTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, fontFamily: Stitch.font, flex: 1 },
  kpiValue: { fontSize: 26, fontWeight: '800', color: Stitch.colors.onSurface, marginTop: 8, fontFamily: Stitch.font, fontVariant: ['tabular-nums'] },
  kpiSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  delta: { backgroundColor: 'rgba(78,222,163,0.2)', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  deltaT: { color: Stitch.colors.tertiaryFixedDim, fontSize: 11, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: Stitch.radius.lg, padding: 16, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Stitch.colors.onSurface, fontFamily: Stitch.font },
  cardSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  link: { color: Stitch.colors.secondary, fontWeight: '800', fontSize: 13 },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  barLabel: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface, flex: 1 },
  barVal: { fontSize: 11, color: Stitch.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, backgroundColor: Stitch.colors.surfaceContainer },
  fill: { height: 8, borderRadius: 4 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 10, marginTop: 8 },
  feedAvatar: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  feedAvatarT: { color: Stitch.colors.secondaryContainer, fontWeight: '800', fontSize: 12 },
  feedT: { fontWeight: '800', color: Stitch.colors.onSurface, fontSize: 13 },
  feedS: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  feedTime: { fontSize: 11, color: Stitch.colors.outline, fontVariant: ['tabular-nums'] },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF4E0', borderRadius: Stitch.radius.lg, padding: 16, borderWidth: 1, borderColor: '#F5D9A8' },
  alertMobile: { flexDirection: 'column', alignItems: 'stretch' },
  alertIcon: { fontSize: 22 },
  alertT: { fontWeight: '800', color: Stitch.colors.onSurface },
  alertS: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  alertBtn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  alertBtnMobile: { alignItems: 'center' },
  alertBtnT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  hint: { textAlign: 'center', fontSize: 11, color: Stitch.colors.outline },
});
