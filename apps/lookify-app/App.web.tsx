// App.web.tsx — entrada de Expo web. Solo panel administrador (ver
// AppNavigator.web.tsx). La app móvil sigue usando App.tsx sin cambios.

import React from 'react';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return <AppNavigator />;
}
