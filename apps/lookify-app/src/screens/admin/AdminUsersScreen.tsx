// src/screens/admin/AdminUsersScreen.tsx
// El admin valida clientes y profesionales: directorio con buscador, tabs,
// dossier (reservas, gasto, contacto, historial) y suspender/reactivar.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
import { resetAdminToLogin } from '../../navigation/adminNavigation';
import { loadAdminSession } from '../../lib/backend/adminAuth';
import {
  fetchProUserIds,
  fetchUserDossier,
  fetchUsersCounts,
  fetchUsersPage,
  setUserStatus,
  type DirUser,
  type UserDossier,
} from '../../lib/backend/admin';
import { formatCOP } from '../../utils/pricing';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminUsers'>;
type Tab = 'all' | 'clients' | 'pros' | 'suspended';

const LIMIT = 30;

export default function AdminUsersScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<DirUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [proIds, setProIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState({ total: 0, pros: 0, suspended: 0 });
  const [selected, setSelected] = useState<DirUser | null>(null);
  const [dossier, setDossier] = useState<UserDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const session = await loadAdminSession();
    if (!session) {
      resetAdminToLogin(navigation);
      return;
    }
    try {
      const [pg, ids, cnt] = await Promise.all([
        fetchUsersPage({ q, suspendedOnly: tab === 'suspended', page, limit: LIMIT }),
        fetchProUserIds(),
        fetchUsersCounts(),
      ]);
      setUsers(pg.users);
      setTotal(pg.total);
      setProIds(ids);
      setCounts(cnt);
      setSelected((prev) => prev ?? pg.users[0] ?? null);
    } catch {
      resetAdminToLogin(navigation);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation, page, q, tab]);

  useEffect(() => {
    setLoading(true);
    load().catch(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [tab, q]);

  const visible = users.filter((u) => {
    if (tab === 'pros') return proIds.has(String(u.id));
    if (tab === 'clients') return !proIds.has(String(u.id));
    return true;
  });

  const loadDossier = useCallback(async (u: DirUser) => {
    setSelected(u);
    setDossier(null);
    try {
      setDossier(await fetchUserDossier(String(u.id)));
    } catch {
      /* dossier parcial */
    }
  }, []);

  useEffect(() => {
    if (selected) loadDossier(selected).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const toggleSuspend = async () => {
    if (!selected) return;
    const to = selected.status === 'suspended' ? 'active' : 'suspended';
    setMsg(null);
    try {
      await setUserStatus(String(selected.id), to);
      setSelected({ ...selected, status: to });
      setUsers((us) => us.map((x) => (x.id === selected.id ? { ...x, status: to } : x)));
      setMsg(to === 'suspended' ? 'Cuenta suspendida.' : 'Cuenta reactivada.');
    } catch {
      setMsg('Sin permiso para cambiar estado.');
    }
  };

  const fullName = (u: DirUser) =>
    `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || 'Usuario';
  const initial = (u: DirUser) => (u.first_name?.[0] ?? u.email?.[0] ?? '?').toUpperCase();
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: `Todos (${counts.total})` },
    { key: 'clients', label: `Clientes (${Math.max(0, counts.total - counts.pros)})` },
    { key: 'pros', label: `Profesionales (${counts.pros})` },
    { key: 'suspended', label: `Suspendidos (${counts.suspended})` },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader variant="dark" title="Validar usuarios" />
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
          {TABS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => {
                setTab(f.key);
                setLoading(true);
              }}
              style={[styles.pill, tab === f.key && styles.pillOn]}
            >
              <Text style={[styles.pillT, tab === f.key && styles.pillTOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.searchWrap}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Filtrar por nombre o correo…"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
          />
        </View>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load().catch(() => setRefreshing(false));
                }}
              />
            }
          >
            <View style={wide ? styles.rowWide : styles.col}>
              <View style={wide ? styles.listCol : undefined}>
                {visible.map((u) => {
                  const on = selected?.id === u.id;
                  const isPro = proIds.has(String(u.id));
                  return (
                    <Pressable key={u.id} onPress={() => loadDossier(u)} style={[styles.row, on && styles.rowOn]}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarT}>{initial(u)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {fullName(u)} {isPro ? '💈' : ''}
                        </Text>
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {u.email || '—'} · {u.status === 'suspended' ? '⛔ Suspendido' : '✅ Activo'}
                        </Text>
                      </View>
                      <Text style={styles.rowArrow}>→</Text>
                    </Pressable>
                  );
                })}
                {visible.length === 0 && <Text style={styles.empty}>Sin usuarios en este filtro.</Text>}
                <View style={styles.pager}>
                  <Pressable
                    disabled={page === 0}
                    onPress={() => {
                      setPage(page - 1);
                      setLoading(true);
                    }}
                    style={styles.pageBtn}
                  >
                    <Text>← Anterior</Text>
                  </Pressable>
                  <Text style={styles.pageT}>
                    Pág. {page + 1} de {pages} ({total})
                  </Text>
                  <Pressable
                    disabled={page + 1 >= pages}
                    onPress={() => {
                      setPage(page + 1);
                      setLoading(true);
                    }}
                    style={styles.pageBtn}
                  >
                    <Text>Siguiente →</Text>
                  </Pressable>
                </View>
              </View>

              <View style={wide ? styles.dossierCol : undefined}>
                {!selected ? (
                  <Text style={styles.empty}>Selecciona un usuario.</Text>
                ) : (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>{fullName(selected)}</Text>
                    <Text style={styles.rowSub}>{selected.email || ''}</Text>
                    <View style={styles.kpis}>
                      <View style={styles.kpi}>
                        <Text style={styles.kpiV}>{dossier?.bookings ?? '…'}</Text>
                        <Text style={styles.kpiL}>Servicios</Text>
                      </View>
                      <View style={styles.kpi}>
                        <Text style={styles.kpiV}>{dossier ? formatCOP(dossier.spend) : '…'}</Text>
                        <Text style={styles.kpiL}>Gasto</Text>
                      </View>
                      <View style={styles.kpi}>
                        <Text style={styles.kpiV}>
                          {dossier?.ratingGiven != null ? dossier.ratingGiven.toFixed(1) : '—'}
                        </Text>
                        <Text style={styles.kpiL}>Califica con</Text>
                      </View>
                    </View>
                    <Text style={styles.rowSub}>
                      📞 {dossier?.phone || 'Sin teléfono'} · 📍 {dossier?.address || 'Sin dirección'}
                    </Text>
                    <Text style={styles.rowSub}>❌ Cancelaciones: {dossier?.cancels ?? '…'}</Text>
                    {(dossier?.recent ?? []).map((b) => (
                      <View key={b.id} style={styles.histRow}>
                        <Text style={styles.histT}>
                          {typeof b.service === 'object' ? (b.service?.name ?? 'Servicio') : `Servicio #${b.service ?? '—'}`}
                        </Text>
                        <Text style={styles.rowSub}>
                          {b.status} · {formatCOP(Number(b.price_snapshot) || 0)}
                        </Text>
                      </View>
                    ))}
                    <Pressable
                      style={[styles.btn, selected.status === 'suspended' ? styles.btnAccept : styles.btnDanger]}
                      onPress={toggleSuspend}
                    >
                      <Text style={selected.status === 'suspended' ? styles.btnAcceptT : styles.btnDangerT}>
                        {selected.status === 'suspended' ? '✓ Reactivar cuenta' : '⛔ Suspender cuenta'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
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
  searchWrap: { paddingHorizontal: spacing.lg },
  search: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: spacing.md,
    color: colors.onSurface,
  },
  msg: { color: colors.secondary, fontWeight: '700', fontSize: 12, marginTop: 6, paddingHorizontal: spacing.lg },
  loader: { marginTop: 40 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  contentScroll: { flex: 1 },
  rowWide: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  col: { gap: spacing.md },
  listCol: { flex: 3 },
  dossierCol: { flex: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowOn: { borderColor: colors.honey, borderWidth: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarT: { fontWeight: '900', color: colors.navy },
  rowName: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.onSurfaceVariant },
  rowArrow: { fontSize: 16, color: colors.onSurfaceVariant },
  empty: { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.lg },
  pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  pageBtn: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
  },
  pageT: { fontSize: 12, color: colors.onSurfaceVariant },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  kpis: { flexDirection: 'row', gap: spacing.sm },
  kpi: { flex: 1, backgroundColor: colors.surfaceLow, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  kpiV: { fontSize: 15, fontWeight: '900', color: colors.onSurface },
  kpiL: { fontSize: 11, color: colors.onSurfaceVariant },
  histRow: { backgroundColor: colors.surfaceLow, borderRadius: radius.sm, padding: spacing.sm },
  histT: { fontSize: 13, fontWeight: '800', color: colors.onSurface },
  btn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  btnDanger: { backgroundColor: colors.errorContainer },
  btnDangerT: { fontWeight: '800', color: colors.onErrorContainer },
  btnAccept: { backgroundColor: colors.onTertiaryContainer },
  btnAcceptT: { fontWeight: '800', color: colors.white },
});
