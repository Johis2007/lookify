import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth, type LookifyUser } from '@/lib/auth';
import { readJson } from '@/lib/http';
import { confirmNative } from '@/components/ConfirmDialog';
import { createClientProfile, ensureProfessionalProfile } from '@/lib/professional';

// Perfil CLIENTE: perfil personal + accesos a solicitud, búsqueda y
// seguimiento. Sin métricas, sin paneles y sin herramientas PRO.
// (Zona (tabs): RoleGate + guard raíz garantizan cuenta cliente pura.)
export default function Profile() {
  const { user, logout, authFetch, refreshProfile } = useAuth();
  const [isClient, setIsClient] = useState<boolean | null>(null);

  // Rol exclusivo: si ya es cliente (perfil o reservas), no ofrece ser pro.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const cp = await authFetch(`/items/client_profiles?filter[user][_eq]=${user.id}&fields=id&limit=1`);
        const cj = cp.ok ? await readJson<{ data?: unknown[] }>(cp) : null;
        if (alive && Array.isArray(cj?.data) && cj.data.length > 0) {
          setIsClient(true);
          return;
        }
        const bk = await authFetch(`/items/bookings?filter[client][_eq]=${user.id}&fields=id&limit=1`);
        const bj = bk.ok ? await readJson<{ data?: unknown[] }>(bk) : null;
        if (alive) setIsClient(Array.isArray(bj?.data) && bj.data.length > 0);
      } catch {
        if (alive) setIsClient(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authFetch, user]);

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cuentas legado sin rol definido: completar el registro UNA vez (no es
  // conversión: solo aparece si no hay marcas de cliente ni de profesional).
  const completeAs = async (which: 'client' | 'pro') => {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      if (which === 'client') {
        await createClientProfile(authFetch, user.id, user.first_name || user.email);
        setIsClient(true);
        setMsg('Registro completado como cliente.');
      } else {
        const r = await ensureProfessionalProfile(authFetch, user.id, user.first_name || user.email);
        await refreshProfile();
        setMsg(r.message);
      }
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const ok = await confirmNative('Cerrar sesión', '¿Seguro que quieres salir de Lookify?', 'Salir');
    if (!ok) return;
    try {
      await logout();
    } catch {
      // Igual se vuelve al login compartido (Cliente/Profesional/Admin).
    } finally {
      router.replace('/(auth)/login');
    }
  };

  return (
    <ClientProfileView
      user={user}
      isClient={isClient}
      busy={busy}
      msg={msg}
      completeAs={completeAs}
      signOut={signOut}
    />
  );
}

// A nivel de módulo (no anidada en Profile): evita remount y pérdida de estado
// en cada render del padre.
function ClientProfileView({
  user,
  isClient,
  busy,
  msg,
  completeAs,
  signOut,
}: {
  user: LookifyUser | null;
  isClient: boolean | null;
  busy: boolean;
  msg: string | null;
  completeAs: (which: 'client' | 'pro') => void;
  signOut: () => void;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={styles.topBar}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoL}>L</Text>
        </View>
        <Text style={styles.clientBadge}>CLIENTE</Text>
        <View style={{ flex: 1 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarT}>{(user?.first_name?.[0] || 'L').toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.name}>{user?.first_name || 'Lookify Lover'}</Text>
        <View style={styles.specBadge}>
          <Text style={styles.specT}>💅 Cliente Lookify</Text>
        </View>
        <Text style={styles.mail}>{user?.email}</Text>
        {busy && <ActivityIndicator />}
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </View>

      {isClient ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💅 Mi cuenta</Text>
          <Text style={styles.sub}>Esta cuenta reserva servicios. Para ofrecer servicios crea una cuenta profesional aparte.</Text>
        </View>
      ) : isClient === false ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏁 Completa tu registro</Text>
          <Text style={styles.sub}>Tu cuenta es anterior a los roles. Elige uno (solo esta vez):</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={[styles.primaryBtn, { flex: 1 }]} onPress={() => completeAs('client')} disabled={busy}>
              <Text style={styles.primaryT}>Soy cliente</Text>
            </Pressable>
            <Pressable style={[styles.ghostBtn, { flex: 1 }]} onPress={() => completeAs('pro')} disabled={busy}>
              <Text style={styles.ghostT}>Soy profesional</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Accesos cliente: solicitud, búsqueda y seguimiento. */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mis accesos</Text>
        {(
          [
            ['⚡ Solicitar servicio', '/(tabs)/services'],
            ['📡 Buscar profesionales', '/(tabs)/radar'],
            ['🗓 Mis reservas y seguimiento', '/(tabs)/bookings'],
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
  clientBadge: { fontSize: 10, fontWeight: '900', color: Stitch.colors.primaryContainer, backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, letterSpacing: 1 },
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, alignItems: 'center' },
  avatarWrap: { position: 'relative' },
  avatarFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontSize: 36, fontWeight: '900', color: Stitch.colors.primaryContainer },
  name: { fontSize: 19, fontWeight: '800', color: Stitch.colors.onSurface },
  specBadge: { backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  specT: { fontSize: 11, fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  mail: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  msg: { textAlign: 'center', color: Stitch.colors.secondary, fontWeight: '600', fontSize: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface, alignSelf: 'flex-start' },
  sub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, alignSelf: 'flex-start' },
  primaryBtn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginHorizontal: 16, marginTop: 12 },
  primaryT: { color: '#fff', fontWeight: '800' },
  ghostBtn: { borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 12, alignItems: 'center', alignSelf: 'stretch' },
  ghostT: { fontWeight: '700', color: Stitch.colors.onSurface, fontSize: 13 },
  adminRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 13, alignSelf: 'stretch' },
  adminLabel: { fontWeight: '700', color: Stitch.colors.onSurface },
  signOut: { padding: 16, alignItems: 'center' },
  signOutT: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
});
