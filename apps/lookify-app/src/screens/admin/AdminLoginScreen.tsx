// src/screens/admin/AdminLoginScreen.tsx
// Login exclusivo de la web: solo administradores. No registra cuentas ni
// permite elegir tipo de cuenta. Se resuelve con loginAdmin (Directus).

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TextField from '../../components/TextField';
import Button from '../../components/Button';
import { ServiceError } from '../../services/errors';
import {
  adminErrorMessage,
  loginAdmin,
  type AdminSession,
  WEB_ADMIN_ONLY_MESSAGE,
} from '../../lib/backend/adminAuth';
import { colors, radius, spacing } from '../../theme/colors';

type Props = {
  onLoggedIn: (session: AdminSession) => void;
};

export default function AdminLoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    setError(null);
    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña.');
      return;
    }
    setLoading(true);
    try {
      const session = await loginAdmin(email, password);
      onLoggedIn(session);
    } catch (e) {
      if (e instanceof ServiceError && e.code === 'VALIDATION' && /administradora/i.test(e.message)) {
        setError(WEB_ADMIN_ONLY_MESSAGE);
      } else {
        setError(adminErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.brand}>Lookify</Text>
          <Text style={styles.title}>Panel administrador</Text>
          <Text style={styles.subtitle}>
            Acceso exclusivo para administradores. Las cuentas de cliente y profesional
            usan la app móvil.
          </Text>

          <View style={styles.form}>
            <TextField
              label="Correo"
              value={email}
              onChangeText={setEmail}
              placeholder="admin@lookify.app"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
            />
            <TextField
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="Tu contraseña"
              secureTextEntry
              textContentType="password"
              onSubmitEditing={() => {
                void submit();
              }}
            />
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button
              label="Entrar al panel"
              onPress={() => {
                void submit();
              }}
              loading={loading}
            />
          </View>

          <Text style={styles.footnote}>
            La sesión se cierra al cerrar la pestaña o tras 15 minutos sin actividad.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brand: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.honey,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.navy,
    marginTop: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  form: { marginTop: spacing.lg },
  error: {
    fontSize: 13,
    color: colors.error,
    marginBottom: spacing.md,
  },
  footnote: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
