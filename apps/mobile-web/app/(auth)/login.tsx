import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';

// Lookify Cliente - Login (diseño Stitch: navy + ámbar, móvil + web).
export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.wrap}>
      <View style={styles.brand}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoL}>L</Text>
        </View>
        <View style={styles.pill}>
          <View style={styles.pillDot} />
          <Text style={styles.pillT}>SERVICIO A DOMICILIO</Text>
        </View>
        <Text style={styles.brandName}>Lookify</Text>
        <Text style={styles.brandSub}>Belleza profesional en tu puerta</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Bienvenido de nuevo</Text>
        <Text style={styles.cardSub}>Entra para reservar o recibir solicitudes</Text>

        <Text style={styles.label}>Correo electrónico</Text>
        <View style={styles.field}>
          <Text style={styles.fieldIcon}>✉️</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="nombre@correo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholderTextColor="#75777e"
          />
        </View>

        <Text style={styles.label}>Contraseña</Text>
        <View style={styles.field}>
          <Text style={styles.fieldIcon}>🔒</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Tu contraseña"
            secureTextEntry={!showPw}
            value={password}
            onChangeText={setPassword}
            placeholderTextColor="#75777e"
          />
          <Pressable onPress={() => setShowPw(!showPw)}>
            <Text style={styles.eye}>{showPw ? '🙈' : '👁️'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.btn, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy || !email || !password}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnT}>Entrar →</Text>}
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  wrap: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 6, marginTop: 12 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  logoL: { color: Stitch.colors.secondaryContainer, fontSize: 30, fontWeight: '900' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.surfaceHigh, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Stitch.colors.secondaryContainer },
  pillT: { fontSize: 10, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, letterSpacing: 1 },
  brandName: { fontSize: 28, fontWeight: '800', color: Stitch.colors.onSurface },
  brandSub: { fontSize: 14, color: Stitch.colors.onSurfaceVariant, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  h2: { fontSize: 20, fontWeight: '800', color: Stitch.colors.onSurface },
  cardSub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, marginTop: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, paddingHorizontal: 12, height: 50 },
  fieldIcon: { fontSize: 16 },
  fieldInput: { flex: 1, fontSize: 15, color: Stitch.colors.onSurface },
  eye: { fontSize: 16, padding: 6 },
  error: { color: Stitch.colors.error, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  btn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { alignItems: 'center', padding: 10 },
  linkSub: { fontSize: 14, color: Stitch.colors.onSurfaceVariant },
  linkT: { color: Stitch.colors.secondary, fontWeight: '800', textDecorationLine: 'underline' },
});
