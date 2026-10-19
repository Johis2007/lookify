import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { createRadarSearch, fetchOnlinePros, fetchServices, type ProWithMeta } from '@/lib/api';
import { useClientLocation } from '@/lib/useClientLocation';
import { LocationGate } from '@/components/LocationGate';
import { RadarScan } from '@/components/RadarScan';

// Lookify Cliente - Búsqueda Radar y Match (diseño Stitch navy chamber, móvil + web).
// - Radar animado (ondas + barrido) mientras escanea.
// - Ubicación real del cliente (GPS con confirmación, manual o aproximada).
export default function Radar() {
  const { authFetch, user } = useAuth();
  const loc = useClientLocation();
  const [radius, setRadius] = useState(2);
  const [serviceId, setServiceId] = useState<number | undefined>();
  const [services, setServices] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [match, setMatch] = useState<ProWithMeta | null>(null);
  const [secs, setSecs] = useState(84);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [matchAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    fetchServices(authFetch).then(setServices).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 84)), 1000);
    return () => clearInterval(t);
  }, []);

  // Entrada animada de la tarjeta de match (fade + deslizamiento).
  useEffect(() => {
    if (match) {
      matchAnim.setValue(0);
      Animated.spring(matchAnim, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 120 }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id]);

  const scan = async () => {
    setScanning(true);
    setMatch(null);
    setScanMsg(null);
    try {
      if (user) {
        await createRadarSearch(authFetch, {
          client: user.id,
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          radius_m: radius * 1000,
          service: serviceId,
        });
      }
      const pros = await fetchOnlinePros(authFetch, loc.coords.latitude, loc.coords.longitude, radius);
      await new Promise((r) => setTimeout(r, 1600));
      if (pros.length) {
        const best = [...pros].sort((a, b) => (b.rating_avg || 0) - (a.rating_avg || 0))[0];
        setMatch(best);
      } else {
        setMatch(null);
        setScanMsg('Sin coincidencias en este radio. Prueba con más km.');
      }
    } catch (e: any) {
      setScanMsg(e?.message || 'No se pudo escanear. Revisa tu conexión.');
    } finally {
      setScanning(false);
    }
  };

  const mm = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const step = scanning ? 1 : match ? 2 : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.topBar}>
        <Text style={styles.cancel}>✕ Cancelar solicitud</Text>
        <View style={styles.livePill}>
          <View style={[styles.liveDot, (scanning || loc.live) && styles.liveDotOn]} />
          <Text style={styles.liveT}>{scanning ? 'Escaneando…' : 'Radar Activo'}</Text>
        </View>
      </View>

      {/* Cámara radar navy con animación */}
      <View style={styles.chamber}>
        <Text style={styles.chamberTitle}>Buscando el mejor profesional</Text>
        <Text style={styles.chamberSub}>
          {loc.coords.label ?? 'Corte de cabello cerca de ti'} · {loc.coords.latitude.toFixed(4)},{' '}
          {loc.coords.longitude.toFixed(4)}
        </Text>
        <View style={{ marginVertical: 6 }}>
          <RadarScan
            scanning={scanning}
            statusText={
              scanning
                ? `Buscando profesionales cercanos en ${radius} km`
                : undefined
            }
          />
        </View>
        <View style={styles.timerBadge}>
          <Text style={styles.timerT}>⏳ Tiempo estimado: {mm} min</Text>
        </View>
        <View style={styles.steps}>
          <Text style={[styles.stepTodo, step >= 0 && styles.stepDone]}>✓ Solicitud enviada</Text>
          <Text style={[styles.stepTodo, step === 1 ? styles.stepActive : step > 1 && styles.stepDone]}>
            📡 {scanning ? `Buscando en radio de ${radius} km…` : `Radio de ${radius} km · listo para escanear`}
          </Text>
          <Text style={[styles.stepTodo, step >= 2 && styles.stepDone]}>
            {match ? '✓ Profesional encontrado' : '→ Confirmación y ruta en camino'}
          </Text>
        </View>
      </View>

      {/* Ubicación real: GPS / manual / en vivo */}
      <View style={{ marginHorizontal: 16, marginTop: 12 }}>
        <LocationGate loc={loc} compact />
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
        <Pressable style={[styles.scan, scanning && { opacity: 0.8 }]} onPress={scan} disabled={scanning}>
          <Text style={styles.scanT}>{scanning ? '📡 Escaneando…' : '📡 Buscar match ahora'}</Text>
        </Pressable>
      </View>

      {scanning && (
        <Text style={styles.hint}>
          Escaneando {radius} km a tu alrededor…{loc.live ? ' (tu pin se mueve en vivo)' : ''}
        </Text>
      )}
      {!scanning && scanMsg ? <Text style={styles.hint}>{scanMsg}</Text> : null}
      {!scanning && !scanMsg ? (
        <Text style={styles.hint}>
          {loc.source === 'live'
            ? '📍 Tu ubicación en vivo'
            : loc.source === 'gps'
              ? '📍 Ubicación GPS actual'
              : loc.source === 'manual'
                ? '✏️ Ubicación manual'
                : '📍 Ubicación aproximada — activa el GPS para mayor precisión'}
        </Text>
      ) : null}

      {match && !scanning && (
        <Animated.View
          style={[
            styles.card,
            {
              opacity: matchAnim,
              transform: [
                {
                  translateY: matchAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
                },
              ],
            },
          ]}
        >
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
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cancel: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Stitch.colors.outline },
  liveDotOn: { backgroundColor: '#22c55e' },
  liveT: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurface },
  chamber: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 20, marginHorizontal: 16, padding: 20, alignItems: 'center', gap: 6 },
  chamberTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  chamberSub: { fontSize: 12, color: '#b8c7e6', textAlign: 'center' },
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
