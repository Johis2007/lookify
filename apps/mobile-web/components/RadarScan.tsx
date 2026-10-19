import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';

const SIZE = 200;

/**
 * Radar animado: ondas expansivas en cascada + barrido giratorio + núcleo
 * pulsante. En reposo late suavemente; al escanear acelera y emite 3 ondas.
 */
export function RadarScan({ scanning, statusText }: { scanning: boolean; statusText?: string }) {
  // Animated.Value estables en estado (no refs: se leen durante el render).
  const [waves] = useState(() => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]);
  const [sweep] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  // Ondas expansivas en cascada (stagger 600ms, loop).
  useEffect(() => {
    const loops = waves.map((w, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 600),
          Animated.timing(w, {
            toValue: 1,
            duration: scanning ? 1800 : 2600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 600 * (2 - i))),
        ])
      )
    );
    // Reinicia fases al cambiar de modo.
    waves.forEach((w) => w.setValue(0));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  // Barrido giratorio continuo (más rápido al escanear).
  useEffect(() => {
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: scanning ? 1600 : 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  // Núcleo pulsante.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spin = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const coreScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <View style={styles.wrap}>
      <View style={[styles.stage, { width: SIZE, height: SIZE }]}>
        {waves.map((w, i) => {
          const scale = w.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.35] });
          const opacity = w.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, scanning ? 0.75 : 0.45, 0] });
          return (
            <Animated.View
              key={i}
              style={[
                styles.wave,
                {
                  width: SIZE,
                  height: SIZE,
                  borderRadius: SIZE / 2,
                  transform: [{ scale }],
                  opacity,
                  borderColor: scanning ? Stitch.colors.secondaryContainer : 'rgba(254,174,44,0.4)',
                  backgroundColor: scanning ? 'rgba(254,174,44,0.10)' : 'rgba(254,174,44,0.05)',
                },
              ]}
            />
          );
        })}
        {/* Barrido giratorio */}
        <Animated.View style={[styles.sweep, { transform: [{ rotate: spin }] }]}>
          <View style={styles.sweepBeam} />
        </Animated.View>
        {/* Anillos fijos de referencia */}
        <View style={[styles.fixedRing, { width: SIZE * 0.72, height: SIZE * 0.72, borderRadius: SIZE * 0.36 }]} />
        <View style={[styles.fixedRing, { width: SIZE * 0.44, height: SIZE * 0.44, borderRadius: SIZE * 0.22 }]} />
        {/* Núcleo */}
        <Animated.View style={[styles.core, { transform: [{ scale: coreScale }] }]}>
          <Text style={{ fontSize: 26 }}>{scanning ? '📡' : '✂️'}</Text>
        </Animated.View>
      </View>
      <SearchingLabel active={scanning} text={statusText} />
    </View>
  );
}

/** "Buscando profesionales cercanos" con puntos suspensivos animados. */
export function SearchingLabel({ active, text }: { active: boolean; text?: string }) {
  const [dots] = useState(() => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]);
  const [d1, d2, d3] = dots;

  useEffect(() => {
    if (!active) return;
    const mk = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.delay(900 - delay),
        ])
      );
    const loops = [mk(d1, 0), mk(d2, 300), mk(d3, 600)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) {
    return <Text style={styles.idle}>{text ?? 'Radar en reposo · pulsa buscar'}</Text>;
  }
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchDotLive} />
      <Text style={styles.searchT}>{text ?? 'Buscando profesionales cercanos'}</Text>
      {[d1, d2, d3].map((d, i) => (
        <Animated.Text key={i} style={[styles.searchDots, { opacity: d }]}>
          .
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  stage: { alignItems: 'center', justifyContent: 'center' },
  wave: { position: 'absolute', borderWidth: 1.5 },
  fixedRing: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(254,174,44,0.25)' },
  sweep: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  sweepBeam: {
    position: 'absolute',
    top: 0,
    width: 3,
    height: SIZE / 2,
    backgroundColor: 'rgba(254,174,44,0.65)',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  core: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Stitch.colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  searchDotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4edea3', marginRight: 6 },
  searchT: { color: Stitch.colors.secondaryContainer, fontSize: 13, fontWeight: '800' },
  searchDots: { color: Stitch.colors.secondaryContainer, fontSize: 16, fontWeight: '900', marginLeft: 1 },
  idle: { color: '#b8c7e6', fontSize: 12 },
});
