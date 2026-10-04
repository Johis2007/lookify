import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';

/* eslint-disable react-hooks/set-state-in-effect */
import { useProLiveState } from '@/lib/proLiveState';
import { kvGetJson, kvSetJson } from '@/lib/kv';

const RADII = [1, 3, 5, 8];

type DispatchSvc = {
  id: number;
  serviceName: string;
  base: number;
  mine: number;
};

// Lookify PRO - Disponibilidad y Radar (diseño Stitch, móvil + web).
// - Toggle online/offline (mismo estado que Perfil: contexto compartido).
// - Radio de cobertura 1/3/5/8 km (preferencia del dispositivo).
// - Servicios para despacho inmediato (lista real de Directus; la pausa de
//   cada servicio se guarda en el dispositivo).
export default function Availability() {
  const { user, isProfessional, authFetch } = useAuth();
  const proLive = useProLiveState();
  const pid = proLive.professionalId;
  const [radius, setRadius] = useState(5);
  const [services, setServices] = useState<DispatchSvc[]>([]);
  const [offIds, setOffIds] = useState<number[]>([]);
  const [today, setToday] = useState({ count: 0, total: 0 });
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPrefs = useCallback(async () => {
    if (!user) return;
    setRadius(await kvGetJson<number>(user.id, 'coverage_km', 5));
    setOffIds(await kvGetJson<number[]>(user.id, 'dispatch_off', []));
  }, [user]);

  const loadData = useCallback(async () => {
    if (!pid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ps, prof, done] = await Promise.all([
        authFetch(`/items/professional_services?filter[professional_id][_eq]=${pid}&fields=*,service_id.*&limit=50`),
        authFetch(`/items/beauty_professionals/${pid}?fields=rating_avg`),
        authFetch(
          `/items/bookings?filter[professional][_eq]=${pid}&filter[status][_eq]=completed&filter[completed_at][_gte]=${new Date(new Date().setHours(0, 0, 0, 0)).toISOString()}&fields=id,price_snapshot&limit=100`
        ),
      ]);
      if (ps.ok) {
        const { data } = await ps.json();
        setServices(
          (Array.isArray(data) ? data : []).map((r: any) => ({
            id: Number(r.id),
            serviceName: r.service_id?.name ?? `Servicio #${r.service_id}`,
            base: Number(r.service_id?.price_base ?? 0),
            mine: Number(r.price_override ?? r.service_id?.price_base ?? 0),
          }))
        );
      }
      if (prof.ok) {
        const { data } = await prof.json();
        setRating(typeof data?.rating_avg === 'number' ? data.rating_avg : null);
      }
      if (done.ok) {
        const { data } = await done.json();
        const rows = Array.isArray(data) ? data : [];
        setToday({
          count: rows.length,
          total: rows.reduce((s: number, b: any) => s + (Number(b.price_snapshot) || 0), 0),
        });
      }
    } catch {
      /* lista vacía: se muestra estado */
    } finally {
      setLoading(false);
    }
  }, [authFetch, pid]);

  useEffect(() => {
    loadPrefs().catch(() => {});
  }, [loadPrefs]);
  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  const pickRadius = async (km: number) => {
    setRadius(km);
    if (user) kvSetJson(user.id, 'coverage_km', km).catch(() => {});
  };

  const toggleService = async (id: number) => {
    const next = offIds.includes(id) ? offIds.filter((x) => x !== id) : [...offIds, id];
    setOffIds(next);
    if (user) kvSetJson(user.id, 'dispatch_off', next).catch(() => {});
  };

  const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backT}>← Perfil</Text>
      </Pressable>
      <Text style={styles.h1}>Disponibilidad y radar</Text>
      <Text style={styles.sub}>Controla tu presencia, cobertura y servicios para despacho.</Text>

      {!isProfessional || !pid ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aún no eres profesional</Text>
          <Text style={styles.sub}>Activa tu perfil para recibir solicitudes.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/profile')}>
            <Text style={styles.primaryT}>Ir a mi perfil →</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <>
          <View style={[styles.card, styles.heroCard]}>
            <View style={styles.heroRow}>
              <View style={[styles.dot, proLive.isOnline && styles.dotOn]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>{proLive.isOnline ? 'Estás disponible' : 'Turno en pausa'}</Text>
                <Text style={styles.heroSub}>
                  {proLive.isOnline ? 'Recibiendo solicitudes en tiempo real' : 'No visible en el radar'}
                </Text>
              </View>
              <Switch
                value={proLive.isOnline}
                onValueChange={(v) => proLive.setOnline(v)}
                trackColor={{ true: Stitch.colors.onTertiaryContainer, false: Stitch.colors.surfaceHigh }}
                thumbColor="#fff"
              />
            </View>
            {proLive.error ? <Text style={styles.msg}>{proLive.error}</Text> : null}
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricV}>{today.count}</Text>
                <Text style={styles.metricL}>Hoy</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricV}>{cop(today.total)}</Text>
                <Text style={styles.metricL}>Ganado hoy</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricV}>{rating !== null ? rating.toFixed(2).replace(/\.?0+$/, '') : '—'}</Text>
                <Text style={styles.metricL}>Rating</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📡 Radio de cobertura</Text>
            <Text style={styles.sub}>Distancia máxima para recibir solicitudes.</Text>
            <View style={styles.pills}>
              {RADII.map((km) => (
                <Pressable
                  key={km}
                  onPress={() => pickRadius(km)}
                  style={[styles.pill, radius === km && styles.pillOn]}
                >
                  <Text style={[styles.pillT, radius === km && styles.pillTOn]}>{km} km</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🧰 Servicios para despacho</Text>
            <Text style={styles.sub}>Desactiva los que hoy no puedas prestar (sin kit/insumos).</Text>
            {services.length === 0 ? (
              <Text style={styles.sub}>Sin servicios vinculados. Vincúlalos en Admin → Servicios.</Text>
            ) : (
              services.map((s) => {
                const off = offIds.includes(s.id);
                return (
                  <View key={s.id} style={[styles.svcRow, off && styles.svcOff]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.svcName}>{s.serviceName}</Text>
                      <Text style={styles.sub}>
                        {cop(s.mine)}{s.base > 0 && s.mine !== s.base ? ` (base ${cop(s.base)})` : ''} ·{' '}
                        {off ? 'En pausa' : 'Listo'}
                      </Text>
                    </View>
                    <Switch
                      value={!off}
                      onValueChange={() => toggleService(s.id)}
                      trackColor={{ true: Stitch.colors.onTertiaryContainer, false: Stitch.colors.surfaceHigh }}
                      thumbColor="#fff"
                    />
                  </View>
                );
              })
            )}
          </View>

          <Pressable
            style={styles.ghostBtn}
            onPress={() => proLive.setOnline(false)}
            disabled={!proLive.isOnline}
          >
            <Text style={styles.ghostT}>
              {proLive.isOnline ? '☕ Pausar turno (hasta 45 min)' : 'Turno pausado'}
            </Text>
          </Pressable>
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
  heroCard: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Stitch.colors.outline },
  dotOn: { backgroundColor: Stitch.colors.tertiaryFixedDim },
  heroTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 12, color: Stitch.colors.surfaceHigh },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 6 },
  metric: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 },
  metricV: { fontSize: 16, fontWeight: '900', color: '#fff' },
  metricL: { fontSize: 11, color: Stitch.colors.surfaceHigh },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  msg: { color: Stitch.colors.secondary, fontWeight: '600', fontSize: 12 },
  pills: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pill: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: Stitch.colors.surfaceLow },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer },
  pillT: { fontWeight: '800', color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12, marginTop: 8 },
  svcOff: { opacity: 0.6 },
  svcName: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  primaryBtn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  primaryT: { color: '#fff', fontWeight: '800' },
  ghostBtn: { borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, backgroundColor: '#fff', borderRadius: 12, padding: 13, alignItems: 'center', marginHorizontal: 16, marginTop: 12 },
  ghostT: { fontWeight: '700', color: Stitch.colors.onSurface, fontSize: 13 },
});
