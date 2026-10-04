import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AdminShell } from '@/components/AdminShell';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';

/* eslint-disable react-hooks/set-state-in-effect */

type Tx = {
  id: number;
  clientName: string;
  proName: string;
  method: string;
  total: number;
  status: string;
  createdAt?: string;
};

type Payout = { proId: number; name: string; services: number; net: number };

// Lookify Admin - Pagos y liquidaciones (diseño Stitch, móvil + web).
// KPIs desde bookings reales: facturado, comisión 15%, reembolsos y reparto
// por método de pago. Liquidaciones por profesional (neto 85%) con selección;
// la dispersión bancaria es manual hasta integrar pasarela (alerta honesta).
export default function AdminPayments() {
  const { authFetch } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [filter, setFilter] = useState<'all' | 'ok' | 'pending' | 'refunded'>('all');
  const [txs, setTxs] = useState<Tx[]>([]);
  const [kpis, setKpis] = useState({ gross: 0, count: 0, refunds: 0, refundCount: 0, methods: [] as { method: string; total: number; count: number }[] });
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [done, canc, recent] = await Promise.all([
        authFetch('/items/bookings?filter[status][_eq]=completed&fields=id,price_snapshot,payment_method,professional&limit=500'),
        authFetch('/items/bookings?filter[status][_eq]=cancelled&fields=id,price_snapshot&limit=500'),
        authFetch('/items/bookings?sort=-created_at&limit=30&fields=*,service.*,professional.*,client.*'),
      ]);
      if (done.ok) {
        const { data } = await done.json();
        const rows = Array.isArray(data) ? data : [];
        const gross = rows.reduce((s: number, b: any) => s + (Number(b.price_snapshot) || 0), 0);
        const byMethod = new Map<string, { total: number; count: number }>();
        const byPro = new Map<number, { name: string; services: number; net: number }>();
        for (const b of rows) {
          const m = String(b.payment_method || 'sin método');
          const e = byMethod.get(m) || { total: 0, count: 0 };
          e.total += Number(b.price_snapshot) || 0;
          e.count += 1;
          byMethod.set(m, e);
          const pid = Number(b.professional);
          // professional puede venir expandido en esta query? No: es id plano.
          if (Number.isInteger(pid) && pid > 0) {
            const p = byPro.get(pid) || { name: `PRO-${pid}`, services: 0, net: 0 };
            p.services += 1;
            p.net += (Number(b.price_snapshot) || 0) * 0.85;
            byPro.set(pid, p);
          }
        }
        // Nombres de profesionales para liquidaciones.
        const ids = [...byPro.keys()];
        if (ids.length) {
          const pr = await authFetch(`/items/beauty_professionals?filter[id][_in]=${ids.join(',')}&fields=id,display_name&limit=${ids.length}`);
          if (pr.ok) {
            const { data: pros } = await pr.json();
            for (const x of pros ?? []) {
              const e = byPro.get(Number(x.id));
              if (e) e.name = x.display_name || e.name;
            }
          }
        }
        const plist = [...byPro.entries()]
          .map(([proId, v]) => ({ proId, ...v, net: Math.round(v.net) }))
          .sort((a, b) => b.net - a.net);
        setPayouts(plist);
        setSel(new Set(plist.map((p) => p.proId)));
        setKpis((k) => ({
          ...k,
          gross: Math.round(gross),
          count: rows.length,
          methods: [...byMethod.entries()]
            .map(([method, v]) => ({ method, total: Math.round(v.total), count: v.count }))
            .sort((a, b) => b.total - a.total),
        }));
      }
      if (canc.ok) {
        const { data } = await canc.json();
        const rows = Array.isArray(data) ? data : [];
        setKpis((k) => ({
          ...k,
          refunds: Math.round(rows.reduce((s: number, b: any) => s + (Number(b.price_snapshot) || 0), 0)),
          refundCount: rows.length,
        }));
      }
      if (recent.ok) {
        const { data } = await recent.json();
        setTxs(
          (Array.isArray(data) ? data : []).map((b: any) => ({
            id: Number(b.id),
            clientName:
              typeof b.client === 'object'
                ? b.client?.first_name || b.client?.email || 'Cliente'
                : 'Cliente',
            proName:
              typeof b.professional === 'object'
                ? b.professional?.display_name || `PRO-${b.professional?.id ?? ''}`
                : `PRO-${b.professional ?? '—'}`,
            method: String(b.payment_method || '—'),
            total: Number(b.price_snapshot) || 0,
            status: String(b.status || 'pending'),
            createdAt: b.created_at,
          }))
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const shown = txs.filter((t) => {
    if (filter === 'ok') return t.status === 'completed' || t.status === 'accepted' || t.status === 'in_progress';
    if (filter === 'pending') return t.status === 'pending';
    if (filter === 'refunded') return t.status === 'cancelled';
    return true;
  });

  const statusPill = (s: string) => {
    if (s === 'completed' || s === 'accepted' || s === 'in_progress') return { label: 'Aprobado', bg: Stitch.colors.surfaceContainer, fg: Stitch.colors.onTertiaryContainer };
    if (s === 'pending') return { label: 'Pendiente', bg: Stitch.colors.secondaryContainer + '33', fg: Stitch.colors.onSecondaryContainer };
    if (s === 'cancelled') return { label: 'Reembolsado', bg: Stitch.colors.errorContainer, fg: Stitch.colors.onErrorContainer };
    return { label: s, bg: Stitch.colors.surfaceContainer, fg: Stitch.colors.onSurface };
  };

  const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
  const selTotal = payouts.filter((p) => sel.has(p.proId)).reduce((s, p) => s + p.net, 0);

  const toggle = (id: number) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pay = () => {
    if (sel.size === 0) return;
    Alert.alert(
      'Liquidar',
      `Dispersión manual de ${cop(selTotal)} a ${sel.size} profesionales. La API bancaria aún no está integrada: registra el pago en tu banco y marca las reservas.`,
      [{ text: 'Entendido' }]
    );
  };

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: 'all', label: `Todas (${txs.length})` },
    { key: 'ok', label: 'Aprobadas' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'refunded', label: 'Reembolsadas' },
  ];

  return (
    <AdminShell active="payments" title="Pagos y liquidaciones" subtitle="Transacciones, comisión 15% y dispersión a profesionales">
      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <View style={{ gap: 12 }}>
          <View style={wide ? styles.kpiRow : { gap: 10 }}>
            <View style={styles.kpi}>
              <Text style={styles.kpiL}>FACTURADO BRUTO</Text>
              <Text style={styles.kpiV}>{cop(kpis.gross)} COP</Text>
              <Text style={styles.kpiS}>{kpis.count} transacciones completadas</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={[styles.kpiL, { color: Stitch.colors.secondary }]}>COMISIÓN LOOKIFY (15%)</Text>
              <Text style={[styles.kpiV, { color: Stitch.colors.secondary }]}>{cop(kpis.gross * 0.15)} COP</Text>
              <Text style={styles.kpiS}>Margen antes de fee pasarela</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiL}>PARA PROFESIONALES</Text>
              <Text style={styles.kpiV}>{cop(kpis.gross * 0.85)} COP</Text>
              <Text style={styles.kpiS}>A liquidar acumulado</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={[styles.kpiL, { color: Stitch.colors.error }]}>REEMBOLSOS</Text>
              <Text style={[styles.kpiV, { color: Stitch.colors.error }]}>{cop(kpis.refunds)} COP</Text>
              <Text style={styles.kpiS}>{kpis.refundCount} cancelaciones</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reparto por método de pago</Text>
            {kpis.methods.length === 0 ? (
              <Text style={styles.kpiS}>Sin datos.</Text>
            ) : (
              kpis.methods.map((m) => (
                <View key={m.method} style={styles.methodRow}>
                  <Text style={styles.methodT}>{m.method}</Text>
                  <Text style={styles.kpiS}>
                    {m.count} · {cop(m.total)}
                  </Text>
                </View>
              ))
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            {FILTERS.map((f) => (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.pill, filter === f.key && styles.pillOn]}>
                <Text style={[styles.pillT, filter === f.key && styles.pillTOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {shown.map((t) => {
              const pill = statusPill(t.status);
              return (
                <View key={t.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowId}>TX-{t.id} · {t.clientName} → {t.proName}</Text>
                    <Text style={styles.kpiS}>
                      {t.method} · {t.createdAt ? new Date(t.createdAt).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.rowTotal}>{cop(t.total)}</Text>
                    <Text style={styles.kpiS}>Comisión {cop(t.total * 0.15)}</Text>
                    <View style={[styles.status, { backgroundColor: pill.bg }]}>
                      <Text style={[styles.statusT, { color: pill.fg }]}>{pill.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {shown.length === 0 ? <Text style={styles.empty}>Sin transacciones en este filtro.</Text> : null}
          </ScrollView>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>💸 Liquidaciones pendientes ({sel.size}/{payouts.length})</Text>
            <Text style={styles.kpiS}>Neto 85% por profesional · selección múltiple</Text>
            {payouts.map((p) => {
              const on = sel.has(p.proId);
              return (
                <Pressable key={p.proId} onPress={() => toggle(p.proId)} style={[styles.payRow, !on && styles.payOff]}>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on ? <Text style={styles.checkT}>✓</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowId}>{p.name}</Text>
                    <Text style={styles.kpiS}>{p.services} servicios</Text>
                  </View>
                  <Text style={styles.rowTotal}>{cop(p.net)}</Text>
                </Pressable>
              );
            })}
            {payouts.length === 0 ? <Text style={styles.kpiS}>Sin liquidaciones pendientes.</Text> : null}
            <View style={styles.totalRow}>
              <Text style={styles.cardTitle}>Total a liquidar</Text>
              <Text style={[styles.rowTotal, { color: Stitch.colors.secondary }]}>{cop(selTotal)} COP</Text>
            </View>
            <Pressable style={[styles.payBtn, sel.size === 0 && { opacity: 0.5 }]} onPress={pay} disabled={sel.size === 0}>
              <Text style={styles.payBtnT}>Pagar {sel.size} liquidaciones →</Text>
            </Pressable>
          </View>
        </View>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 14, gap: 2, marginTop: 8 },
  kpiL: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: Stitch.colors.onSurfaceVariant },
  kpiV: { fontSize: 19, fontWeight: '900', color: Stitch.colors.onSurface },
  kpiS: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 14, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  methodRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Stitch.colors.surfaceLow, borderRadius: 10, padding: 10 },
  methodT: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  pills: { gap: 8, paddingVertical: 4 },
  pill: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: Stitch.colors.surfaceHigh },
  pillOn: { backgroundColor: Stitch.colors.primaryContainer },
  pillT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  pillTOn: { color: '#fff' },
  row: { flexDirection: 'row', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, padding: 12, marginTop: 8, alignItems: 'center' },
  rowId: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  rowTotal: { fontSize: 15, fontWeight: '900', color: Stitch.colors.onSurface },
  status: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, marginTop: 4 },
  statusT: { fontSize: 11, fontWeight: '800' },
  empty: { color: Stitch.colors.onSurfaceVariant, textAlign: 'center', marginTop: 16 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12 },
  payOff: { opacity: 0.55 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Stitch.colors.outline, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Stitch.colors.onTertiaryContainer, borderColor: Stitch.colors.onTertiaryContainer },
  checkT: { color: '#fff', fontWeight: '900', fontSize: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  payBtn: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 14, alignItems: 'center' },
  payBtnT: { color: Stitch.colors.primaryContainer, fontWeight: '900' },
});
