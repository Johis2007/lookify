// src/theme/colors.ts
// Paleta Lookify — Opción C (verde petróleo + arena).
// Usa siempre estos tokens; no escribas hex/rgba sueltos en pantallas.

export const colors = {
  // Principal — cabeceras, fondos oscuros, botones primary, mapa (cliente)
  navy: '#1F4E5A',
  navyLight: '#2E6A77',

  // Calificación — estrellas y reseñas únicamente (no usar para botones ni badges)
  honey: '#D9A441',
  honeyLight: '#F5C349',

  // Acento arena — botones accent, badges, chips, barras de progreso, enlaces destacados
  sand: '#E2BE99',
  sandLight: '#EBD2B4',

  // Fondos y neutros
  white: '#FFFFFF',
  beige: '#FBF6EE',
  border: '#E8DCCB',

  // Texto
  textPrimary: '#1E1E1E',
  textSecondary: '#6B6A66',
  textMuted: '#B9B7AE',
  textOnNavy: '#FFFFFF',
  textOnNavyMuted: '#BFD6DA',

  // Overlays (modales, avatar, video)
  overlayPrimary: 'rgba(31, 78, 90, 0.45)',
  overlayDark: 'rgba(0, 0, 0, 0.92)',
  overlayAvatar: 'rgba(0, 0, 0, 0.35)',

  // Estados (feedback; independientes de la paleta de marca)
  success: '#2E7D32',
  error: '#C62828',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const typography = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.navy },
  subtitle: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
  heading: { fontSize: 16, fontWeight: '600' as const, color: colors.navy },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.textPrimary },
  caption: { fontSize: 12, fontWeight: '400' as const, color: colors.textSecondary },
  button: { fontSize: 15, fontWeight: '600' as const },
};
