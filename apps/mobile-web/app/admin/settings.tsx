import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AdminShell } from '@/components/AdminShell';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { kvGetJson, kvSetJson } from '@/lib/kv';

/* eslint-disable react-hooks/set-state-in-effect */

const ZONES = ['Usaquén', 'Chapinero', 'Suba', 'Engativá', 'Teusaquillo', 'Kennedy', 'Barrios Unidos', 'Fontibón', 'Santa Fe'];

type OpsConfig = {
  autoAssign: boolean;
  acceptSecs: string;
  reviewSecs: string;
  maxRejects: string;
  baseFee: string;
  extraKmFee: string;
  maxFee: string;
  commissionPct: string;
  bandPct: string;
  nightPct: string;
  freeCancelMins: string;
  lateFee: string;
  zonesOff: string[];
};

const DEFAULTS: OpsConfig = {
  autoAssign: true,
  acceptSecs: '15',
  reviewSecs: '90',
  maxRejects: '3',
  baseFee: '5000',
  extraKmFee: '1200',
  maxFee: '15000',
  commissionPct: '15',
  bandPct: '20',
  nightPct: '15',
  freeCancelMins: '5',
  lateFee: '8000',
  zonesOff: ['Santa Fe'],
};

// Lookify Admin - Configuración (diseño Stitch, móvil + web).
// Parámetros del motor de despacho, tarifas, cancelaciones y zonas.
// Se guardan en el dispositivo del admin (KV local) hasta que exista la
// colección system_config en Directus para reglas multi-admin.
export default function AdminSettings() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<OpsConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const stored = await kvGetJson<Partial<OpsConfig>>(user.id, 'ops_config', {});
    setCfg({ ...DEFAULTS, ...stored });
    const when = await kvGetJson<string | null>(user.id, 'ops_config_at', null);
    setSavedAt(when);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const set = <K extends keyof OpsConfig>(k: K, v: OpsConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const toggleZone = (z: string) =>
    set('zonesOff', cfg.zonesOff.includes(z) ? cfg.zonesOff.filter((x) => x !== z) : [...cfg.zonesOff, z]);

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      await kvSetJson(user.id, 'ops_config', cfg);
      const now = new Date().toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      await kvSetJson(user.id, 'ops_config_at', now);
      setSavedAt(now);
    } finally {
      setSaving(false);
    }
  };

  const num = (label: string, key: 'acceptSecs' | 'reviewSecs' | 'maxRejects' | 'baseFee' | 'extraKmFee' | 'maxFee' | 'commissionPct' | 'bandPct' | 'nightPct' | 'freeCancelMins' | 'lateFee', suffix: string) => (
    <View style={styles.field}>
      <Text style={styles.fieldL}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={cfg[key]}
          onChangeText={(t) => set(key, t.replace(/[^0-9]/g, '') as any)}
          keyboardType="numeric"
          style={styles.input}
        />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
    </View>
  );

  return (
    <AdminShell active="settings" title="Configuración" subtitle="Reglas del motor de despacho, tarifas y zonas · v2.4.0">
      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <View style={{ gap: 12 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📡 Asignación automática y radar</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchT}>Despacho automático por cercanía</Text>
              <Switch
                value={cfg.autoAssign}
                onValueChange={(v) => set('autoAssign', v)}
                trackColor={{ true: Stitch.colors.onTertiaryContainer, false: Stitch.colors.surfaceHigh }}
                thumbColor="#fff"
              />
            </View>
            <Text style={styles.note}>Expansión del radar: 1 km → 2 km → 4 km → 6 km (límite).</Text>
            {num('Tiempo de aceptación del profesional', 'acceptSecs', 'seg')}
            {num('Tiempo del cliente para confirmar', 'reviewSecs', 'seg')}
            {num('Máx. rechazos consecutivos cliente', 'maxRejects', 'intentos')}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>💰 Tarifas y comisión</Text>
            {num('Tarifa base domicilio (hasta 3 km)', 'baseFee', 'COP')}
            {num('Por km adicional (> 3 km)', 'extraKmFee', 'COP/km')}
            {num('Tope máximo en Bogotá', 'maxFee', 'COP')}
            {num('Comisión Lookify', 'commissionPct', '%')}
            {num('Margen flexible del pro', 'bandPct', '% s/base')}
            {num('Recargo nocturno (desde 8pm)', 'nightPct', '%')}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🛡 Cancelaciones</Text>
            {num('Cancelación gratuita cliente', 'freeCancelMins', 'min')}
            {num('Recargo cancelación tardía', 'lateFee', 'COP')}
            <Text style={styles.note}>No-show del profesional: suspensión 24h + nota en expediente (desde Reportes).</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📍 Zonas de cobertura ({ZONES.length - cfg.zonesOff.length} activas)</Text>
            <View style={styles.zones}>
              {ZONES.map((z) => {
                const off = cfg.zonesOff.includes(z);
                return (
                  <Pressable key={z} onPress={() => toggleZone(z)} style={[styles.zone, off && styles.zoneOff]}>
                    <Text style={[styles.zoneT, off && styles.zoneTOff]}>{z}</Text>
                    <Text style={styles.zoneS}>{off ? 'Pausada' : 'Activa'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text style={styles.note}>
            ℹ️ Estos parámetros se guardan en este dispositivo. Para reglas multi-admin se requiere la colección system_config en Directus.
          </Text>

          <Pressable style={styles.saveBtn} onPress={save} disabled={saving}>
            <Text style={styles.saveT}>{saving ? 'Sincronizando…' : '💾 Guardar cambios'}</Text>
          </Pressable>
          {savedAt ? <Text style={styles.saved}>Guardado {savedAt} ✓</Text> : null}
        </View>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  note: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchT: { fontSize: 13, fontWeight: '700', color: Stitch.colors.onSurface },
  field: { gap: 4 },
  fieldL: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  suffix: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zone: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: Stitch.colors.surfaceLow, alignItems: 'center' },
  zoneOff: { opacity: 0.55 },
  zoneT: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  zoneTOff: { textDecorationLine: 'line-through' },
  zoneS: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  saveBtn: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 15, alignItems: 'center' },
  saveT: { color: Stitch.colors.primaryContainer, fontWeight: '900' },
  saved: { textAlign: 'center', color: Stitch.colors.onTertiaryContainer, fontWeight: '700', fontSize: 12 },
});
