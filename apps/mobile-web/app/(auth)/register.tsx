import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';

// Lookify Cliente - Registro y Onboarding (diseño Stitch HTML, móvil + web).
export default function RegisterScreen() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<'client' | 'professional'>('client');
  const [terms, setTerms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await register(email.trim(), password, name.trim() || 'Lookify Lover', role);
      router.replace(role === 'client' ? '/(auth)/onboarding' : '/(tabs)');
    } catch (e: any) {
      setError(e.message ?? 'Error al registrarse');
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
        <Text style={styles.brandSub}>Belleza y bienestar profesional en tu puerta</Text>
      </View>

      <Text style={styles.sectionLabel}>¿Cómo deseas unirte hoy?</Text>
      <Pressable
        style={[styles.roleCard, role === 'client' && styles.roleActive]}
        onPress={() => setRole('client')}
      >
        <Text style={styles.roleIcon}>👤</Text>
        <View style={{ flex: 1 }}>
          <View style={styles.roleTop}>
            <Text style={styles.roleTitle}>Soy cliente</Text>
            <View style={[styles.check, role === 'client' && styles.checkOn]}>
              <Text style={styles.checkT}>✓</Text>
            </View>
          </View>
          <Text style={styles.roleSub}>Quiero agendar servicios certificados en casa</Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.roleCard, role === 'professional' && styles.roleActive, role !== 'professional' && { opacity: 0.85 }]}
        onPress={() => setRole('professional')}
      >
        <Text style={styles.roleIcon}>✂️</Text>
        <View style={{ flex: 1 }}>
          <View style={styles.roleTop}>
            <Text style={styles.roleTitle}>Soy profesional</Text>
            <View style={[styles.check, role === 'professional' && styles.checkOn]}>
              <Text style={styles.checkT}>✓</Text>
            </View>
          </View>
          <Text style={styles.roleSub}>Quiero prestar servicios y generar ingresos</Text>
        </View>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre completo</Text>
        <View style={styles.field}>
          <Text style={styles.fieldIcon}>🪪</Text>
          <TextInput style={styles.fieldInput} placeholder="Ej. Valeria Gómez" value={name} onChangeText={setName} placeholderTextColor="#75777e" />
        </View>
        <Text style={styles.label}>Cédula o documento</Text>
        <View style={styles.field}>
          <Text style={styles.fieldIcon}>💳</Text>
          <TextInput style={styles.fieldInput} placeholder="1.020.304.506" value={doc} onChangeText={setDoc} keyboardType="numeric" placeholderTextColor="#75777e" />
        </View>
        <Text style={styles.label}>Correo electrónico</Text>
        <View style={styles.field}>
          <Text style={styles.fieldIcon}>✉️</Text>
          <TextInput style={styles.fieldInput} placeholder="nombre@correo.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholderTextColor="#75777e" />
        </View>
        <Text style={styles.label}>Teléfono móvil</Text>
        <View style={styles.field}>
          <Text style={styles.prefix}>🇨🇴 +57</Text>
          <TextInput style={styles.fieldInput} placeholder="300 123 4567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#75777e" />
        </View>
        <Text style={styles.label}>Contraseña</Text>
        <View style={styles.field}>
          <Text style={styles.fieldIcon}>🔒</Text>
          <TextInput style={styles.fieldInput} placeholder="Mínimo 8 caracteres" secureTextEntry={!showPw} value={password} onChangeText={setPassword} placeholderTextColor="#75777e" />
          <Pressable onPress={() => setShowPw(!showPw)}>
            <Text style={styles.eye}>{showPw ? '🙈' : '👁️'}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.terms} onPress={() => setTerms(!terms)}>
          <View style={[styles.box, terms && styles.boxOn]}>
            {terms && <Text style={styles.boxT}>✓</Text>}
          </View>
          <Text style={styles.termsT}>
            Acepto los <Text style={styles.termsLink}>Términos</Text> y Habeas Data
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.btn, (busy || !email || !password) && { opacity: 0.6 }]}
          onPress={submit}
          disabled={busy || !email || !password}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnT}>{role === 'client' ? 'Crear cuenta de cliente →' : 'Crear cuenta profesional →'}</Text>}
        </Pressable>
      </View>

      <Link href="/(auth)/login" asChild>
        <Pressable style={styles.link}>
          <Text style={styles.linkSub}>
            ¿Ya tienes cuenta? <Text style={styles.linkT}>Iniciar sesión</Text>
          </Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  wrap: { padding: 20, paddingBottom: 40, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  logoL: { color: Stitch.colors.secondaryContainer, fontSize: 30, fontWeight: '900' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.surfaceHigh, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Stitch.colors.secondaryContainer },
  pillT: { fontSize: 10, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, letterSpacing: 1 },
  brandName: { fontSize: 28, fontWeight: '800', color: Stitch.colors.onSurface },
  brandSub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, textAlign: 'center', maxWidth: 280 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, marginTop: 4 },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  roleActive: { borderWidth: 2, borderColor: Stitch.colors.primaryContainer },
  roleIcon: { fontSize: 24 },
  roleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roleTitle: { fontSize: 14, fontWeight: '800', color: Stitch.colors.onSurface },
  roleSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Stitch.colors.secondaryContainer },
  checkT: { fontSize: 12, fontWeight: '900', color: Stitch.colors.primaryContainer },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, marginTop: 6 },
  label: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, marginTop: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, paddingHorizontal: 12, height: 50 },
  fieldIcon: { fontSize: 16 },
  prefix: { fontSize: 13, fontWeight: '700', color: Stitch.colors.onSurface },
  fieldInput: { flex: 1, fontSize: 15, color: Stitch.colors.onSurface },
  eye: { fontSize: 16, padding: 6 },
  terms: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: Stitch.colors.outline, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Stitch.colors.secondaryContainer, borderColor: Stitch.colors.secondaryContainer },
  boxT: { fontSize: 12, fontWeight: '900', color: Stitch.colors.primaryContainer },
  termsT: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, flex: 1 },
  termsLink: { color: Stitch.colors.secondary, fontWeight: '700', textDecorationLine: 'underline' },
  error: { color: Stitch.colors.error, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  btn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { alignItems: 'center', padding: 10 },
  linkSub: { fontSize: 14, color: Stitch.colors.onSurfaceVariant },
  linkT: { color: Stitch.colors.secondary, fontWeight: '800', textDecorationLine: 'underline' },
});
