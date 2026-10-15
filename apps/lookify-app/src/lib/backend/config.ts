// src/lib/backend/config.ts
// Config del adaptador al backend Lookify (Directus + realtime-server).
// Activar con EXPO_PUBLIC_USE_BACKEND=true (ver .env.example). Por defecto
// la app usa los mocks (sin cambios de comportamiento).

export const BACKEND = {
  enabled: process.env.EXPO_PUBLIC_USE_BACKEND === 'true',
  directusUrl: process.env.EXPO_PUBLIC_DIRECTUS_URL || 'http://localhost:8055',
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:4001',
  // UUID del rol "App User" (cambia por instancia; ver salida de db:setup).
  // Se envía en el registro público porque el flow de asignación no se
  // ejecuta en esta instancia (ver docs/adaptacion-backend.md).
  appRoleId: process.env.EXPO_PUBLIC_APP_ROLE_ID || '68183af2-187c-4235-973f-099d277caa46',
} as const;
