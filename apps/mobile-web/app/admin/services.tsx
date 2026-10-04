import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';

type Svc = {
  id: number;
  name: string;
  category?: string;
  price_base?: number;
  duration_min?: number;
  is_active?: boolean;
};

// Lookify Admin - Servicios y tarifas (diseño Stitch PRO, responsive móvil + web).
// Izquierda: categorías. Derecha: tabla con rango ±20%, lógica de precio y auditoría.
const CATEGORIES = [
  { key: 'peluqueria', label: 'Peluquería', icon: '✂️', sub: '5 servicios' },
  { key: 'barberia', label: 'Barbería', icon: '🧔', sub: '5 servicios' },
  { key: 'unas', label: 'Uñas & Spa', icon: '💅', sub: '6 servicios' },
  { key: 'maquillaje', label: 'Maquillaje', icon: '🎨', sub: '5 servicios' },
];

const rangeOf = (base: number) => ({
  min: Math.round(base * 0.8),
  max: Math.round(base * 1.2),
});

export default function AdminServices() {
  const { authFetch } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [items, setItems] = useState<Svc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('barberia');
  const [modal, setModal] = useState(false);
  const [audit, setAudit] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', price_base: '35000', duration_min: '45' });

  const load = async () => {
    try {
      const s = await authFetch('/items/beauty_services?limit=50&sort=name')
        .then((r) => r.json())
        .catch(() => ({ data: [] }));
      setItems(s.data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const f = items.filter((s) =>
      cat === 'barberia'
        ? /barb|corte|navaja|infantil/i.test(`${s.name} ${s.category}`)
        : true
    );
    return (f.length ? f : items).slice(0, 12);
  }, [items, cat]);

  const toggle = async (s: Svc) => {
    await authFetch(`/items/beauty_services/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    setAudit((a) => [
      `• ${s.name}: ${s.is_active ? 'desactivado' : 'activado'} — ${new Date().toLocaleTimeString()}`,
      ...a,
    ].slice(0, 5));
    load();
  };

  const create = async () => {
    if (!form.name) return;
    await authFetch('/items/beauty_services', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        category: cat,
        price_base: Number(form.price_base) || 0,
        duration_min: Number(form.duration_min) || 45,
        is_active: true,
      }),
    });
    setAudit((a) => [`• Nuevo: ${form.name} $${form.price_base} COP`, ...a].slice(0, 5));
    setModal(false);
    setForm({ name: '', price_base: '35000', duration_min: '45' });
    load();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Servicios y tarifas</Text>
          <Text style={styles.sub}>Catálogo operativo · banda permitida ±20% sobre base</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setModal(true)}>
          <Text style={styles.addBtnT}>+ Agregar</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
            {/* Columna categorías */}
            <View style={[styles.card, wide && { width: 280 }]}>
              <Text style={styles.cardLabel}>CATEGORÍAS ACTIVAS ({CATEGORIES.length})</Text>
              {CATEGORIES.map((c) => {
                const active = c.key === cat;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCat(c.key)}
                    style={[styles.catRow, active && styles.catActive]}
                  >
                    {active && <View style={styles.catBar} />}
                    <Text style={styles.catIcon}>{c.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.catName, active && { color: '#fff' }]}>{c.label}</Text>
                      <Text style={[styles.catSub, active && { color: '#b8c7e6' }]}>{c.sub}</Text>
                    </View>
                    {active && <Text style={styles.catCheck}>●</Text>}
                  </Pressable>
                );
              })}
              <View style={styles.infoBox}>
                <Text style={styles.infoT}>
                  Comisión Lookify <Text style={{ fontWeight: '900' }}>15%</Text> por servicio. El
                  domicilio se muestra como ítem separado.
                </Text>
              </View>
            </View>

            {/* Columna tabla */}
            <View style={{ flex: 1, gap: 12, width: wide ? undefined : '100%' }}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Servicios de {CATEGORIES.find((c) => c.key === cat)?.label}</Text>
                <Text style={styles.cardSub}>
                  {filtered.length} configurados · sincronizado con Directus CMS
                </Text>
                {filtered.map((s) => {
                  const base = Number(s.price_base) || 0;
                  const r = rangeOf(base);
                  return (
                    <View key={s.id} style={[styles.row, !s.is_active && { opacity: 0.6 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.svcName}>{s.name}</Text>
                        <Text style={styles.svcMeta}>
                          ⏱ {s.duration_min ?? 45} min · Base ${base.toLocaleString('es-CO')} COP
                        </Text>
                        <Text style={styles.svcRange}>
                          Rango PRO ${r.min.toLocaleString('es-CO')} – ${r.max.toLocaleString('es-CO')}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => toggle(s)}
                        style={[styles.toggle, s.is_active && styles.toggleOn]}
                      >
                        <View style={[styles.knob, s.is_active && { alignSelf: 'flex-end' }]} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              {/* Lógica de precio */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>¿Cómo se define el precio?</Text>
                <Text style={styles.cardSub}>
                  Base oficial Lookify. Cada PRO ajusta ±20% según experiencia y portafolio.
                </Text>
                <View style={styles.simRow}>
                  {['Mínimo -20%', 'Base oficial', 'Máximo +20%'].map((l, i) => (
                    <View key={l} style={[styles.simBox, i === 1 && styles.simBase]}>
                      <Text style={[styles.simL, i === 1 && { color: '#feae2c' }]}>{l}</Text>
                      <Text style={[styles.simV, i === 1 && { color: '#fff' }]}>
                        {i === 0 ? '$28.000' : i === 1 ? '$35.000' : '$42.000'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {!!audit.length && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Historial de auditoría</Text>
                  {audit.map((a, i) => (
                    <Text key={i} style={styles.auditT}>{a}</Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Crear nuevo servicio</Text>
            <Text style={styles.cardSub}>Se publicará en {cat}</Text>
            {([['Nombre del servicio', 'name'], ['Precio base (COP)', 'price_base'], ['Duración (min)', 'duration_min']] as const).map(([label, key]) => (
              <View key={key}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={form[key]}
                  onChangeText={(t) => setForm({ ...form, [key]: t })}
                  keyboardType={key === 'name' ? 'default' : 'numeric'}
                />
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => setModal(false)}>
                <Text style={[styles.btnT, { color: Stitch.colors.onSurface }]}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.btn, { flex: 2 }]} onPress={create}>
                <Text style={styles.btnT}>Guardar servicio</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  back: { fontWeight: '900', fontSize: 20, color: Stitch.colors.primaryContainer },
  title: { fontSize: 22, fontWeight: '800', color: Stitch.colors.onSurface, fontFamily: Stitch.font },
  sub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  addBtn: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  addBtnT: { fontWeight: '800', color: Stitch.colors.primaryContainer },
  card: { backgroundColor: '#fff', borderRadius: Stitch.radius.lg, padding: 14, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  cardLabel: { fontSize: 10, fontWeight: '800', color: Stitch.colors.outline, letterSpacing: 1 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Stitch.colors.onSurface },
  cardSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, position: 'relative' },
  catActive: { backgroundColor: Stitch.colors.primaryContainer },
  catBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: Stitch.colors.secondaryContainer, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  catIcon: { fontSize: 20 },
  catName: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  catSub: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  catCheck: { color: Stitch.colors.secondaryContainer, fontSize: 12 },
  infoBox: { backgroundColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 12, marginTop: 4 },
  infoT: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: Stitch.colors.surfaceLow },
  svcName: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  svcMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  svcRange: { fontSize: 11, color: Stitch.colors.secondary, fontWeight: '700', marginTop: 2 },
  toggle: { width: 46, height: 26, borderRadius: 999, backgroundColor: Stitch.colors.outlineVariant, padding: 3 },
  toggleOn: { backgroundColor: Stitch.colors.secondaryContainer },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  simRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  simBox: { flex: 1, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 10, padding: 10, alignItems: 'center' },
  simBase: { backgroundColor: Stitch.colors.primaryContainer },
  simL: { fontSize: 9, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, textTransform: 'uppercase' },
  simV: { fontSize: 14, fontWeight: '900', color: Stitch.colors.onSurface, marginTop: 2 },
  auditT: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(17,28,45,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Stitch.colors.onSurface },
  label: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, textTransform: 'uppercase', marginTop: 8 },
  input: { borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 12, fontSize: 15, backgroundColor: Stitch.colors.surfaceLow },
  btn: { flex: 1, backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  btnT: { color: Stitch.colors.primaryContainer, fontWeight: '800' },
});
