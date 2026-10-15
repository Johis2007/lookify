// src/screens/admin/AdminVerificationScreen.tsx
// El admin valida profesionales: cola por estado + dossier con documentos
// reales + aprobar/rechazar con nota. Solo sesión admin.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '../../theme/colors';
import BackHeader from '../../components/BackHeader';
import type { AdminStackParamList } from '../../navigation/AdminStackNavigator';
import { loadAdminSession } from '../../lib/backend/adminAuth';
import {
  assetUrl,
  decideProfessional,
  fetchProDocuments,
  fetchVerificationQueue,
  fileIdOf,
  type VerificationDoc,
  type VerificationFilter,
  type VerificationPro,
} from '../../lib/backend/admin';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminVerification'>;

const FILTERS: { key: VerificationFilter; label: string }[] = [
  { key: 'pending', label: '⏳ Por verificar' },
  { key: 'verified', label: '✅ Aprobados' },
  { key: 'rejected', label: '❌ Rechazados' },
];

export default function AdminVerificationScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [items, setItems] = useState<VerificationPro[]>([]);
  const [filter, setFilter] = useState<VerificationFilter>('pending');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [docs, setDocs] = useState<VerificationDoc[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const session = await loadAdminSession();
    if (!session) {
      navigation.replace('AdminLogin');
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchVerificationQueue(filter);
      setItems(rows);
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    } catch {
      navigation.replace('AdminLogin');
    } finally {
      setLoading(false);
    }
  }, [filter, navigation]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const selected = items.find((p) => p.id === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    let alive = true;
    setDocs([]);
    if (!selected) return;
    fetchProDocuments(selected.id)
      .then((d) => {
        if (alive) setDocs(d);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selected?.id]);

  useEffect(() => {
    setNote(filter === 'pending' ? '' : selected?.verification_note ?? '');
  }, [filter, selected?.id]);

  const decide = async (status: 'verified' | 'rejected') => {
    if (!selected || acting) return;
    const finalNote =
      note.trim() || (status === 'verified' ? 'Aprobado por admin' : 'Documentación insuficiente');
    setActing(true);
    try {
      await decideProfessional(selected.id, status, finalNote);
      setSelectedId(null);
      setNote('');
      const rows = await fetchVerificationQueue(filter);
      setItems(rows);
      setSelectedId(rows[0]?.id ?? null);
    } finally {
      setActing(false);
    }
  };

  const openDoc = (file?: string | { id?: string } | null) => {
    const url = assetUrl(fileIdOf(file));
    if (url) Linking.openURL(url).catch(() => undefined);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader variant="dark" title="Validar profesionales" />
      </View>
      <View style={styles.body}>
        {/* flexGrow:0 evita que en web el ScrollView horizontal se estire a
            lo alto y deforme las pills (mide contenido, como en nativo). */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pills}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => {
                setFilter(f.key);
                setSelectedId(null);
              }}
              style={[styles.pill, filter === f.key && styles.pillOn]}
            >
              <Text style={[styles.pillT, filter === f.key && styles.pillTOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={wide ? styles.rowWide : styles.col}>
              <View style={[styles.card, wide && styles.queueCol]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Cola de verificación</Text>
                  <View style={styles.count}>
                    <Text style={styles.countT}>{items.length}</Text>
                  </View>
                </View>
                {items.map((p) => {
                  const on = selected?.id === p.id;
                  return (
                    <Pressable key={p.id} onPress={() => setSelectedId(p.id)} style={[styles.queueItem, on && styles.queueOn]}>
                      <Avatar uri={assetUrl(p.avatar)} name={p.display_name} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.qName} numberOfLines={1}>
                          {p.display_name || `PRO #${p.id}`}
                        </Text>
                        <Text style={styles.qSub} numberOfLines={1}>
                          {p.specialties || p.bio || 'Sin especialidad'}
                        </Text>
                        <Text style={styles.qSub}>📞 {p.phone || '—'} · ⭐ {p.rating_avg ?? 'nuevo'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
                {items.length === 0 && <Text style={styles.empty}>Sin profesionales {filter}. 🎉</Text>}
              </View>

              {selected && (
                <View style={[styles.card, wide && styles.dossierCol]}>
                  <View style={styles.dossierHead}>
                    <Avatar uri={assetUrl(selected.avatar)} name={selected.display_name} big />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dName}>{selected.display_name}</Text>
                      <Text style={styles.dSub}>{selected.specialties || selected.bio || 'Sin especialidad'}</Text>
                      <Text style={styles.dMeta}>📞 {selected.phone || '—'} · ⭐ {selected.rating_avg ?? 'nuevo'}</Text>
                    </View>
                  </View>

                  <Text style={styles.secT}>📁 Documentos aportados</Text>
                  {docs.length === 0 ? (
                    <Text style={styles.empty}>Sin documentos cargados por el profesional.</Text>
                  ) : (
                    docs.map((d) => (
                      <View key={d.id} style={styles.docRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.docName}>📎 {d.doc_type || 'Documento'}</Text>
                          <Text style={styles.docMeta}>
                            {d.created_at ? new Date(d.created_at).toLocaleDateString('es-CO') : ''}
                            {d.note ? ` · ${d.note.slice(0, 80)}` : ''}
                          </Text>
                        </View>
                        <Pressable onPress={() => openDoc(d.file)}>
                          <Text style={styles.docLink}>Ver →</Text>
                        </Pressable>
                      </View>
                    ))
                  )}

                  {filter === 'pending' ? (
                    <>
                      <Text style={styles.secT}>📝 Nota de decisión</Text>
                      <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Aprobado por admin / motivo del rechazo…"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        style={styles.noteInput}
                      />
                      <View style={styles.btnRow}>
                        <Pressable
                          style={[styles.btn, styles.btnAccept]}
                          onPress={() => decide('verified')}
                          disabled={acting}
                        >
                          <Text style={styles.btnAcceptT}>{acting ? '…' : '✓ Aprobar perfil'}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.btn, styles.btnGhost]}
                          onPress={() => decide('rejected')}
                          disabled={acting}
                        >
                          <Text style={styles.btnGhostT}>Rechazar</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    selected.verification_note ? (
                      <Text style={styles.noteRead}>Nota: {selected.verification_note}</Text>
                    ) : null
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

function Avatar({ uri, name, big }: { uri?: string; name?: string; big?: boolean }) {
  const size = big ? 64 : 46;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.surfaceContainer }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: colors.navy,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.honey, fontWeight: '800', fontSize: big ? 20 : 15 }}>
        {((name ?? 'L').split(' ').map((w) => w[0]).slice(0, 2).join('') || 'L').toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  body: { flex: 1, backgroundColor: colors.surface },
  pills: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pillsScroll: { flexGrow: 0, flexShrink: 0 },
  pill: {
    borderRadius: radius.full,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
  },
  pillOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  pillT: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
  pillTOn: { color: colors.white },
  loader: { marginTop: 40 },
  contentScroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  rowWide: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  col: { gap: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
  },
  queueCol: { width: 340 },
  dossierCol: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  count: { backgroundColor: 'rgba(254,174,44,0.2)', borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 12 },
  countT: { fontWeight: '800', color: colors.secondary, fontSize: 12 },
  queueItem: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', borderRadius: radius.md, padding: spacing.sm },
  queueOn: { backgroundColor: colors.surfaceLow },
  qName: { fontWeight: '800', color: colors.onSurface, fontSize: 14 },
  qSub: { fontSize: 11, color: colors.onSurfaceVariant },
  empty: { textAlign: 'center', color: colors.onSurfaceVariant, marginTop: spacing.lg },
  dossierHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  dName: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  dSub: { fontSize: 13, color: colors.onSurfaceVariant, fontWeight: '600' },
  dMeta: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  secT: { fontSize: 14, fontWeight: '800', color: colors.onSurface, marginTop: spacing.md, marginBottom: 6 },
  docRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: 6,
  },
  docName: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  docMeta: { fontSize: 11, color: colors.onSurfaceVariant },
  docLink: { fontSize: 12, fontWeight: '800', color: colors.secondary },
  noteInput: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: spacing.md,
    minHeight: 70,
    textAlignVertical: 'top',
    color: colors.onSurface,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: { flex: 1, borderRadius: radius.md, padding: 13, alignItems: 'center' },
  btnAccept: { backgroundColor: colors.honey },
  btnAcceptT: { color: colors.navy, fontWeight: '800' },
  btnGhost: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.surfaceHigh },
  btnGhostT: { color: colors.onSurface, fontWeight: '700' },
  noteRead: { fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.md, fontStyle: 'italic' },
});
