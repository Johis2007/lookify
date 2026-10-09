import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { homeForRole } from '@/lib/roleGuard';

type RoleTab = 'client' | 'pro' | 'admin';

const ROLE_MISMATCH: Record<RoleTab, string> = {
  client: 'Esta cuenta no es de cliente. Entra por su rol o crea una cuenta cliente aparte.',
  pro: 'Esta cuenta no es profesional. Entra por su rol o regístrate como profesional.',
  admin: 'Esta cuenta no es administradora. El acceso al panel es solo para administradores.',
};

// Lookify - Login (rediseño mock: fondo navy + tarjeta blanca superior redondeada,
// toggle Ingresar/Crear cuenta + entrada por rol; lógica Directus intacta).
export default function LoginScreen() {
  const { login, logout } = useAuth();
  const [role, setRole] = useState<RoleTab>('client');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailFormatOk = /.+@.+\..+/.test(email.trim());
  const emailError = touched.email && !emailFormatOk ? 'Ingresa un correo válido' : null;
  const passwordError =
    touched.password && password.length < 1 ? 'Ingresa tu contraseña' : null;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const detected = await login(email.trim(), password);
      // La cuenta debe coincidir con la entrada elegida (una cuenta, un rol).
      const match =
        role === 'admin'
          ? detected.isAdmin
          : role === 'pro'
            ? detected.isProfessional && !detected.isAdmin
            : !detected.isProfessional && !detected.isAdmin;
      if (!match) {
        await logout();
        setError(ROLE_MISMATCH[role]);
        return;
      }
      router.replace(homeForRole(detected.isProfessional, detected.isAdmin) as any);
    } catch (e: any) {
      setError(e.message ?? 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header navy centrado (estilo mock) */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoL}>L</Text>
          </View>
          <Text style={styles.brand}>Lookify</Text>
          <Text style={styles.tagline}>Belleza a un toque de distancia</Text>
        </View>

        {/* Tarjeta blanca con radio superior */}
        <View style={styles.card}>
          {/* Toggle Ingresar / Crear cuenta (estilo mock) */}
          <View style={styles.tabs}>
            <Pressable style={[styles.tab, styles.tabActive]}>
              <Text style={[styles.tabText, styles.tabTextActive]}>Ingresar</Text>
            </Pressable>
            <Pressable style={styles.tab} onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.tabText}>Crear cuenta</Text>
            </Pressable>
          </View>

          <Text style={styles.h2}>Bienvenido de nuevo</Text>
          <Text style={styles.cardSub}>Entra por el rol de tu cuenta</Text>

          <View style={styles.roleRow}>
            {(
              [
                ['client', '💅 Cliente'],
                ['pro', '✂️ Profesional'],
                ['admin', '🛡️ Admin'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setRole(key)}
                style={[styles.roleTab, role === key && styles.roleTabOn]}
              >
                <Text style={[styles.roleT, role === key && styles.roleTOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {role === 'admin' && (
            <Text style={styles.adminHint}>
              Acceso restringido: usa la cuenta administradora creada en Directus (ADMIN_EMAIL).
            </Text>
          )}

          <Text style={styles.label}>Correo electrónico</Text>
          <View style={[styles.field, emailError && styles.fieldError]}>
            <Text style={styles.fieldIcon}>✉️</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="nombre@correo.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              placeholderTextColor="#75777e"
            />
          </View>
          {emailError ? <Text style={styles.inlineError}>{emailError}</Text> : null}

          <Text style={styles.label}>Contraseña</Text>
          <View style={[styles.field, passwordError && styles.fieldError]}>
            <Text style={styles.fieldIcon}>🔒</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="••••••••"
              secureTextEntry={!showPw}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              onBlur={() => setTouched((p) => ({ ...p, password: true }))}
              placeholderTextColor="#75777e"
            />
            <Pressable onPress={() => setShowPw(!showPw)}>
              <Text style={styles.eye}>{showPw ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>
          {passwordError ? <Text style={styles.inlineError}>{passwordError}</Text> : null}

          <Pressable style={styles.forgotWrap}>
            <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
          </Pressable>

          {error ? <Text style={styles.loginError}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, (busy || !email || !password) && { opacity: 0.55 }]}
            onPress={submit}
            disabled={busy || !email || !password}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnT}>Ingresar</Text>}
          </Pressable>

          <Link href="/(auth)/register" asChild>
            <Pressable style={styles.link}>
              <Text style={styles.linkSub}>
                ¿Sin cuenta? <Text style={styles.linkT}>Regístrate gratis</Text>
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Stitch.colors.primaryContainer },
  scroll: { flex: 1 },
  wrap: { flexGrow: 1 },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Stitch.colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoL: { color: Stitch.colors.primaryContainer, fontSize: 44, fontWeight: '900' },
  brand: { fontSize: 22, fontWeight: '600', color: '#FFE9C2' },
  tagline: {
    fontSize: 14,
    color: Stitch.colors.secondaryContainer,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 8,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Stitch.colors.surfaceLow,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: Stitch.colors.primaryContainer },
  tabText: { fontSize: 13, color: Stitch.colors.onSurfaceVariant },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  h2: { fontSize: 20, fontWeight: '800', color: Stitch.colors.onSurface },
  cardSub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, marginBottom: 4 },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Stitch.colors.surfaceLow,
    borderRadius: 14,
    padding: 4,
  },
  roleTab: { flex: 1, borderRadius: 10, padding: 11, alignItems: 'center' },
  roleTabOn: { backgroundColor: Stitch.colors.primaryContainer },
  roleT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  roleTOn: { color: '#fff' },
  adminHint: {
    fontSize: 12,
    color: Stitch.colors.onSurfaceVariant,
    backgroundColor: Stitch.colors.surfaceLow,
    borderRadius: 10,
    padding: 10,
    lineHeight: 17,
  },
  label: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, marginTop: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Stitch.colors.surfaceLow,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  fieldError: { borderColor: Stitch.colors.error },
  fieldIcon: { fontSize: 16 },
  fieldInput: { flex: 1, fontSize: 15, color: Stitch.colors.onSurface },
  eye: { fontSize: 16, padding: 6 },
  inlineError: { fontSize: 12, color: Stitch.colors.error, marginTop: 2 },
  forgotWrap: { alignSelf: 'flex-end', marginBottom: 12, paddingVertical: 4 },
  forgot: { fontSize: 12, color: Stitch.colors.secondary, fontWeight: '600' },
  loginError: {
    fontSize: 13,
    color: Stitch.colors.error,
    textAlign: 'center',
    marginBottom: 12,
  },
  btn: {
    backgroundColor: Stitch.colors.primaryContainer,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { alignItems: 'center', padding: 10 },
  linkSub: { fontSize: 14, color: Stitch.colors.onSurfaceVariant },
  linkT: { color: Stitch.colors.secondary, fontWeight: '800', textDecorationLine: 'underline' },
});
