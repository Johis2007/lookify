import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, Alert } from 'react-native';
import { AdminShell } from '@/components/AdminShell';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';

/* eslint-disable react-hooks/set-state-in-effect */

type Tab = 'all' | 'clients' | 'pros' | 'suspended';

type DirUser = {
  id: string;
  first_name?: string;
  email?: string;
  status?: string;
  date_created?: string;
};

type Dossier = {
  bookings: number;
  spend: number;
  cancels: number;
  ratingGiven: number | null;
  phone?: string;
  address?: string;
  recent: any[];
};

// Lookify Admin - Usuarios (diseño Stitch, móvil + web).
// Directorio directus_users + dossier por usuario (reservas, gasto,
// contacto de client_profiles, historial) y suspender/reactivar.
export default function AdminUsers() {
  const { authFetch } = useAuth();
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
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const autoPicked = useRef(false);
  const LIMIT = 30;

  const load = useCallback(async () => {
    try {
      const search = q.trim() ? `&search=${encodeURIComponent(q.trim())}` : '';
      const statusF = tab === 'suspended' ? '&filter[status][_eq]=suspended' : '';
      const [u, p, cAll, cPros, cSusp] = await Promise.all([
        authFetch(`/users?fields=id,first_name,last_name,email,status,date_created&limit=${LIMIT}&offset=${page * LIMIT}&sort=-date_created&meta=total_count${search}${statusF}`),
        authFetch('/items/beauty_professionals?fields=user&limit=1000'),
        authFetch('/users?limit=1&meta=total_count&fields=id'),
        authFetch('/items/beauty_professionals?limit=1&meta=total_count&fields=id'),
        authFetch('/users?filter[status][_eq]=suspended&limit=1&meta=total_count&fields=id'),
      ]);
      if (u.ok) {
        const j = await u.json();
        setUsers(Array.isArray(j.data) ? j.data : []);
        setTotal(Number(j.meta?.total_count ?? 0));
        if (!autoPicked.current && Array.isArray(j.data) && j.data.length) {
          autoPicked.current = true;
          setSelected(j.data[0]);
        }
      }
      if (p.ok) {
        const j = await p.json();
        setProIds(new Set((Array.isArray(j.data) ? j.data : []).map((r: any) => String(r.user))));
      }
      const meta = async (r: Response) => (r.ok ? Number((await r.json()).meta?.total_count ?? 0) : 0);
      setCounts({ total: await meta(cAll), pros: await meta(cPros), suspended: await meta(cSusp) });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch, page, q, tab]);

  useEffect(() => {
    setLoading(true);
    load();
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
      const [bk, rv, cp] = await Promise.all([
        authFetch(`/items/bookings?filter[client][_eq]=${u.id}&fields=id,price_snapshot,status&limit=100`),
        authFetch(`/items/reviews?filter[client][_eq]=${u.id}&fields=rating&limit=100`),
        authFetch(`/items/client_profiles?filter[user][_eq]=${u.id}&fields=phone,address_text,display_name&limit=1`),
      ]);
      const rows = bk.ok ? ((await bk.json()).data ?? []) : [];
      const ratings = rv.ok ? ((await rv.json()).data ?? []) : [];
      const prof = cp.ok ? ((await cp.json()).data ?? []) : [];
      const completed = rows.filter((b: any) => b.status === 'completed');
      setDossier({
        bookings: rows.length,
        spend: completed.reduce((s: number, b: any) => s + (Number(b.price_snapshot) || 0), 0),
        cancels: rows.filter((b: any) => b.status === 'cancelled').length,
        ratingGiven: ratings.length
          ? ratings.reduce((s: number, r: any) => s + (Number(r.rating) || 0), 0) / ratings.length
          : null,
        phone: prof[0]?.phone,
        address: prof[0]?.address_text,
        recent: [],
      });
      const hist = await authFetch(
        `/items/bookings?filter[client][_eq]=${u.id}&sort=-created_at&limit=5&fields=id,price_snapshot,status,created_at,service.*,professional.*`
      );
      if (hist.ok) {
        const { data } = await hist.json();
        setDossier((d) => (d ? { ...d, recent: Array.isArray(data) ? data : [] } : d));
      }
    } catch {
      /* dossier parcial */
    }
  }, [authFetch]);

  useEffect(() => {
    if (selected) loadDossier(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const toggleSuspend = async () => {
    if (!selected) return;
    const to = selected.status === 'suspended' ? 'active' : 'suspended';
    setMsg(null);
    const r = await authFetch(`/users/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: to }),
    });
    if (!r.ok) {
      setMsg('Sin permiso para cambiar estado (requiere admin en Directus).');
      return;
    }
    setSelected({ ...selected, status: to });
    setUsers((us) => us.map((x) => (x.id === selected.id ? { ...x, status: to } : x)));
    setMsg(to === 'suspended' ? 'Cuenta suspendida.' : 'Cuenta reactivada.');
  };

  const pushNote = () => {
    Alert.alert('Notificación push', 'El envío push se habilita con expo-notifications en la Fase de notificaciones.');
  };

  const fullName = (u: DirUser) => `${u.first_name || ''}`.trim() || u.email || 'Usuario';
  const initials = (u: DirUser) =>
    ((u.first_name?.[0] || '') + '').toUpperCase() || (u.email?.[0] || '?').toUpperCase();
  const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: `Todos (${counts.total})` },
    { key: 'clients', label: `Clientes (${Math.max(0, counts.total - counts.pros)})` },
    { key: 'pros', label: `Profesionales (${counts.pros})` },
    { key: 'suspended', label: `Suspendidos (${counts.suspended})` },
  ];

  return (
    <AdminShell active="users" title="Usuarios" subtitle="Directorio, expedientes y control de accesos">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {TABS.map((f) => (
          <Pressable key={f.key} onPress={() => { setTab(f.key); setLoading(true); }} style={[styles.pill, tab === f.key && styles.pillOn]}>
            <Text style={[styles.pillT, tab === f.key && styles.pillTOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Filtrar por nombre o correo…"
        placeholderTextColor={Stitch.colors.outline}
        style={styles.search}
      />
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <View style={wide ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } : { gap: 12 }}>
          <View style={{ flex: wide ? 3 : undefined, gap: 10 }}>
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            >
              {visible.map((u) => {
                const on = selected?.id === u.id;
                return (
                  <Pressable key={u.id} onPress={() => loadDossier(u)} style={[styles.row, on && styles.rowOn]}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarT}>{initials(u)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{fullName(u)}</Text>
                      <Text style={styles.rowSub}>{u.email || '—'} · {u.status === 'suspended' ? '⛔ Suspendido' : '✅ Activo'}</Text>
                    </View>
                    <Text>→</Text>
                  </Pressable>
                );
              })}
              {visible.length === 0 ? <Text style={styles.empty}>Sin usuarios en este filtro.</Text> : null}
            </ScrollView>
            <View style={styles.pager}>
              <Pressable disabled={page === 0} onPress={() => { setPage(page - 1); setLoading(true); }} style={styles.pageBtn}>
                <Text>← Anterior</Text>
              </Pressable>
              <Text style={styles.pageT}>Pág. {page + 1} de {pages} ({total})</Text>
              <Pressable disabled={page + 1 >= pages} onPress={() => { setPage(page + 1); setLoading(true); }} style={styles.pageBtn}>
                <Text>Siguiente →</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ flex: wide ? 2 : undefined }}>
            {!selected ? (
              <Text style={styles.empty}>Selecciona un usuario.</Text>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{fullName(selected)}</Text>
                <Text style={styles.rowSub}>{selected.email || ''}</Text>
                <Text style={styles.rowSub}>
                  Miembro desde {selected.date_created ? new Date(selected.date_created).toLocaleDateString('es-CO') : '—'}
                </Text>
                <View style={styles.kpis}>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiV}>{dossier?.bookings ?? '…'}</Text>
                    <Text style={styles.kpiL}>Servicios</Text>
                  </View>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiV}>{dossier ? cop(dossier.spend) : '…'}</Text>
                    <Text style={styles.kpiL}>Gasto</Text>
                  </View>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiV}>{dossier?.ratingGiven != null ? dossier.ratingGiven.toFixed(1) : '—'}</Text>
                    <Text style={styles.kpiL}>Califica con</Text>
                  </View>
                </View>
                <Text style={styles.rowSub}>📞 {dossier?.phone || 'Sin teléfono'} · 📍 {dossier?.address || 'Sin dirección'}</Text>
                <Text style={styles.rowSub}>❌ Cancelaciones: {dossier?.cancels ?? '…'}</Text>
                {(dossier?.recent ?? []).map((b: any) => {
                  const svc = typeof b.service === 'object' ? b.service?.name : `Servicio #${b.service}`;
                  const pro = typeof b.professional === 'object' ? b.professional?.display_name : `#${b.professional ?? '—'}`;
                  return (
                    <View key={b.id} style={styles.histRow}>
                      <Text style={styles.histT}>{svc} · {pro}</Text>
                      <Text style={styles.rowSub}>
                        {b.status} · {cop(Number(b.price_snapshot) || 0)}
                      </Text>
                    </View>
                  );
                })}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <Pressable style={[styles.btn, styles.btnGhost]} onPress={pushNote}>
                    <Text style={styles.btnGhostT}>🔔 Notificar</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, selected.status === 'suspended' ? styles.btnAccept : styles.btnDanger]}
                    onPress={toggleSuspend}
                  >
                    <Text style={selected.status === 'suspended' ? styles.btnAcceptT : styles.btnDangerT}>
                      {selected.status === 'suspended' ? '✓ Reactivar' : '⛔ Suspender'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  pills: { gap: 8, paddingVertical: 4 },
  pill: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: Stitch.colors.surfaceHigh },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer },
  pillT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  search: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 12, marginTop: 8, color: Stitch.colors.onSurface },
  msg: { color: Stitch.colors.secondary, fontWeight: '700', fontSize: 12, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 12 },
  rowOn: { borderColor: Stitch.colors.secondaryContainer, borderWidth: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontWeight: '900', color: Stitch.colors.primaryContainer },
  rowName: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  rowSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  empty: { color: Stitch.colors.onSurfaceVariant, textAlign: 'center', marginTop: 20 },
  pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  pageBtn: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  pageT: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 16, gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Stitch.colors.onSurface },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 10, alignItems: 'center' },
  kpiV: { fontSize: 15, fontWeight: '900', color: Stitch.colors.onSurface },
  kpiL: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  histRow: { backgroundColor: Stitch.colors.surfaceLow, borderRadius: 10, padding: 10 },
  histT: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  btn: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, backgroundColor: '#fff' },
  btnGhostT: { fontWeight: '700', color: Stitch.colors.onSurface },
  btnDanger: { backgroundColor: Stitch.colors.errorContainer },
  btnDangerT: { fontWeight: '800', color: Stitch.colors.onErrorContainer },
  btnAccept: { backgroundColor: Stitch.colors.onTertiaryContainer },
  btnAcceptT: { fontWeight: '800', color: '#fff' },
});
