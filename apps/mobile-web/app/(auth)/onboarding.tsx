import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { ensureLocationPermission } from '@/lib/permissions';

const SLIDES = [
  { emoji: '📍', title: 'Encuentra belleza cerca', sub: 'Profesionales online a menos de 10 km en el mapa de Chapinero.' },
  { emoji: '📡', title: 'Radar Lookify', sub: 'Elige radio 3 / 5 / 10 km y recibe match instantáneo.' },
  { emoji: '✨', title: 'Reserva y sigue en vivo', sub: 'Confirma en 1 toque, sigue la llegada y califica al finalizar.' },
];

export default function Onboarding() {
  const { user } = useAuth();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  return (
    <View style={styles.wrap}>
      <View style={styles.brand}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoL}>{(user?.first_name?.[0] || 'L').toUpperCase()}</Text>
        </View>
        <Text style={styles.hi}>Hola, {user?.first_name || 'Lookify Lover'} 👋</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.emoji}>{SLIDES[i].emoji}</Text>
        <Text style={styles.title}>{SLIDES[i].title}</Text>
        <Text style={styles.sub}>{SLIDES[i].sub}</Text>
        <View style={styles.dots}>
          {SLIDES.map((_, d) => (
            <View key={d} style={[styles.dot, d === i && styles.dotActive]} />
          ))}
        </View>
        <Pressable
          style={styles.btn}
          onPress={async () => {
            if (last) {
              // Pide ubicación al terminar (no bloquea si la niega: el radar la pedirá de nuevo).
              await ensureLocationPermission(false);
              router.replace('/(tabs)');
            } else {
              setI(i + 1);
            }
          }}
        >
          <Text style={styles.btnT}>{last ? 'Explorar Lookify →' : 'Siguiente →'}</Text>
        </Pressable>
        {!last && (
          <Pressable onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.skip}>Omitir</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Stitch.colors.surface, padding: 20, justifyContent: 'center', gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 8 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  logoL: { color: Stitch.colors.secondaryContainer, fontSize: 30, fontWeight: '900' },
  hi: { fontSize: 18, fontWeight: '800', color: Stitch.colors.onSurface },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  emoji: { fontSize: 44 },
  title: { fontSize: 21, fontWeight: '800', color: Stitch.colors.onSurface, textAlign: 'center' },
  sub: { textAlign: 'center', color: Stitch.colors.onSurfaceVariant, lineHeight: 20 },
  dots: { flexDirection: 'row', gap: 6, marginVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Stitch.colors.surfaceHighest },
  dotActive: { backgroundColor: Stitch.colors.primaryContainer, width: 22 },
  btn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', alignSelf: 'stretch', marginTop: 6 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  skip: { textAlign: 'center', color: Stitch.colors.onSurfaceVariant, fontWeight: '700', padding: 8 },
});
