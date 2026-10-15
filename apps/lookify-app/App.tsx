// App.tsx — punto de entrada de la aplicación Expo.
// Reemplaza el App.tsx que genera "npx create-expo-app" por este.

import React, { useEffect } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { ensureWebFont } from './src/theme/fonts';
import { initBackend, isBackendEnabled } from './src/services/backend/initBackend';

export default function App() {
  // En web inyecta Plus Jakarta Sans (sistema Stitch); en nativo es noop.
  // Con EXPO_PUBLIC_USE_BACKEND=true los servicios usan Directus + socket.
  useEffect(() => {
    ensureWebFont();
    if (isBackendEnabled()) initBackend();
  }, []);
  return <AppNavigator />;
}
