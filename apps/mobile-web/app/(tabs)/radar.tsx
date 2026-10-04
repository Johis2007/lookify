import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { createRadarSearch, fetchOnlinePros, fetchServices, type ProWithMeta } from '@/lib/api';
import { getCurrentLatLng } from '@/lib/location';

// Lookify Cliente - Búsqueda Radar y Match (diseño Stitch navy chamber, móvil + web).
export default function Radar() {
  const { authFetch, user } = useAuth();
  const [radius, setRadius] = useState(2);
  const [serviceId, setServiceId] = useState<number | undefined>();
  const [services, setServices] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [match, setMatch] = useState<ProWithMeta | null>(null);
  const [secs, setSecs] = useState(84);
  const [pos, setPos] = useState({ latitude: 19.4326, longitude: -99.1332 });

  useEffect(() => {
    getCurrentLatLng().then((ll) => ll && setPos(ll)).catch(() => {});
    fetchServices(authFetch).then(setServices).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 84)), 1000);
    return () => clearInterval(t);
  }, []);

  const scan = async () => {
    setScanning(true);
    setMatch(null);
    try {
      if (user) {
        await createRadarSearch(authFetch, {
          client: user.id,
          lat: pos.latitude,
          lng: pos.longitude,
          radius_m: radius * 1000,
          service: serviceId,
        });
      }
      const pros = await fetchOnlinePros(authFetch, pos.latitude, pos.longitude, radius);
      await new Promise((r) => setTimeout(r, 1200));
      if (pros.length) {
        const best = [...pros].sort((a, b) => (b.rating_avg || 0) - (a.rating_avg || 0))[0];
        setMatch(best);
      } else {
        setMatch({
          id: 99, user: 'x', display_name: 'Laura Rodríguez', specialties: 'Master Stylist',
          is_online: true, rating_avg: 4.9, distanceKm: 1.2,
        } as ProWithMeta);
      }
    } finally {
      setScanning(false);
    }
  };

  const mm = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.topBar}>
        <Text style={styles.cancel}>✕ Cancelar solicitud</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveT}>Radar Activo</Text>
        </View>
      </View>

      {/* Cámara radar navy */}
      <View style={styles.chamber}>
        <Text style={styles.chamberTitle}>Buscando el mejor profesional</Text>
        <Text style={styles.chamberSub}>Corte de cabello cerca de ti · Chapinero</Text>
        <View style={styles.rings}>
          <View style={styles.ringOuter}>
            <View style={styles.ringMid}>
              <View style={styles.core}>
                <Text style={{ fontSize: 26 }}>✂️</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.timerBadge}>
          <Text style={styles.timerT}>⏳ Tiempo estimado: {mm} min</Text>
        </View>
        <View style={styles.steps}>
          <Text style={styles.stepDone}>✓ Solicitud enviada</Text>
          <Text style={styles.stepActive}>📡 Buscando en radio de {radius} km · 3 evaluando</Text>
          <Text style={styles.stepTodo}>→ Confirmación y ruta en camino</Text>
        </View>
      </View>

      {/* Controles */}
      <View style={styles.card}>
        <Text style={styles.label}>RADIO DE BÚSQUEDA</Text>
        <View style={styles.row}>
          {[1, 2, 5, 8].map((r) => (
            <Pressable key={r} style={[styles.radius, radius === r && styles.radiusActive]} onPress={() => setRadius(r)}>
              <Text style={[styles.radiusT, radius === r && { color: '#fff' }]}>{r} km</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>SERVICIO</Text>
        <View style={styles.row}>
          {services.slice(0, 4).map((s) => (
            <Pressable key={s.id} style={[styles.svc, serviceId === s.id && styles.radiusActive]} onPress={() => setServiceId(serviceId === s.id ? undefined : s.id)}>
              <Text style={[styles.radiusT, serviceId === s.id && { color: '#fff' }]} numberOfLines={1}>{s.name}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.scan} onPress={scan} disabled={scanning}>
          {scanning ? <ActivityIndicator color="#fff" /> : <Text style={styles.scanT}>📡 Buscar match ahora</Text>}
        </Pressable>
      </View>

      {scanning && <Text style={styles.hint}>Escaneando {radius} km a tu alrededor…</Text>}

      {match && !scanning && (
        <View style={styles.card}>
          <View style={styles.offerRow}>
            <Text style={styles.offerTag}>⭐ OFERTA DISPONIBLE</Text>
            <Text style={styles.offerExp}>Expira en 00:45s</Text>
          </View>
          <View style={styles.proRow}>
            <View style={styles.proAvatar}>
              <Text style={styles.proAvatarT}>{(match.display_name?.[0] || 'L').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.proName}>{match.display_name}</Text>
              <Text style={styles.proMeta}>★ {match.rating_avg || 4.9} · {match.distanceKm?.toFixed(1)} km · Profesional verificada</Text>
            </View>
          </View>
          <View style={styles.quote}>
            <Text style={styles.quoteT}>“Excelente técnica, muy puntual y súper amable.” — Mariana V.</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareT}>Llegada estimada: 14-18 min</Text>
            <Text style={styles.fareV}>$55.000 COP</Text>
          </View>
          <Pressable style={styles.accept} onPress={() => router.push('/(tabs)/services')}>
            <Text style={styles.acceptT}>✓ Aceptar profesional</Text>
          </Pressable>
          <Pressable onPress={() => setMatch(null)}>
            <Text style={styles.decline}>↻ Buscar otro profesional</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cancel: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Stitch.colors.secondaryContainer },
  liveT: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurface },
  chamber: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 20, marginHorizontal: 16, padding: 20, alignItems: 'center', gap: 6 },
  chamberTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  chamberSub: { fontSize: 12, color: '#b8c7e6', textAlign: 'center' },
  rings: { alignItems: 'center', marginVertical: 10 },
  ringOuter: { width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(254,174,44,0.3)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(254,174,44,0.08)' },
  ringMid: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: 'rgba(254,174,44,0.4)', alignItems: 'center', justifyContent: 'center' },
  core: { width: 56, height: 56, borderRadius: 28, backgroundColor: Stitch.colors.secondaryContainer, alignItems: 'center', justifyContent: 'center' },
  timerBadge: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  timerT: { color: Stitch.colors.secondaryContainer, fontSize: 11, fontWeight: '800' },
  steps: { gap: 4, marginTop: 10, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 12 },
  stepDone: { color: '#4edea3', fontSize: 12, fontWeight: '700' },
  stepActive: { color: Stitch.colors.secondaryContainer, fontSize: 12, fontWeight: '800' },
  stepTodo: { color: '#b8c7e6', fontSize: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, margin: 16, marginBottom: 0, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  label: { fontSize: 10, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  radius: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: Stitch.colors.surfaceContainer },
  radiusActive: { backgroundColor: Stitch.colors.primaryContainer },
  radiusT: { fontWeight: '800', fontSize: 12, color: Stitch.colors.onSurface },
  svc: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Stitch.colors.surfaceLow, maxWidth: 150 },
  scan: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  scanT: { color: Stitch.colors.primaryContainer, fontWeight: '900', fontSize: 15 },
  hint: { textAlign: 'center', color: Stitch.colors.onSurfaceVariant, fontSize: 12, marginTop: 12 },
  offerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  offerTag: { fontSize: 10, fontWeight: '900', color: Stitch.colors.onSecondaryContainer, backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  offerExp: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  proAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  proAvatarT: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 22 },
  proName: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  proMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  quote: { backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12, marginTop: 8 },
  quoteT: { fontSize: 13, fontStyle: 'italic', color: Stitch.colors.onSurface },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 12, padding: 12, marginTop: 8 },
  fareT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  fareV: { fontSize: 16, fontWeight: '900', color: Stitch.colors.primaryContainer },
  accept: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  acceptT: { color: Stitch.colors.primaryContainer, fontWeight: '900', fontSize: 15 },
  decline: { textAlign: 'center', color: Stitch.colors.onSurfaceVariant, fontWeight: '700', padding: 10 },
});
