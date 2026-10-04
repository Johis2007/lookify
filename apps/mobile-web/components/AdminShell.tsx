// Shell admin Lookify — réplica RN del layout Stitch web_dashboard.
// Web ancho (>=1024): sidebar navy fijo + header. Móvil: topbar navy + nav horizontal.
// Tokens: StitchTheme (primaryContainer #0f1e36, secondaryContainer #feae2c, surface #f9f9ff).
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';

export type AdminSection = 'dashboard' | 'requests' | 'verification' | 'services';

const NAV: { key: AdminSection; label: string; icon: string; href: string; badge?: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', href: '/admin/dashboard' },
  { key: 'requests', label: 'Solicitudes en vivo', icon: '📡', href: '/admin/requests', badge: 'live' },
  { key: 'verification', label: 'Profesionales', icon: '🎖', href: '/admin/verification' },
  { key: 'services', label: 'Servicios y tarifas', icon: '💈', href: '/admin/services' },
];

export function AdminShell({
  active,
  title,
  subtitle,
  children,
}: {
  active: AdminSection;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 1024;

  if (!wide) {
    return (
      <View style={styles.screen}>
        <View style={styles.mobileTop}>
          <Pressable onPress={() => router.back()} style={styles.mobileBack}>
            <Text style={styles.mobileBackT}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.mobileTitle}>{title}</Text>
            {!!subtitle && <Text style={styles.mobileSub} numberOfLines={1}>{subtitle}</Text>}
          </View>
          <View style={styles.liveDot} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNav}>
          {NAV.map((n) => (
            <Pressable
              key={n.key}
              onPress={() => router.push(n.href as any)}
              style={[styles.mobilePill, active === n.key && styles.mobilePillOn]}
            >
              <Text style={[styles.mobilePillT, active === n.key && styles.mobilePillTOn]}>
                {n.icon} {n.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={styles.mobileBody}>{children}</ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { flexDirection: 'row' }]}>
      {/* Sidebar navy */}
      <View style={styles.sidebar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkT}>L</Text>
          </View>
          <Text style={styles.brandName}>Lookify</Text>
          <View style={styles.brandDot} />
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeT}>Admin</Text>
          </View>
        </View>
        <View style={styles.superRow}>
          <Text style={styles.superT}>● Super Administrador · Bogotá</Text>
        </View>
        <View style={{ gap: 4 }}>
          {NAV.map((n) => {
            const on = active === n.key;
            return (
              <Pressable
                key={n.key}
                onPress={() => router.push(n.href as any)}
                style={[styles.navItem, on && styles.navItemOn]}
              >
                <Text style={styles.navIcon}>{n.icon}</Text>
                <Text style={[styles.navLabel, on && styles.navLabelOn]}>{n.label}</Text>
                {n.badge === 'live' && (
                  <View style={styles.livePill}>
                    <Text style={styles.livePillT}>live</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.sideFoot}>
          <Text style={styles.sideFootT}>● Directus · Online</Text>
          <Text style={styles.sideFootSub}>Nodo Bogotá Norte</Text>
        </View>
      </View>

      {/* Columna derecha */}
      <View style={{ flex: 1 }}>
        <View style={styles.topbar}>
          <View style={styles.searchFake}>
            <Text style={styles.searchFakeT}>⌕ Buscar solicitud, usuario o profesional…</Text>
          </View>
          <View style={styles.locPill}>
            <Text style={styles.locPillT}>📍 Bogotá D.C. · Todas las zonas</Text>
          </View>
          <Pressable style={styles.cta} onPress={() => router.push('/admin/requests' as any)}>
            <Text style={styles.ctaT}>+ Nueva solicitud</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.webBody}>
          <Text style={styles.webTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.webSub}>{subtitle}</Text>}
          <View style={{ height: 12 }} />
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  // Móvil
  mobileTop: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Stitch.colors.primaryContainer, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16,
  },
  mobileBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  mobileBackT: { color: '#fff', fontWeight: '900', fontSize: 16 },
  mobileTitle: { color: '#fff', fontSize: 19, fontWeight: '800', fontFamily: Stitch.font },
  mobileSub: { color: Stitch.colors.surfaceHighest, fontSize: 12 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Stitch.colors.secondaryContainer },
  mobileNav: { gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Stitch.colors.primaryContainer },
  mobilePill: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.12)' },
  mobilePillOn: { backgroundColor: Stitch.colors.secondaryContainer },
  mobilePillT: { color: '#fff', fontSize: 12, fontWeight: '700' },
  mobilePillTOn: { color: Stitch.colors.primaryContainer },
  mobileBody: { padding: 16, gap: 12, paddingBottom: 40 },
  // Web
  sidebar: { width: 272, backgroundColor: Stitch.colors.primaryContainer, padding: 16, gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  brandMarkT: { fontWeight: '900', color: Stitch.colors.primaryContainer, fontSize: 18 },
  brandName: { color: '#fff', fontWeight: '800', fontSize: 18 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Stitch.colors.secondaryContainer },
  adminBadge: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  adminBadgeT: { color: Stitch.colors.secondaryContainer, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  superRow: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 },
  superT: { color: '#B8C7E6', fontSize: 11, fontWeight: '700' },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12 },
  navItemOn: { backgroundColor: 'rgba(255,255,255,0.10)' },
  navIcon: { fontSize: 18 },
  navLabel: { color: '#8fa0bf', fontSize: 13, fontWeight: '700', flex: 1 },
  navLabelOn: { color: '#fff' },
  livePill: { backgroundColor: 'rgba(78,222,163,0.2)', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  livePillT: { color: Stitch.colors.tertiaryFixedDim, fontSize: 10, fontWeight: '800' },
  sideFoot: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 },
  sideFootT: { color: Stitch.colors.tertiaryFixedDim, fontSize: 11, fontWeight: '800' },
  sideFootSub: { color: '#8fa0bf', fontSize: 11 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  searchFake: { flex: 1, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  searchFakeT: { color: Stitch.colors.outline, fontSize: 13 },
  locPill: { backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  locPillT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  cta: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16 },
  ctaT: { fontWeight: '800', color: Stitch.colors.primaryContainer, fontSize: 13 },
  webBody: { padding: 24, paddingBottom: 60, maxWidth: 1200 },
  webTitle: { fontSize: 28, fontWeight: '800', color: Stitch.colors.onSurface, fontFamily: Stitch.font },
  webSub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
});
