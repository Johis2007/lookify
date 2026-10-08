import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { fetchMyBookings } from '@/lib/api';

// Lookify Cliente - Mis reservas (solo cuentas cliente: sin métricas ni admin).
export default function Bookings() {
  const { authFetch, user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await fetchMyBookings(authFetch, user.id, null);
      const mine = rows.filter((b: any) => {
        const c = typeof b.client === 'object' ? b.client?.id : b.client;
        return String(c) === String(user.id);
      });
      setItems(mine.length ? mine : rows.slice(0, 10));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, authFetch]);

  // Fetch inicial a Directus: sincronización con sistema externo, no cascada de estado.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const visible = items.filter((b) => {
    if (filter === 'active') return ['pending', 'accepted', 'in_progress'].includes(b.status);
    if (filter === 'done') return ['completed', 'cancelled'].includes(b.status);
    return true;
  });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>HISTORIAL</Text>
          <Text style={styles.title}>Mis reservas</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countT}>{items.length} total</Text>
        </View>
      </View>

      <View style={styles.filters}>
        {([['all', 'Todas'], ['active', 'Activas'], ['done', 'Historial']] as const).map(([k, label]) => (
          <Pressable key={k} style={[styles.fPill, filter === k && styles.fActive]} onPress={() => setFilter(k)}>
            <Text style={[styles.fT, filter === k && styles.fTActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {visible.map((b) => {
            const svc = typeof b.service === 'object' ? b.service?.name : `Servicio #${b.service}`;
            const canTrack = ['accepted', 'in_progress', 'pending'].includes(b.status);
            const canRate = b.status === 'completed' && !b.rating;
            const done = b.status === 'completed';
            return (
              <View key={b.id} style={styles.card}>
                <View style={styles.topRow}>
                  <View style={styles.svcIcon}>
                    <Text style={{ fontSize: 20 }}>✂️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.svc} numberOfLines={1}>{svc}</Text>
                    <Text style={styles.meta}>
                      Reserva #{b.id} · {b.created_at ? new Date(b.created_at).toLocaleDateString() : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.price, b.status === 'cancelled' && { color: Stitch.colors.onSurfaceVariant }]}>
                      ${Number(b.price_snapshot || 0).toLocaleString('es-CO')}
                    </Text>
                    <Text style={styles.status}>{statusLabel(b.status)}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  {canTrack && (
                    <Pressable style={[styles.btn, { flex: 1 }]} onPress={() => router.push(`/booking/${b.id}`)}>
                      <Text style={styles.btnT}>Seguimiento en vivo →</Text>
                    </Pressable>
                  )}
                  {canRate && (
                    <Pressable style={[styles.btnAmber, { flex: 1 }]} onPress={() => router.push(`/rating/${b.id}`)}>
                      <Text style={styles.btnAmberT}>Calificar ★</Text>
                    </Pressable>
                  )}
                  {done && !canRate && <Text style={styles.doneNote}>✓ Completado · gracias por tu visita</Text>}
                  {b.status === 'pending' && !canTrack && <Text style={styles.wait}>Esperando al profesional…</Text>}
                </View>
              </View>
            );
          })}
          {!visible.length && (
            <Text style={styles.empty}>Aún no tienes reservas aquí. Ve al mapa o al radar para crear la primera. ✨</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function statusLabel(s: string) {
  return { pending: 'Pendiente', accepted: 'Aceptada', in_progress: 'En curso', completed: 'Completado', cancelled: 'Cancelada', rejected: 'Rechazada' }[s] || s;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  eyebrow: { fontSize: 10, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '800', color: Stitch.colors.onSurface },
  countPill: { backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  countT: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurface },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  fPill: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  fActive: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  fT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  fTActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  svcIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  svc: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  meta: { fontSize: 11, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  price: { fontSize: 16, fontWeight: '900', color: Stitch.colors.onTertiaryContainer },
  status: { fontSize: 10, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  btn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 12, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnAmber: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 12, alignItems: 'center' },
  btnAmberT: { color: Stitch.colors.primaryContainer, fontWeight: '900', fontSize: 13 },
  doneNote: { fontSize: 12, color: Stitch.colors.onTertiaryContainer, fontWeight: '700' },
  wait: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  empty: { textAlign: 'center', color: Stitch.colors.onSurfaceVariant, marginTop: 30, lineHeight: 20 },
});
