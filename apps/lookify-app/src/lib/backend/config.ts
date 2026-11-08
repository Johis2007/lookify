// src/lib/backend/config.ts
// Config del adaptador al backend Lookify (Directus + realtime-server).
// Activar con EXPO_PUBLIC_USE_BACKEND=true (ver .env.example). Por defecto
// la app usa los mocks (sin cambios de comportamiento).

export const BACKEND = {
  enabled: process.env.EXPO_PUBLIC_USE_BACKEND === 'true',
  directusUrl: process.env.EXPO_PUBLIC_DIRECTUS_URL || 'http://192.168.1.90:8055',
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://192.168.1.90:4001',
  // BFF (proxy de reservas/perfil). Vive en el mismo host que el socket.
  bffUrl: process.env.EXPO_PUBLIC_BFF_URL || process.env.EXPO_PUBLIC_SOCKET_URL || 'http://192.168.1.90:4001',
} as const;
