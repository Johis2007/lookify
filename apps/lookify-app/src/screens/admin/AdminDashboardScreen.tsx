// src/screens/admin/AdminDashboardScreen.tsx
// Portada del panel: KPIs reales de Directus + accesos a verificación y
// usuarios. Solo sesión admin (guard redirige al login).

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '../../theme/colors';
import BackHeader from '../../components/BackHeader';
import { confirmNative } from '../../components/ConfirmDialog';
import type { AdminStackParamList } from '../../navigation/AdminStackNavigator';
import { resetAdminToLogin } from '../../navigation/adminNavigation';
import { clearAdminSession, loadAdminSession } from '../../lib/backend/adminAuth';
import { fetchAdminStats, type AdminBooking, type AdminStats } from '../../lib/backend/admin';
import { formatCOP } from '../../utils/pricing';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminDashboard'>;

export default function AdminDashboardScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recent, setRecent] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await loadAdminSession();
    if (!session) {
      resetAdminToLogin(navigation);
      return;
    }
    try {
      const res = await fetchAdminStats();
      setStats(res.stats);
      setRecent(res.recent);
    } catch {
      // Sin permiso: la sesión ya no es admin.
      await clearAdminSession();
      resetAdminToLogin(navigation);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const handleLogout = async () => {
    const ok = await confirmNative('Cerrar sesión', '¿Salir del panel administrador?', 'Salir');
    if (!ok) return;
    await clearAdminSession();
    resetAdminToLogin(navigation);
  };

  const kpis = stats
    ? [
        {
          label: 'Solicitudes',
          value: String(stats.bookings),
          sub: `${stats.pending} pendientes por asignar`,
          dark: true,
        },
        {
          label: 'Profesionales',
          value: String(stats.pros),
          sub: `${stats.prosOnline} en línea ahora`,
          dark: false,
        },
        {
          label: 'Usuarios',
          value: String(stats.users),
          sub: `${stats.verifyPending} pros por verificar`,
          dark: false,
        },
        {
          label: 'Ingresos',
          value: formatCOP(stats.revenue),
          sub: 'Solo bookings completed',
          dark: false,
        },
      ]
    : [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader
          variant="dark"
          title="Panel administrador"
          rightSlot={
            <Pressable onPress={handleLogout} accessibilityRole="button" accessibilityLabel="Cerrar sesión">
              <MaterialCommunityIcons name="logout" size={22} color={colors.white} />
            </Pressable>
          }
        />
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.scrollContent}
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
          <View style={styles.kpiGrid}>
            {kpis.map((k) => (
              <View key={k.label} style={[styles.kpi, k.dark && styles.kpiDark, wide && styles.kpiWide]}>
                <Text style={[styles.kpiLabel, k.dark && styles.kpiLabelDark]} numberOfLines={1}>
                  {k.label}
                </Text>
                <Text style={[styles.kpiValue, k.dark && styles.kpiValueDark]} numberOfLines={1} adjustsFontSizeToFit>
                  {k.value}
                </Text>
                <Text style={[styles.kpiSub, k.dark && styles.kpiSubDark]} numberOfLines={2}>
                  {k.sub}
                </Text>
              </View>
            ))}
          </View>

          <View style={wide ? styles.rowWide : styles.col}>
            <View style={[styles.card, wide && styles.cardFlex]}>
              <Text style={styles.cardTitle}>Validar</Text>
              <Text style={styles.cardSub}>Colas de revisión del admin</Text>
              <Pressable style={styles.navRow} onPress={() => navigation.navigate('AdminVerification')}>
                <Text style={styles.navRowT}>
                  ✅ Profesionales {(stats?.verifyPending ?? 0) > 0 ? `(${stats?.verifyPending} pendientes)` : ''}
                </Text>
                <Text style={styles.navRowArrow}>→</Text>
              </Pressable>
              <Pressable style={styles.navRow} onPress={() => navigation.navigate('AdminUsers')}>
                <Text style={styles.navRowT}>👥 Clientes y profesionales ({stats?.users ?? 0})</Text>
                <Text style={styles.navRowArrow}>→</Text>
              </Pressable>
            </View>

            <View style={[styles.card, wide && styles.cardFlex]}>
              <Text style={styles.cardTitle}>Solicitudes recientes</Text>
              <Text style={styles.cardSub}>Último movimiento en Directus</Text>
              {recent.map((b) => (
                <View key={b.id} style={styles.feedRow}>
                  <View style={styles.feedAvatar}>
                    <Text style={styles.feedAvatarT}>#{b.id}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedT}>
                      {typeof b.service === 'object' ? (b.service?.name ?? 'Servicio') : `Servicio #${b.service ?? '—'}`}
                    </Text>
                    <Text style={styles.feedS}>
                      {formatCOP(Number(b.price_snapshot) || 0)} · {b.status}
                    </Text>
                  </View>
                  <Text style={styles.feedTime}>
                    {b.created_at
                      ? new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </Text>
                </View>
              ))}
              {recent.length === 0 && <Text style={styles.cardSub}>Sin movimiento reciente.</Text>}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  loader: { marginTop: 40 },
  body: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpi: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
  },
  kpiWide: { flexBasis: 0 },
  kpiDark: { backgroundColor: colors.navy, borderColor: colors.navy },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant, flex: 1 },
  kpiLabelDark: { color: colors.textOnNavyMuted },
  kpiValue: { fontSize: 26, fontWeight: '800', color: colors.onSurface, marginTop: spacing.sm },
  kpiValueDark: { color: colors.white },
  kpiSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  kpiSubDark: { color: colors.textOnNavyMuted },
  rowWide: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  col: { gap: spacing.md },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.surfaceHigh },
  cardFlex: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  cardSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  navRowT: { fontSize: 14, fontWeight: '700', color: colors.onSurface, flex: 1 },
  navRowArrow: { fontSize: 16, color: colors.onSurfaceVariant },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  feedAvatar: { backgroundColor: colors.navy, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10 },
  feedAvatarT: { color: colors.honey, fontWeight: '800', fontSize: 12 },
  feedT: { fontWeight: '800', color: colors.onSurface, fontSize: 13 },
  feedS: { fontSize: 11, color: colors.onSurfaceVariant },
  feedTime: { fontSize: 11, color: colors.outline },
});
