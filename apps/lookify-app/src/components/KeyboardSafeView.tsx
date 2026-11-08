// src/components/KeyboardSafeView.tsx
// Envuelve pantallas con formulario para que el teclado no tape los campos:
// - iOS: behavior="padding" empuja el contenido hacia arriba al abrir el
//   teclado (en iOS la ventana NO se redimensiona sola).
// - Android: sin behavior; la ventana ya se redimensiona con
//   android:windowSoftInputMode=adjustResize (default de Expo), y aplicar un
//   segundo ajuste produciría un doble salto.
// - Web: sin behavior (el teclado es del sistema operativo, no de la app).
// Uso: <KeyboardSafeView><SafeAreaView …>…</SafeAreaView></KeyboardSafeView>
import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

type Props = {
  children: React.ReactNode;
};

export default function KeyboardSafeView({ children }: Props) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
