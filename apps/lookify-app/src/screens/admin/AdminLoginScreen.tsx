// src/screens/admin/AdminLoginScreen.tsx
// Ingreso al panel administrador (rol admin de Directus). Se valida
// capacidad real (listar usuarios); cualquier otro rol es rechazado.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '../../theme/colors';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import BackHeader from '../../components/BackHeader';
import type { AdminStackParamList } from '../../navigation/AdminStackNavigator';
import { adminErrorMessage, loginAdmin } from '../../lib/backend/adminAuth';
import { validarContrasenaLogin, validarCorreo } from '../../utils/validators';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminLogin'>;

export default function AdminLoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const emailError = email ? validarCorreo(email) : null;
  const passwordError = password ? validarContrasenaLogin(password) : null;
  const canSubmit = !emailError && !passwordError && email.trim() !== '' && password !== '';

  const handleLogin = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setLoginError(null);
    try {
      await loginAdmin(email, password);
      navigation.replace('AdminDashboard');
    } catch (error) {
      setLoginError(adminErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader variant="dark" />
        <Image source={require('../../../assets/logo-lookify.png')} style={styles.logo} />
        <Text style={styles.title}>Panel administrador</Text>
        <Text style={styles.subtitle}>Solo cuentas con rol admin de Directus</Text>
      </View>
      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextField
            label="Correo electrónico"
            placeholder="admin@lookify.app"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setLoginError(null);
            }}
            error={emailError ?? undefined}
          />
          <TextField
            label="Contraseña"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setLoginError(null);
            }}
            error={passwordError ?? undefined}
          />
          {loginError ? <Text style={styles.loginError}>{loginError}</Text> : null}
          <Button
            label="Ingresar al panel"
            onPress={handleLogin}
            loading={loading}
            disabled={!canSubmit}
            style={styles.submitButton}
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy },
  header: { paddingTop: spacing.lg, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, alignItems: 'center' },
  logo: { width: 72, height: 72, resizeMode: 'contain', marginBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: '700', color: colors.white },
  subtitle: { fontSize: 13, color: colors.textOnNavyMuted, marginTop: spacing.xs, textAlign: 'center' },
  body: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  loginError: { fontSize: 13, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  submitButton: { marginBottom: 0 },
});
