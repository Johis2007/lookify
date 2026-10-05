import { Link, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';

// Lookify - PANTALLA 0: Selección de cuenta (punto de entrada único).
// Dos caminos independientes y excluyentes. La cuenta queda fijada al rol.
export default function RegisterSelect() {
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
        <Text style={styles.brandName}>Crear cuenta</Text>
        <Text style={styles.brandSub}>Elige cómo quieres usar Lookify. Tu cuenta quedará fijada a este rol.</Text>
      </View>

      <Pressable style={styles.bigCard} onPress={() => router.push('/(auth)/register-client')}>
        <Text style={styles.bigIcon}>💅</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.bigTitle}>Quiero reservar</Text>
          <Text style={styles.bigSub}>Agenda belleza certificada a domicilio · 3 pasos</Text>
        </View>
        <Text style={styles.go}>→</Text>
      </Pressable>

      <Pressable style={styles.bigCard} onPress={() => router.push('/(auth)/register-pro')}>
        <Text style={styles.bigIcon}>✂️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.bigTitle}>Soy profesional</Text>
          <Text style={styles.bigSub}>Ofrece servicios y genera ingresos · 4 pasos + verificación</Text>
        </View>
        <Text style={styles.go}>→</Text>
      </Pressable>

      <Text style={styles.note}>
        Cada rol necesita una cuenta distinta: si luego quieres el otro rol, crea una cuenta nueva con otro correo.
      </Text>

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
  wrap: { padding: 20, paddingBottom: 40, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  logoL: { color: Stitch.colors.secondaryContainer, fontSize: 30, fontWeight: '900' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Stitch.colors.surfaceHigh, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Stitch.colors.secondaryContainer },
  pillT: { fontSize: 10, fontWeight: '800', color: Stitch.colors.onSurfaceVariant, letterSpacing: 1 },
  brandName: { fontSize: 26, fontWeight: '800', color: Stitch.colors.onSurface },
  brandSub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, textAlign: 'center', maxWidth: 300 },
  bigCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, marginTop: 4 },
  bigIcon: { fontSize: 40 },
  bigTitle: { fontSize: 18, fontWeight: '800', color: Stitch.colors.onSurface },
  bigSub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, marginTop: 3 },
  go: { fontSize: 22, fontWeight: '900', color: Stitch.colors.secondary },
  note: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, textAlign: 'center', lineHeight: 17, marginTop: 4 },
  link: { alignItems: 'center', padding: 10 },
  linkSub: { fontSize: 14, color: Stitch.colors.onSurfaceVariant },
  linkT: { color: Stitch.colors.secondary, fontWeight: '800', textDecorationLine: 'underline' },
});
