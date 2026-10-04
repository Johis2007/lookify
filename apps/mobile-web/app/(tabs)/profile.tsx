import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { confirmNative } from '@/components/ConfirmDialog';
import { ensureProfessionalProfile, uploadProfessionalAvatar } from '@/lib/professional';
import { useProLive } from '@/lib/proLive';

// Lookify PRO - Perfil y Portafolio (diseño Stitch, móvil + web).
export default function Profile() {
  const { user, isProfessional, logout, authFetch, refreshProfile } = useAuth();
  const proLive = useProLive(authFetch, user?.id, isProfessional);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [tab, setTab] = useState<'portfolio' | 'services'>('portfolio');

  const activatePro = async () => {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await ensureProfessionalProfile(authFetch, user.id, user.first_name || user.email);
      await refreshProfile();
      setMsg(r.message);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const pickAvatar = async () => {
    if (!user) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setMsg('Permiso de galería denegado.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const url = await uploadProfessionalAvatar(authFetch, user.id, res.assets[0].uri);
      setAvatar(url);
      setMsg('Avatar actualizado ✨');
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    const ok = await confirmNative('Cerrar sesión', '¿Seguro que quieres salir de Lookify?', 'Salir');
    if (!ok) return;
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={styles.topBar}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoL}>L</Text>
        </View>
        <Text style={styles.proBadge}>PRO</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.onlinePill}>
          <View style={[styles.dot, proLive.isOnline && styles.dotOn]} />
          <Text style={styles.onlinePillT}>{proLive.isOnline ? 'En línea' : 'Offline'}</Text>
        </View>
      </View>

      {/* Resumen perfil */}
      <View style={styles.card}>
        <View style={styles.avatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.bigAvatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarT}>{(user?.first_name?.[0] || 'L').toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.verified}>
            <Text style={styles.verifiedT}>✓</Text>
          </View>
        </View>
        <Text style={styles.name}>{user?.first_name || 'Lookify Lover'}</Text>
        <View style={styles.specBadge}>
          <Text style={styles.specT}>
            {isProfessional ? '✂️ Master Stylist & Colorista' : '💅 Cliente Lookify'}
          </Text>
        </View>
        <Text style={styles.mail}>{user?.email}</Text>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statV}>★ 4.9</Text>
            <Text style={styles.statL}>125 reseñas</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statV, { color: Stitch.colors.onTertiaryContainer }]}>98%</Text>
            <Text style={styles.statL}>Aceptación</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>5 años</Text>
            <Text style={styles.statL}>Experiencia</Text>
          </View>
        </View>
        {busy && <ActivityIndicator />}
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </View>

      {!isProfessional ? (
        <Pressable style={styles.primaryBtn} onPress={activatePro} disabled={busy}>
          <Text style={styles.primaryT}>Activar perfil profesional →</Text>
        </Pressable>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{proLive.isOnline ? '🟢 Estás online' : '⚪ Estás offline'}</Text>
          <Text style={styles.sub}>
            {proLive.isOnline
              ? `GPS cada 8s / 20m${proLive.lastFix ? ` · ${proLive.lastFix.latitude.toFixed(4)}, ${proLive.lastFix.longitude.toFixed(4)}` : ''}`
              : 'Actívate para aparecer en el mapa y recibir solicitudes.'}
          </Text>
          {proLive.error ? <Text style={styles.msg}>{proLive.error}</Text> : null}
          <Pressable
            style={[styles.toggleBtn, proLive.isOnline && styles.toggleOn]}
            onPress={() => proLive.setOnline(!proLive.isOnline)}
          >
            <Text style={[styles.toggleT, proLive.isOnline && { color: '#fff' }]}>
              {proLive.isOnline ? 'Pasar a offline' : 'Ponerme online 📡'}
            </Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={pickAvatar}>
            <Text style={styles.ghostT}>📷 Subir avatar</Text>
          </Pressable>
        </View>
      )}

      {/* Pestañas */}
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'portfolio' && styles.tabOn]} onPress={() => setTab('portfolio')}>
          <Text style={[styles.tabT, tab === 'portfolio' && styles.tabTOn]}>🖼️ Mi Portafolio</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'services' && styles.tabOn]} onPress={() => setTab('services')}>
          <Text style={[styles.tabT, tab === 'services' && styles.tabTOn]}>💈 Servicios</Text>
        </Pressable>
      </View>

      {tab === 'portfolio' ? (
        <View style={styles.card}>
          <Text style={styles.tip}>💡 Estas fotos son lo primero que ve el cliente en el radar.</Text>
          <View style={styles.grid}>
            {['Balayage Honey', 'Técnica de Corte', 'Peinado Novia', 'Fade & Barba'].map((t) => (
              <View key={t} style={styles.tile}>
                <Text style={styles.tileEmoji}>💇</Text>
                <Text style={styles.tileT}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.svcRow}>
            <Text style={styles.svcName}>Corte estructurado dama</Text>
            <Text style={styles.svcPrice}>$55.000 <Text style={styles.svcBase}>· base $50.000</Text></Text>
          </View>
          <View style={styles.svcRow}>
            <Text style={styles.svcName}>Barbería & toalla caliente</Text>
            <Text style={styles.svcPrice}>$45.000 <Text style={styles.svcBase}>· base $40.000</Text></Text>
          </View>
          <Text style={styles.sub}>Rango permitido ±20% · edítalo en Admin → Servicios y tarifas.</Text>
        </View>
      )}

      {/* Admin */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Panel admin</Text>
        {(
          [
            ['📊 Dashboard', '/admin/dashboard'],
            ['🔴 Solicitudes en vivo', '/admin/requests'],
            ['💰 Servicios y tarifas', '/admin/services'],
            ['✅ Verificación', '/admin/verification'],
          ] as const
        ).map(([label, href]) => (
          <Pressable key={href} style={styles.adminRow} onPress={() => router.push(href as any)}>
            <Text style={styles.adminLabel}>{label}</Text>
            <Text>→</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutT}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  logoCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  logoL: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 18 },
  proBadge: { fontSize: 10, fontWeight: '900', color: Stitch.colors.onSecondaryContainer, backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, letterSpacing: 1 },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Stitch.colors.outline },
  dotOn: { backgroundColor: Stitch.colors.onTertiaryContainer },
  onlinePillT: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurface },
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, alignItems: 'center' },
  avatarWrap: { position: 'relative' },
  bigAvatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontSize: 36, fontWeight: '900', color: Stitch.colors.primaryContainer },
  verified: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: Stitch.colors.secondaryContainer, alignItems: 'center', justifyContent: 'center' },
  verifiedT: { color: Stitch.colors.primaryContainer, fontWeight: '900' },
  name: { fontSize: 19, fontWeight: '800', color: Stitch.colors.onSurface },
  specBadge: { backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  specT: { fontSize: 11, fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  mail: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  stats: { flexDirection: 'row', gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12, alignSelf: 'stretch', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statV: { fontSize: 16, fontWeight: '900', color: Stitch.colors.onSurface },
  statL: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  msg: { textAlign: 'center', color: Stitch.colors.secondary, fontWeight: '600', fontSize: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface, alignSelf: 'flex-start' },
  sub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, alignSelf: 'flex-start' },
  primaryBtn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginHorizontal: 16, marginTop: 12 },
  primaryT: { color: '#fff', fontWeight: '800' },
  toggleBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 13, alignItems: 'center', alignSelf: 'stretch' },
  toggleOn: { backgroundColor: Stitch.colors.onTertiaryContainer, borderColor: Stitch.colors.onTertiaryContainer },
  toggleT: { fontWeight: '800', color: Stitch.colors.onSurface },
  ghostBtn: { borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 12, alignItems: 'center', alignSelf: 'stretch' },
  ghostT: { fontWeight: '700', color: Stitch.colors.onSurface, fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 14, padding: 4, marginHorizontal: 16, marginTop: 12 },
  tab: { flex: 1, borderRadius: 10, padding: 11, alignItems: 'center' },
  tabOn: { backgroundColor: Stitch.colors.primaryContainer },
  tabT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  tabTOn: { color: '#fff' },
  tip: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, alignSelf: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch' },
  tile: { width: '48%', height: 120, borderRadius: 12, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tileEmoji: { fontSize: 30 },
  tileT: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onSurface },
  svcRow: { alignSelf: 'stretch', backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12 },
  svcName: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  svcPrice: { fontSize: 14, fontWeight: '900', color: Stitch.colors.onSurface, marginTop: 4 },
  svcBase: { fontSize: 11, color: Stitch.colors.onSurfaceVariant, fontWeight: '400' },
  adminRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 13, alignSelf: 'stretch' },
  adminLabel: { fontWeight: '700', color: Stitch.colors.onSurface },
  signOut: { padding: 16, alignItems: 'center' },
  signOutT: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
});
