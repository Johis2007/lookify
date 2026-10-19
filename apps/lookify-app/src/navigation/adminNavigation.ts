// src/navigation/adminNavigation.ts
// Helpers de navegación del panel admin. Vive en módulo aparte (no en
// AdminStackNavigator) para evitar require cycles: el navigator importa las
// pantallas y las pantallas importan esto.

import { CommonActions } from '@react-navigation/native';

/** Sin sesión admin se vuelve al login único (raíz). */
export function resetAdminToLogin(navigation: { getParent: (...args: never[]) => unknown }): void {
  const parent = navigation.getParent() as { dispatch: (action: object) => void } | undefined;
  parent?.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
}
