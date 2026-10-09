// src/screens/LoginScreen.tsx
// Pantalla 1 del flujo: Login / Registro.
// El toggle superior alterna entre "Ingresar" y "Crear cuenta".
// Cuando el usuario presiona "Crear cuenta", navegamos a AccountTypeScreen
// (ahí se elige Cliente o Profesional) en vez de mostrar el form aquí mismo.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/colors';
import Button from '../components/Button';
import TextField from '../components/TextField';
import { findMockUser } from '../data/mockUsers';
import { loginValido, validarContrasenaLogin, validarCorreo } from '../utils/validators';

interface LoginScreenProps {
  navigation: {
    navigate: (screen: string) => void;
    reset: (state: { index: number; routes: { name: 'Home' }[] }) => void;
  };
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [loginError, setLoginError] = useState<string | null>(null);

  const emailError = touched.email ? validarCorreo(email) : null;
  const passwordError = touched.password ? validarContrasenaLogin(password) : null;
  const canSubmit = loginValido(email, password);

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setLoginError(null);
    try {
      const user = findMockUser(email, password);
      if (!user) {
        setLoginError('Correo o contraseña incorrectos');
        return;
      }
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error) {
      console.error('Error al iniciar sesión', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (newTab: 'login' | 'register') => {
    setTab(newTab);
    if (newTab === 'register') {
      navigation.navigate('AccountType');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Image source={require('../../assets/logo-lookify.png')} style={styles.logo} />
          <Text style={styles.brand}>Lookify</Text>
          <Text style={styles.tagline}>Belleza a un toque de distancia</Text>
        </View>

        <View style={styles.card}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === 'login' && styles.tabActive]}
                onPress={() => handleTabChange('login')}
              >
                <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>
                  Ingresar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'register' && styles.tabActive]}
                onPress={() => handleTabChange('register')}
              >
                <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>
                  Crear cuenta
                </Text>
              </TouchableOpacity>
            </View>

            <TextField
              label="Correo electrónico"
              placeholder="nombre@correo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setLoginError(null);
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              error={emailError ?? undefined}
            />
            <TextField
              label="Contraseña"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setLoginError(null);
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              error={passwordError ?? undefined}
            />

            <TouchableOpacity style={styles.forgotWrap}>
              <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            {loginError ? <Text style={styles.loginError}>{loginError}</Text> : null}

            <Button
              label="Ingresar"
              onPress={handleLogin}
              loading={loading}
              disabled={!canSubmit}
              style={styles.submitButton}
            />
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  screen: {
    flex: 1,
  },
  header: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: spacing.md,
    resizeMode: 'contain',
  },
  brand: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.honeyLight,
  },
  tagline: {
    fontSize: 14,
    color: colors.honey,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    flex: 3,
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  cardScroll: {
    flex: 1,
  },
  cardScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  submitButton: {
    marginBottom: 0,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.beige,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.navy,
  },
  tabText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginBottom: spacing.lg,
  },
  forgot: {
    fontSize: 12,
    color: colors.honey,
    fontWeight: '600',
  },
  loginError: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
