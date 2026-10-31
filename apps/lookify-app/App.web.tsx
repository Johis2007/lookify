// App.web.tsx — entrada de Expo web. Solo panel administrador (ver
// AppNavigator.web.tsx). La app móvil sigue usando App.tsx sin cambios.

import React, { useEffect } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { initBackend } from './src/services/backend/initBackend';

export default function App() {
  // En web resuelve initBackend.web.ts (solo admin); se llama igual que en
  // nativo para que el arranque sea el mismo en ambas plataformas.
  useEffect(() => {
    initBackend();
  }, []);
  return <AppNavigator />;
}
