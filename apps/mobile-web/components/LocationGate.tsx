import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import type { ClientLocation, CoordSource } from '@/lib/useClientLocation';

const SOURCE_LABEL: Record<CoordSource, string> = {
  none: 'Sin ubicación',
  gps: 'GPS · puntual',
  live: 'GPS · en vivo',
  manual: 'Manual',
  fallback: 'Aproximada',
};

function fmt(n: number) {
  return n.toFixed(5);
}

/**
 * Tarjeta de ubicación del cliente: confirmación de permiso, GPS automático,
 * ubicación manual y tracking en vivo con coordenadas reales visibles.
 */
export function LocationGate({ loc, compact = false }: { loc: ClientLocation; compact?: boolean }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [latTxt, setLatTxt] = useState('');
  const [lngTxt, setLngTxt] = useState('');
  const [labelTxt, setLabelTxt] = useState('');
  const [manualErr, setManualErr] = useState<string | null>(null);
  // Reloj para "act. hace Xs" (fuera del render puro).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!loc.lastUpdate) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [loc.lastUpdate]);

  const saveManual = () => {
    setManualErr(null);
    const lat = Number(latTxt.replace(',', '.'));
    const lng = Number(lngTxt.replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setManualErr('Ingresa latitud y longitud válidas (ej. 4.57923, -74.21683).');
      return;
    }
    const ok = loc.setManual(lat, lng, labelTxt || undefined);
    if (!ok) {
      setManualErr('Coordenadas fuera de rango.');
      return;
    }
    setManualOpen(false);
  };

  const ago = loc.lastUpdate ? ` · act. hace ${Math.max(0, Math.round((now - loc.lastUpdate) / 1000))}s` : '';

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.badge}>
          <View style={[styles.dot, loc.live ? styles.dotLive : loc.hasRealFix ? styles.dotFix : styles.dotIdle]} />
          <Text style={styles.badgeT}>{SOURCE_LABEL[loc.source]}</Text>
        </View>
        {loc.coords.accuracy != null && (
          <Text style={styles.acc}>±{Math.round(loc.coords.accuracy)} m</Text>
        )}
      </View>

      <Text style={styles.coords}>
        📍 {fmt(loc.coords.latitude)}, {fmt(loc.coords.longitude)}
        {ago}
      </Text>
      {loc.coords.label ? <Text style={styles.label}>{loc.coords.label}</Text> : null}
      {loc.error ? <Text style={styles.err}>{loc.error}</Text> : null}

      {!loc.hasRealFix && !manualOpen && (
        <Text style={styles.hint}>
          Autodetecta tu ubicación con GPS o ingrésala manualmente para buscar profesionales cerca de ti.
        </Text>
      )}

      <View style={compact ? styles.btnCol : styles.btnRow}>
        {!loc.hasRealFix || loc.source === 'manual' || loc.source === 'fallback' ? (
          <Pressable
            style={[styles.primary, loc.requesting && { opacity: 0.7 }]}
            onPress={() => void loc.requestWithConfirm()}
            disabled={loc.requesting}
          >
            <Text style={styles.primaryT}>
              {loc.requesting ? 'Localizando…' : '📡 Usar mi ubicación actual'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.ghost}
            onPress={() => void loc.refreshGps()}
            disabled={loc.requesting}
          >
            <Text style={styles.ghostT}>{loc.requesting ? 'Actualizando…' : '↻ Actualizar GPS'}</Text>
          </Pressable>
        )}
        <Pressable style={styles.ghost} onPress={() => setManualOpen((v) => !v)}>
          <Text style={styles.ghostT}>{manualOpen ? 'Cerrar' : '✏️ Manual'}</Text>
        </Pressable>
      </View>

      {loc.permission === 'denied' && (
        <Pressable style={styles.warnBtn} onPress={loc.openSettings}>
          <Text style={styles.warnT}>⚙️ Permiso bloqueado — abrir ajustes</Text>
        </Pressable>
      )}

      {manualOpen && (
        <View style={styles.manual}>
          <Text style={styles.manualTitle}>Ubicación manual</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Latitud (4.57923)"
              keyboardType="numbers-and-punctuation"
              value={latTxt}
              onChangeText={setLatTxt}
              placeholderTextColor="#75777e"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Longitud (-74.21683)"
              keyboardType="numbers-and-punctuation"
              value={lngTxt}
              onChangeText={setLngTxt}
              placeholderTextColor="#75777e"
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Referencia (ej. Parque principal, Soacha)"
            value={labelTxt}
            onChangeText={setLabelTxt}
            placeholderTextColor="#75777e"
          />
          {manualErr ? <Text style={styles.err}>{manualErr}</Text> : null}
          <Pressable style={styles.primary} onPress={saveManual}>
            <Text style={styles.primaryT}>Guardar ubicación manual</Text>
          </Pressable>
        </View>
      )}

      {loc.hasRealFix && (
        <View style={styles.liveRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveT}>Seguimiento en vivo</Text>
            <Text style={styles.liveSub}>Actualiza tu pin cada 5 s / 10 m</Text>
          </View>
          <Switch
            value={loc.live}
            onValueChange={(v) => void loc.setLiveTracking(v)}
            trackColor={{ true: Stitch.colors.onTertiaryContainer, false: Stitch.colors.surfaceHigh }}
            thumbColor="#fff"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Stitch.colors.outline },
  dotLive: { backgroundColor: '#22c55e' },
  dotFix: { backgroundColor: Stitch.colors.secondary },
  dotIdle: { backgroundColor: Stitch.colors.outline },
  badgeT: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurface },
  acc: { fontSize: 11, color: Stitch.colors.onSurfaceVariant, fontWeight: '600' },
  coords: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  label: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  hint: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, lineHeight: 17 },
  err: { fontSize: 12, color: Stitch.colors.error, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnCol: { gap: 8 },
  primary: { flex: 1, backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 13, alignItems: 'center' },
  primaryT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  ghost: { flex: 1, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 13, alignItems: 'center' },
  ghostT: { fontWeight: '700', color: Stitch.colors.onSurface, fontSize: 13 },
  warnBtn: { backgroundColor: Stitch.colors.errorContainer, borderRadius: 12, padding: 12, alignItems: 'center' },
  warnT: { color: Stitch.colors.onErrorContainer, fontWeight: '800', fontSize: 13 },
  manual: { gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12 },
  manualTitle: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  manualRow: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, paddingHorizontal: 12, height: 44, fontSize: 14, color: Stitch.colors.onSurface },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12 },
  liveT: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  liveSub: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
});
