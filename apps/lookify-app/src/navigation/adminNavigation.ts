// src/navigation/adminNavigation.ts
// Helpers de navegación del panel admin. Vive en módulo aparte (no en
// AdminStackNavigator) para evitar require cycles: el navigator importa las
// pantallas y las pantallas importan esto.

import { CommonActions } from '@react-navigation/native';

// En web no hay ruta "Login" dentro del stack admin: registramos un handler
// que cierra la sesión y devuelve a la pantalla de acceso.
let logoutHandler: (() => void) | null = null;

export function setAdminLogoutHandler(handler: (() => void) | null): void {
  logoutHandler = handler;
}

/** Sin sesión admin se vuelve al login único (raíz). */
export function resetAdminToLogin(navigation: { getParent: (...args: never[]) => unknown }): void {
  if (logoutHandler) {
    logoutHandler();
    return;
  }
  const parent = navigation.getParent() as { dispatch: (action: object) => void } | undefined;
  parent?.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
}
