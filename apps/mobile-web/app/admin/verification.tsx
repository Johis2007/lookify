// Lookify Admin - Verificación de Profesionales (Stitch web_dashboard).
// Réplica RN: cola de verificación (izq) + dossier del candidato (der).
// Responsive: dos columnas en web, apilado en móvil. Datos desde Directus.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, Image } from 'react-native';
import { AdminShell } from '@/components/AdminShell';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { assetUrl } from '@/lib/directus';
import { readJson } from '@/lib/http';

const FILTERS = ['pending', 'verified', 'rejected'] as const;

export default function AdminVerification() {
  const { authFetch } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('pending');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(
        `/items/beauty_professionals?filter[verification_status][_eq]=${filter}&limit=30&fields=*,avatar&sort=-id`
      );
      if (r.ok) {
        const data = (await readJson<{ data?: any[] }>(r))?.data ?? [];
        setItems(data);
        setSelectedId((prev) => prev ?? (data?.[0]?.id ?? null));
      }
    } finally { setLoading(false); }
  }, [authFetch, filter]);

  // Carga inicial + refetch al cambiar de filtro (fetch a Directus = sistema externo).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(() => {}); }, [load]);

  const decide = async (id: number, status: 'verified' | 'rejected') => {
    await authFetch(`/items/beauty_professionals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        verification_status: status,
        verification_note: status === 'verified' ? 'Aprobado por admin' : 'Documentación insuficiente',
      }),
    });
    setSelectedId(null);
    load().catch(() => {});
  };

  const selected = items.find((p) => p.id === selectedId) || items[0];

  // Documentos reales subidos en el registro (professional_documents + file).
  useEffect(() => {
    let alive = true;
    if (!selected) return;
    (async () => {
      try {
        const r = await authFetch(
          `/items/professional_documents?filter[professional][_eq]=${selected.id}&fields=*,file&limit=10&sort=-created_at`
        );
        if (r.ok) {
          const data = (await readJson<{ data?: any[] }>(r))?.data;
          if (alive && Array.isArray(data)) setDocs(data);
        }
      } catch {
        /* sin documentos */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const openDoc = (fileId?: string | null) => {
    const url = fileId ? assetUrl(fileId) : null;
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <AdminShell active="verification" title="Verificación de Profesionales" subtitle="Revisión documental, antecedentes y calibración tarifaria ±20%">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => { setFilter(f); setSelectedId(null); }} style={[styles.pill, filter === f && styles.pillOn]}>
            <Text style={[styles.pillT, filter === f && styles.pillTOn]}>
              {f === 'pending' ? '⏳ Por verificar' : f === 'verified' ? '✅ Aprobados' : '❌ Rechazados'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator style={{ marginTop: 30 }} /> : (
        <View style={wide ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } : { gap: 12 }}>
          {/* Cola */}
          <View style={[styles.card, wide && { width: 340 }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Cola de verificación</Text>
              <View style={styles.count}><Text style={styles.countT}>{items.length}</Text></View>
            </View>
            {items.map((p) => {
              const on = selected?.id === p.id;
              return (
                <Pressable key={p.id} onPress={() => setSelectedId(p.id)} style={[styles.queueItem, on && styles.queueOn]}>
                  {on && <View style={styles.queueBar} />}
                  <AvatarBlock uri={assetUrl(typeof p.avatar === 'string' ? p.avatar : p.avatar?.id)} name={p.display_name} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.qName} numberOfLines={1}>{p.display_name || `PRO #${p.id}`}</Text>
                    <Text style={styles.qSub} numberOfLines={1}>{p.specialties || p.bio || 'Sin especialidad'} · {p.years_exp || 0} años</Text>
                    <Text style={styles.qSub}>📞 {p.phone || '—'} · ⭐ {p.rating_avg ?? 'nuevo'}</Text>
                  </View>
                </Pressable>
              );
            })}
            {!items.length && <Text style={styles.empty}>Sin profesionales {filter}. 🎉</Text>}
            <View style={styles.helper}>
              <Text style={styles.helperT}>Los PRO no reciben solicitudes hasta verificar documentos y estar dentro de la banda ±20%.</Text>
            </View>
          </View>

          {/* Dossier */}
          {selected && (
            <View style={[styles.card, { flex: 1 }]}>
              <View style={styles.dossierHead}>
                <AvatarBlock uri={assetUrl(typeof selected.avatar === 'string' ? selected.avatar : selected.avatar?.id)} name={selected.display_name} big />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dName}>{selected.display_name}</Text>
                  <Text style={styles.dSub}>{selected.specialties || selected.bio || 'Sin especialidad'}</Text>
                  <Text style={styles.dMeta}>📞 {selected.phone || '—'} · ⭐ {selected.rating_avg ?? 'nuevo'} · {selected.years_exp || 0} años exp.</Text>
                </View>
              </View>

              {/* Documentos reales del registro */}
              <Text style={styles.secT}>📁 Documentos aportados</Text>
              {docs.length === 0 ? (
                <Text style={styles.empty}>Sin documentos cargados por el profesional.</Text>
              ) : (
                docs.map((d: any) => {
                  const st = String(d.status || 'pending');
                  const okDoc = st === 'verified';
                  return (
                    <View key={d.id} style={styles.docRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docName}>📎 {d.doc_type || 'Documento'}</Text>
                        <Text style={styles.empty}>
                          {d.created_at ? new Date(d.created_at).toLocaleDateString('es-CO') : ''}
                          {d.note ? ` · ${d.note}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.docState, { backgroundColor: okDoc ? 'rgba(78,222,163,0.18)' : Stitch.colors.surfaceContainer }]}>
                        <Text style={[styles.docStateT, { color: okDoc ? Stitch.colors.onTertiaryContainer : Stitch.colors.onSurfaceVariant }]}>
                          {st === 'verified' ? 'Verificado' : st === 'rejected' ? 'Rechazado' : 'En revisión'}
                        </Text>
                      </View>
                      <Pressable onPress={() => openDoc(typeof d.file === 'object' ? d.file?.id : d.file)}>
                        <Text style={[styles.docStateT, { color: Stitch.colors.secondary }]}>Ver →</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}

              {/* Banda tarifaria */}
              <View style={styles.band}>
                <Text style={styles.secT}>💰 Banda tarifaria Lookify ±20%</Text>
                <Text style={styles.bandSub}>Base oficial del catálogo. El PRO ajusta según experiencia y portafolio verificado.</Text>
                <View style={styles.bandRow}>
                  {['Mín −20%', 'Base', 'Máx +20%'].map((l, i) => (
                    <View key={l} style={[styles.bandBox, i === 1 && styles.bandBase]}>
                      <Text style={[styles.bandL, i === 1 && { color: Stitch.colors.secondaryContainer }]}>{l}</Text>
                      <Text style={[styles.bandV, i === 1 && { color: '#fff' }]}>—</Text>
                    </View>
                  ))}
                </View>
              </View>

              {filter === 'pending' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Pressable style={[styles.btn, styles.btnAccept]} onPress={() => decide(selected.id, 'verified')}>
                    <Text style={styles.btnAcceptT}>✓ Aprobar perfil</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => decide(selected.id, 'rejected')}>
                    <Text style={styles.btnGhostT}>Rechazar</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </AdminShell>
  );
}

function AvatarBlock({ uri, name, big }: { uri?: string | null; name?: string; big?: boolean }) {
  const size = big ? 64 : 46;
  const initials = (name || 'L').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: Stitch.colors.surfaceContainer }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: Stitch.colors.secondaryContainer, fontWeight: '800', fontSize: big ? 20 : 15 }}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { gap: 8, paddingVertical: 4 },
  pill: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  pillT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: Stitch.radius.lg, padding: 16, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Stitch.colors.onSurface, fontFamily: Stitch.font },
  count: { backgroundColor: 'rgba(254,174,44,0.2)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 },
  countT: { fontWeight: '800', color: Stitch.colors.secondary, fontSize: 12 },
  queueItem: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 12, padding: 10, position: 'relative' },
  queueOn: { backgroundColor: Stitch.colors.surfaceLow },
  queueBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 4, borderRadius: 2, backgroundColor: Stitch.colors.secondaryContainer },
  qName: { fontWeight: '800', color: Stitch.colors.onSurface, fontSize: 14 },
  qSub: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  helper: { backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 12, padding: 12, marginTop: 10 },
  helperT: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, lineHeight: 17 },
  empty: { textAlign: 'center', color: Stitch.colors.onSurfaceVariant, marginTop: 20 },
  dossierHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dName: { fontSize: 20, fontWeight: '800', color: Stitch.colors.onSurface, fontFamily: Stitch.font },
  dSub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, fontWeight: '600' },
  dMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  secT: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface, marginTop: 16, marginBottom: 6, fontFamily: Stitch.font },
  docRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Stitch.colors.surfaceLow, borderRadius: 10, padding: 10, marginTop: 6 },
  docName: { fontSize: 13, fontWeight: '700', color: Stitch.colors.onSurface },
  docState: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  docStateT: { fontSize: 11, fontWeight: '800' },
  band: { backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12, marginTop: 12 },
  bandSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  bandRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  bandBox: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  bandBase: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  bandL: { fontSize: 9, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, textTransform: 'uppercase' },
  bandV: { fontSize: 14, fontWeight: '900', color: Stitch.colors.onSurface, marginTop: 2 },
  btn: { flex: 1, borderRadius: 12, padding: 13, alignItems: 'center' },
  btnAccept: { backgroundColor: Stitch.colors.secondaryContainer },
  btnAcceptT: { color: Stitch.colors.primaryContainer, fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  btnGhostT: { color: Stitch.colors.onSurface, fontWeight: '700' },
});
