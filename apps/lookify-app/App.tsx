// App.tsx — punto de entrada de la aplicación Expo.
// Reemplaza el App.tsx que genera "npx create-expo-app" por este.

import React, { useEffect } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { ensureWebFont } from './src/theme/fonts';

export default function App() {
  // En web inyecta Plus Jakarta Sans (sistema Stitch); en nativo es noop.
  useEffect(() => {
    ensureWebFont();
  }, []);
  return <AppNavigator />;
}
