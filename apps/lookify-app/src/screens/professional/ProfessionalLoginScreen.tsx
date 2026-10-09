// App Profesional — pantalla 1: Login (Lookify PRO).

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '../../theme/colors';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import BackHeader from '../../components/BackHeader';
import { loginValido, validarContrasenaLogin, validarCorreo } from '../../utils/validators';
import { getProfessionalAuthService } from '../../services/professionalAuthService';
import { ServiceError } from '../../services/errors';
import { resolvePostLoginRoute } from '../../navigation/professionalRoutes';
import { RootStackParamList } from '../../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfessionalLogin'>;

type Tab = 'login' | 'register';

export default function ProfessionalLoginScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [loginError, setLoginError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setTab('login');
    }, [])
  );

  const emailError = touched.email ? validarCorreo(email) : null;
  const passwordError = touched.password ? validarContrasenaLogin(password) : null;
  const canSubmit = loginValido(email, password);

  const handleLogin = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setLoginError(null);
    try {
      const session = await getProfessionalAuthService().iniciarSesion(email, password);
      const route = resolvePostLoginRoute(session);
      navigation.reset({
        index: 0,
        routes: [{ name: route.name, params: route.params }],
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.code === 'INVALID_CREDENTIALS') {
          setLoginError('Correo o contraseña incorrectos');
        } else if (error.code === 'NETWORK') {
          setLoginError('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.');
        } else {
          setLoginError('Ocurrió un error. Inténtalo de nuevo.');
        }
      } else {
        setLoginError('Ocurrió un error. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (newTab === 'register') {
      navigation.navigate('RegisterProfessional');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.backWrap}>
            <BackHeader variant="dark" />
          </View>
          <Image source={require('../../../assets/logo-lookify.png')} style={styles.logo} />
          <Text style={styles.brand}>Lookify PRO</Text>
          <Text style={styles.tagline}>Convierte tu talento en ingresos</Text>
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
                  Registrarme
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

            {loginError ? <Text style={styles.loginError}>{loginError}</Text> : null}

            <Button
              label="Ingresar"
              onPress={handleLogin}
              loading={loading}
              disabled={!canSubmit}
              style={styles.submitButton}
            />

            {__DEV__ ? (
              <Text style={styles.devHint}>
                Demo: pro.aprobado@lookify.test, pro.revision@lookify.test,
                pro.rechazado@lookify.test, pro.docs-servicios@lookify.test,
                pro.docs-certificados@lookify.test — contraseña Lookify123
              </Text>
            ) : null}
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  backWrap: {
    alignSelf: 'stretch',
    marginBottom: spacing.sm,
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
  loginError: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  devHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.lg,
    lineHeight: 16,
  },
});
