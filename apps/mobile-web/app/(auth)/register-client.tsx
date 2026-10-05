import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { TermsAccordion } from '@/components/TermsAccordion';

// FLUJO CLIENTE (3 pasos): 1 cuenta · 2 términos (acordeón, botón bloqueado
// hasta aceptar) · 3 confirmación → onboarding existente.
export default function RegisterClient() {
  const { registerClient } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validAccount =
    name.trim().length >= 2 && /.+@.+\..+/.test(email.trim()) && password.length >= 8;

  const submit = async () => {
    if (!terms) return;
    setError(null);
    setBusy(true);
    try {
      await registerClient(email.trim(), password, name.trim());
      setStep(3);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.wrap}>
      <Pressable onPress={() => (step === 1 ? router.back() : setStep(step - 1))} style={styles.backRow}>
        <Text style={styles.back}>← {step === 1 ? 'Elegir rol' : 'Atrás'}</Text>
        <Text style={styles.steps}>Paso {step} de 3</Text>
      </Pressable>
      <Text style={styles.h1}>Crear cuenta cliente</Text>
      <View style={styles.dots}>
        {[1, 2, 3].map((d) => (
          <View key={d} style={[styles.dot, d <= step && styles.dotOn]} />
        ))}
      </View>

      {step === 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💅 Tus datos</Text>
          <Text style={styles.label}>Nombre completo</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="Ej. Valeria Gómez" value={name} onChangeText={setName} placeholderTextColor="#75777e" />
          </View>
          <Text style={styles.label}>Correo electrónico</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="nombre@correo.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholderTextColor="#75777e" />
          </View>
          <Text style={styles.label}>Contraseña (mínimo 8 caracteres)</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="••••••••" secureTextEntry={!showPw} value={password} onChangeText={setPassword} placeholderTextColor="#75777e" />
            <Pressable onPress={() => setShowPw(!showPw)}>
              <Text style={styles.eye}>{showPw ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.btn, !validAccount && styles.btnOff]}
            onPress={() => validAccount && setStep(2)}
            disabled={!validAccount}
          >
            <Text style={styles.btnT}>Continuar →</Text>
          </Pressable>
        </View>
      )}

      {step === 2 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📜 Términos y condiciones</Text>
          <Text style={styles.sub}>Lee el texto completo aquí mismo antes de aceptar.</Text>
          <TermsAccordion />
          <Pressable style={styles.terms} onPress={() => setTerms(!terms)}>
            <View style={[styles.box, terms && styles.boxOn]}>
              {terms && <Text style={styles.boxT}>✓</Text>}
            </View>
            <Text style={styles.termsT}>Acepto los términos y condiciones</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.btn, (!terms || busy) && styles.btnOff]}
            onPress={submit}
            disabled={!terms || busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnT}>Crear cuenta →</Text>}
          </Pressable>
          {!terms && <Text style={styles.hint}>Marca la casilla para activar el botón.</Text>}
        </View>
      )}

      {step === 3 && (
        <View style={styles.card}>
          <Text style={styles.done}>🎉</Text>
          <Text style={styles.cardTitle}>¡Cuenta lista, {name.trim().split(' ')[0] || 'Lookify Lover'}!</Text>
          <Text style={styles.sub}>Tu cuenta de cliente quedó creada. Explora el mapa, el radar y reserva tu primer servicio.</Text>
          <Pressable style={styles.btn} onPress={() => router.replace('/(auth)/onboarding')}>
            <Text style={styles.btnT}>Explorar Lookify →</Text>
          </Pressable>
        </View>
      )}

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
  backRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  steps: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  h1: { fontSize: 24, fontWeight: '800', color: Stitch.colors.onSurface },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 28, height: 6, borderRadius: 3, backgroundColor: Stitch.colors.surfaceHigh },
  dotOn: { backgroundColor: Stitch.colors.secondaryContainer },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Stitch.colors.onSurface },
  sub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, marginTop: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, paddingHorizontal: 12, height: 50 },
  input: { flex: 1, fontSize: 15, color: Stitch.colors.onSurface },
  eye: { fontSize: 16, padding: 6 },
  btn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10 },
  btnOff: { opacity: 0.45 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  terms: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Stitch.colors.outline, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Stitch.colors.secondaryContainer, borderColor: Stitch.colors.secondaryContainer },
  boxT: { fontSize: 14, fontWeight: '900', color: Stitch.colors.primaryContainer },
  termsT: { fontSize: 13, fontWeight: '700', color: Stitch.colors.onSurface, flex: 1 },
  hint: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, textAlign: 'center' },
  error: { color: Stitch.colors.error, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  done: { fontSize: 52, textAlign: 'center' },
  link: { alignItems: 'center', padding: 10 },
  linkSub: { fontSize: 14, color: Stitch.colors.onSurfaceVariant },
  linkT: { color: Stitch.colors.secondary, fontWeight: '800', textDecorationLine: 'underline' },
});
