// src/navigation/AppNavigator.web.tsx
// Entrada web EXCLUSIVA para administradores. No hay registro, elección de
// tipo de cuenta ni flujos de cliente/profesional. La sesión admin vive en
// memoria + sessionStorage (sin refresh token) y se cierra por inactividad.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AdminStackNavigator from './AdminStackNavigator';
import AdminLoginScreen from '../screens/admin/AdminLoginScreen';
import { setAdminLogoutHandler } from './adminNavigation';
import { BACKEND } from '../lib/backend/config';
import {
  loadAdminSession,
  logoutAdmin,
  type AdminSession,
} from '../lib/backend/adminAuth';
import { initBackend } from '../services/backend/initBackend';
import { colors, radius, spacing } from '../theme/colors';

const IDLE_MS = 15 * 60 * 1000;

type WebRootStackParamList = {
  Login: undefined;
  Admin: undefined;
};

const Stack = createNativeStackNavigator<WebRootStackParamList>();

function BackendDisabledScreen() {
  return (
    <SafeAreaProvider>
      <View style={styles.noticeWrap}>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Panel administrador</Text>
          <Text style={styles.noticeText}>
            La versión web necesita el backend activo. Arranca Expo con
            {' '}
            <Text style={styles.code}>EXPO_PUBLIC_USE_BACKEND=true</Text>
            {' '}
            y asegúrate de que Directus (8055) y el BFF (4001) estén en marcha.
          </Text>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

export default function AppNavigator() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    initBackend();
    let alive = true;
    loadAdminSession()
      .then((s) => {
        if (alive) setSession(s);
      })
      .catch(() => {
        if (alive) setSession(null);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const doLogout = useCallback(async () => {
    await logoutAdmin().catch(() => undefined);
    setSession(null);
  }, []);

  useEffect(() => {
    setAdminLogoutHandler(() => {
      void doLogout();
    });
    return () => setAdminLogoutHandler(null);
  }, [doLogout]);

  // Auto-logout tras 15 minutos sin actividad en la pestaña.
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void doLogout();
      }, IDLE_MS);
    };
    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'touchstart', 'mousemove'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [session, doLogout]);

  if (!BACKEND.enabled) return <BackendDisabledScreen />;

  if (checking) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.navy} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!session) {
    return (
      <SafeAreaProvider>
        <AdminLoginScreen onLoggedIn={setSession} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Admin" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login">
            {() => <AdminLoginScreen onLoggedIn={setSession} />}
          </Stack.Screen>
          <Stack.Screen name="Admin" component={AdminStackNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  noticeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    padding: spacing.lg,
  },
  noticeCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.navy,
    marginBottom: spacing.sm,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  code: {
    fontFamily: 'monospace',
    color: colors.navy,
    fontWeight: '700',
  },
});
