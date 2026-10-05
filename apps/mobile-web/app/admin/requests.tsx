// Lookify Admin - Solicitudes en vivo (Stitch web_dashboard).
// Réplica RN: pills de filtro, inspector por caso con timeline de estado,
// acciones Aceptar/Rechazar y tracking. Socket booking:new en vivo.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AdminShell } from '@/components/AdminShell';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { attachBookingToPro, emitBookingStatus, getSocket } from '@/lib/socket';
import { patchBooking } from '@/lib/api';

const FILTERS = ['pending', 'accepted', 'in_progress', 'completed'] as const;

const PILL: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: 'rgba(254,174,44,0.2)', fg: '#6b4500', label: '● Buscando' },
  accepted: { bg: 'rgba(78,222,163,0.2)', fg: '#005236', label: '● En camino' },
  in_progress: { bg: '#0f1e36', fg: '#ffffff', label: '✂ En servicio' },
  completed: { bg: '#e7eeff', fg: '#0f1e36', label: '✓ Completado' },
  rejected: { bg: '#ffdad6', fg: '#93000a', label: '✕ Rechazado' },
};

export default function AdminRequests() {
  const { authFetch } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authFetch(
        `/items/bookings?filter[status][_eq]=${filter}&sort=-created_at&limit=30&fields=*,service.name,professional.display_name`
      );
      if (r.ok) {
        const { data } = await r.json();
        setItems(data || []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch, filter]);

  // Carga inicial + refetch al cambiar de filtro.
  useEffect(() => { load().catch(() => {}); }, [load]);

  useEffect(() => {
    try {
      const s = getSocket();
      const onNew = () => load().catch(() => {});
      s.on('booking:new', onNew);
      return () => { s.off('booking:new', onNew); };
    } catch { return undefined; }
  }, [load]);

  const act = async (id: number, status: string) => {
    await patchBooking(authFetch, id, { status: status as any });
    try {
      const current = items.find((x) => x.id === id);
      const pid = typeof current?.professional === 'object' ? current?.professional?.id : current?.professional;
      if (status === 'accepted' && pid) attachBookingToPro(id, pid);
      emitBookingStatus(id, status);
    } catch { /* noop */ }
    load().catch(() => {});
  };

  return (
    <AdminShell active="requests" title="Solicitudes en vivo" subtitle="Radar logístico activo · Bogotá D.C. · auto-actualización por socket">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => { setFilter(f); setLoading(true); }} style={[styles.pill, filter === f && styles.pillOn]}>
            <Text style={[styles.pillT, filter === f && styles.pillTOn]}>
              {f === 'pending' ? `● Buscando` : f === 'accepted' ? 'En camino' : f === 'in_progress' ? 'En servicio' : 'Completadas'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator style={{ marginTop: 30 }} /> : (
        <ScrollView
          contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().catch(() => {}); }} />}
        >
          <View style={wide ? { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } : { gap: 10 }}>
            {items.map((b) => {
              const pill = PILL[b.status] || PILL.pending;
              const svc = typeof b.service === 'object' ? b.service?.name : `Servicio #${b.service}`;
              const pro = typeof b.professional === 'object' ? b.professional?.display_name : `#${b.professional}`;
              return (
                <View key={b.id} style={[styles.case, wide && { flexBasis: '48%', flexGrow: 1 }]}>
                  <View style={styles.caseTop}>
                    <Text style={styles.caseId}>LK-{b.id}</Text>
                    <View style={[styles.status, { backgroundColor: pill.bg }]}>
                      <Text style={[styles.statusT, { color: pill.fg }]}>{pill.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.caseSvc}>{svc}</Text>
                  <Text style={styles.caseMeta}>
                    👤 {pro} · 📍 {b.address_text || 'Sin dirección'} · 🕐 {b.created_at ? new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </Text>
                  <Text style={styles.caseTotal}>${Number(b.price_snapshot || 0).toLocaleString('es-CO')} COP</Text>
                  {filter === 'pending' && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Pressable style={[styles.btn, styles.btnAccept]} onPress={() => act(b.id, 'accepted')}>
                        <Text style={styles.btnAcceptT}>✓ Aceptar</Text>
                      </Pressable>
                      <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => act(b.id, 'rejected')}>
                        <Text style={styles.btnGhostT}>Rechazar</Text>
                      </Pressable>
                    </View>
                  )}
                  <Pressable style={styles.track} onPress={() => router.push(`/booking/${b.id}` as any)}>
                    <Text style={styles.trackT}>Abrir tracking en vivo →</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {!items.length && <Text style={styles.empty}>Sin solicitudes {filter}. Todo al día. ✅</Text>}
        </ScrollView>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  pills: { gap: 8, paddingVertical: 4 },
  pill: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  pillT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  case: { backgroundColor: '#fff', borderRadius: Stitch.radius.lg, padding: 16, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  caseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caseId: { fontWeight: '800', color: Stitch.colors.primaryContainer, fontSize: 14, fontFamily: Stitch.font },
  status: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  statusT: { fontSize: 11, fontWeight: '800' },
  caseSvc: { fontSize: 16, fontWeight: '800', color: Stitch.colors.onSurface, marginTop: 8, fontFamily: Stitch.font },
  caseMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 4 },
  caseTotal: { fontSize: 15, fontWeight: '800', color: Stitch.colors.primaryContainer, marginTop: 6 },
  btn: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  btnAccept: { backgroundColor: Stitch.colors.secondaryContainer },
  btnAcceptT: { color: Stitch.colors.primaryContainer, fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  btnGhostT: { color: Stitch.colors.onSurface, fontWeight: '700' },
  track: { marginTop: 10, alignItems: 'center' },
  trackT: { color: Stitch.colors.secondary, fontWeight: '800', fontSize: 13 },
  empty: { textAlign: 'center', color: Stitch.colors.onSurfaceVariant, marginTop: 30 },
});
