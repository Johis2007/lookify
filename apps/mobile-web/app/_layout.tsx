import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  router,
  useSegments,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ProLiveProvider } from '@/lib/proLiveState';
import { homeForRole } from '@/lib/roleGuard';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <ProLiveProvider>
        <RootLayoutNav />
      </ProLiveProvider>
    </AuthProvider>
  );
}

// Separación estricta por rol (tarea 3):
// - Sin sesión fuera de (auth) -> login.
// - Con sesión en (auth) -> home de su rol (cliente: tabs, pro: /pro, admin: /admin).
// - Profesional o admin dentro de (tabs) -> su dashboard (las vistas cliente
//   son exclusivas de cuentas cliente).
// - Cliente o admin dentro de /pro, cliente o pro dentro de /admin -> su home.
// - /booking y /rating son seguimiento compartido de la reserva (ambos roles).
function useAuthGuard() {
  const { user, isProfessional, isAdmin, loading } = useAuth();
  const segments = useSegments();
  useEffect(() => {
    if (loading) return;
    const root = segments[0];
    const inAuth = root === '(auth)';
    if (!user && !inAuth) {
      router.replace('/(auth)/login');
      return;
    }
    if (!user) return;
    const home = homeForRole(isProfessional, isAdmin);
    if (inAuth) {
      router.replace(home as any);
      return;
    }
    if (root === '(tabs)' && (isProfessional || isAdmin)) router.replace(home as any);
    else if (root === 'pro' && (!isProfessional || isAdmin)) router.replace(home as any);
    else if (root === 'admin' && !isAdmin) router.replace(home as any);
  }, [user, isProfessional, isAdmin, loading, segments]);
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  useAuthGuard();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="pro" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
