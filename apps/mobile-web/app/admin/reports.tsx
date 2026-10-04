import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AdminShell } from '@/components/AdminShell';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { confirmNative } from '@/components/ConfirmDialog';

/* eslint-disable react-hooks/set-state-in-effect */

type Tab = 'reports' | 'reviews' | 'resolved';

type Incident = {
  id: number;
  reason: string;
  serviceName: string;
  clientName: string;
  proName: string;
  proUserId?: string;
  total: number;
  createdAt?: string;
};

type Review = {
  id: number;
  rating: number;
  comment?: string;
  clientName: string;
  proName: string;
  bookingId?: number;
  createdAt?: string;
};

// Lookify Admin - Reportes y reseñas (diseño Stitch, móvil + web).
// - Reportes: reservas canceladas (motivo real) con dossier, línea de tiempo
//   (booking_events) y acciones (ver reserva, reembolso manual, suspender pro).
// - Reseñas: moderación real (eliminar o mantener).
// - Resueltos: completadas recientes.
export default function AdminReports() {
  const { authFetch } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [tab, setTab] = useState<Tab>('reports');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [resolved, setResolved] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Incident | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const autoPicked = useRef(false);

  const load = useCallback(async () => {
    try {
      const [canc, rev, done] = await Promise.all([
        authFetch('/items/bookings?filter[status][_eq]=cancelled&sort=-created_at&limit=30&fields=*,service.*,client.*,professional.*'),
        authFetch('/items/reviews?sort=-created_at&limit=30&fields=*,client.*,professional.*,booking.*'),
        authFetch('/items/bookings?filter[status][_eq]=completed&sort=-completed_at&limit=20&fields=id,price_snapshot,completed_at,service.*,client.*,professional.*'),
      ]);
      if (canc.ok) {
        const { data } = await canc.json();
        const rows = (Array.isArray(data) ? data : []).map((b: any) => ({
          id: Number(b.id),
          reason: b.cancel_reason || 'Sin motivo registrado',
          serviceName: b.service?.name ?? `Servicio #${b.service}`,
          clientName: b.client?.first_name || b.client?.email || 'Cliente',
          proName: b.professional?.display_name || 'Sin asignar',
          proUserId: b.professional?.user,
          total: Number(b.price_snapshot) || 0,
          createdAt: b.created_at,
        }));
        setIncidents(rows);
        if (!autoPicked.current && rows.length) {
          autoPicked.current = true;
          setSelected(rows[0]);
        }
      }
      if (rev.ok) {
        const { data } = await rev.json();
        setReviews(
          (Array.isArray(data) ? data : []).map((r: any) => ({
            id: Number(r.id),
            rating: Number(r.rating) || 0,
            comment: r.comment,
            clientName: r.client?.first_name || r.client?.email || 'Cliente',
            proName: r.professional?.display_name || 'Profesional',
            bookingId: typeof r.booking === 'object' ? r.booking?.id : r.booking,
            createdAt: r.created_at,
          }))
        );
      }
      if (done.ok) {
        const { data } = await done.json();
        setResolved(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const loadEvents = useCallback(async (bookingId: number) => {
    setEvents([]);
    try {
      const r = await authFetch(
        `/items/booking_events?filter[booking][_eq]=${bookingId}&sort=-created_at&limit=20&fields=status,note,created_at`
      );
      if (r.ok) {
        const { data } = await r.json();
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      /* sin eventos */
    }
  }, [authFetch]);

  useEffect(() => {
    if (selected) loadEvents(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const pick = (i: Incident) => {
    setSelected(i);
  };

  const refund = () => {
    if (!selected) return;
    Alert.alert(
      'Reembolso',
      `Reembolso manual de ${cop(selected.total)} por LK-${selected.id}. Sin pasarela integrada: procésalo en Wompi/MercadoPago.`,
      [{ text: 'Entendido' }]
    );
  };

  const suspendPro = async () => {
    if (!selected?.proUserId) {
      setMsg('Esta reserva no tiene profesional asignado.');
      return;
    }
    const ok = await confirmNative(
      'Suspender profesional',
      `${selected.proName} no podrá recibir solicitudes hasta reactivarlo. ¿Continuar?`,
      'Suspender'
    );
    if (!ok) return;
    const r = await authFetch(`/users/${selected.proUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'suspended' }),
    });
    setMsg(r.ok ? 'Profesional suspendido.' : 'Sin permiso (requiere admin en Directus).');
  };

  const moderateReview = async (id: number, hide: boolean) => {
    if (!hide) {
      setDismissed((d) => new Set(d).add(id));
      return;
    }
    const ok = await confirmNative('Ocultar reseña', 'Se eliminará definitivamente. ¿Continuar?', 'Eliminar');
    if (!ok) return;
    const r = await authFetch(`/items/reviews/${id}`, { method: 'DELETE' });
    if (r.ok || r.status === 204) {
      setReviews((rs) => rs.filter((x) => x.id !== id));
      setMsg('Reseña eliminada.');
    } else {
      setMsg('Sin permiso para moderar (requiere admin en Directus).');
    }
  };

  const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
  const liveReviews = reviews.filter((r) => !dismissed.has(r.id));

  const TABS: { key: Tab; label: string }[] = [
    { key: 'reports', label: `Reportes abiertos (${incidents.length})` },
    { key: 'reviews', label: `Reseñas (${liveReviews.length})` },
    { key: 'resolved', label: `Resueltos (${resolved.length})` },
  ];

  return (
    <AdminShell active="reports" title="Reportes y reseñas" subtitle="Incidencias, moderación y auditoría de calificaciones">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {TABS.map((f) => (
          <Pressable key={f.key} onPress={() => setTab(f.key)} style={[styles.pill, tab === f.key && styles.pillOn]}>
            <Text style={[styles.pillT, tab === f.key && styles.pillTOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : tab === 'reviews' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {liveReviews.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{r.proName} · ★ {r.rating}.0</Text>
                <Text style={styles.rowSub}>por {r.clientName}</Text>
              </View>
              {r.comment ? <Text style={styles.quote}>“{r.comment}”</Text> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => moderateReview(r.id, true)}>
                  <Text style={styles.btnDangerT}>Ocultar reseña</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => moderateReview(r.id, false)}>
                  <Text style={styles.btnGhostT}>Mantener</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {liveReviews.length === 0 ? <Text style={styles.empty}>Sin reseñas por moderar. 🎉</Text> : null}
        </ScrollView>
      ) : tab === 'resolved' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {resolved.map((b: any) => {
            const svc = typeof b.service === 'object' ? b.service?.name : `Servicio #${b.service}`;
            return (
              <View key={b.id} style={styles.card}>
                <Text style={styles.rowTitle}>LK-{b.id} · {svc}</Text>
                <Text style={styles.rowSub}>
                  {cop(Number(b.price_snapshot) || 0)} ·{' '}
                  {b.completed_at ? new Date(b.completed_at).toLocaleDateString('es-CO') : '—'}
                </Text>
              </View>
            );
          })}
          {resolved.length === 0 ? <Text style={styles.empty}>Sin casos resueltos aún.</Text> : null}
        </ScrollView>
      ) : (
        <View style={wide ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } : { gap: 12 }}>
          <View style={{ flex: wide ? 2 : undefined, gap: 10 }}>
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            >
              {incidents.map((i) => {
                const on = selected?.id === i.id;
                return (
                  <Pressable key={i.id} onPress={() => pick(i)} style={[styles.row, on && styles.rowOn]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>LK-{i.id} · {i.serviceName}</Text>
                      <Text style={styles.rowSub}>{i.clientName} → {i.proName}</Text>
                      <Text style={styles.reason} numberOfLines={1}>“{i.reason}”</Text>
                    </View>
                    <Text style={styles.rowTotal}>{cop(i.total)}</Text>
                  </Pressable>
                );
              })}
              {incidents.length === 0 ? <Text style={styles.empty}>Sin reportes abiertos. 🎉</Text> : null}
            </ScrollView>
          </View>
          <View style={{ flex: wide ? 3 : undefined }}>
            {!selected ? (
              <Text style={styles.empty}>Selecciona un reporte.</Text>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Incidencia LK-{selected.id}</Text>
                <Text style={styles.rowSub}>
                  {selected.serviceName} · {selected.clientName} → {selected.proName}
                </Text>
                <Text style={styles.quote}>“{selected.reason}”</Text>
                <Text style={styles.cardTitle}>Traza (booking_events)</Text>
                {events.length === 0 ? (
                  <Text style={styles.rowSub}>Sin eventos registrados.</Text>
                ) : (
                  events.map((e: any, k: number) => (
                    <Text key={k} style={styles.rowSub}>
                      • {e.status}
                      {e.note ? ` — ${e.note}` : ''}
                      {e.created_at ? ` (${new Date(e.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}
                    </Text>
                  ))
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => router.push(`/booking/${selected.id}` as any)}>
                    <Text style={styles.btnGhostT}>Ver reserva →</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable style={[styles.btn, styles.btnWarn]} onPress={refund}>
                    <Text style={styles.btnWarnT}>Reembolsar {cop(selected.total)}</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, styles.btnDanger]} onPress={suspendPro}>
                    <Text style={styles.btnDangerT}>Suspender pro</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  pills: { gap: 8, paddingVertical: 4 },
  pill: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: Stitch.colors.surfaceHigh },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer },
  pillT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  msg: { color: Stitch.colors.secondary, fontWeight: '700', fontSize: 12, marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 14, gap: 8, marginTop: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Stitch.colors.onSurface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 12 },
  rowOn: { borderColor: Stitch.colors.secondaryContainer, borderWidth: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  rowSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  rowTotal: { fontSize: 14, fontWeight: '900', color: Stitch.colors.onSurface },
  reason: { fontSize: 12, fontStyle: 'italic', color: Stitch.colors.onSurfaceVariant },
  quote: { fontSize: 13, fontStyle: 'italic', color: Stitch.colors.onSurface, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 10, padding: 10 },
  empty: { color: Stitch.colors.onSurfaceVariant, textAlign: 'center', marginTop: 20 },
  btn: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, backgroundColor: '#fff' },
  btnGhostT: { fontWeight: '700', color: Stitch.colors.onSurface },
  btnDanger: { backgroundColor: Stitch.colors.errorContainer },
  btnDangerT: { fontWeight: '800', color: Stitch.colors.onErrorContainer },
  btnWarn: { backgroundColor: Stitch.colors.surfaceLow, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  btnWarnT: { fontWeight: '800', color: Stitch.colors.onSurface },
});
