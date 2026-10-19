// src/theme/colors.ts
// Paleta oficial de Lookify — tokens del sistema de diseño Stitch
// (fuente: lookify-github/apps/mobile-web/constants/StitchTheme.ts).
// Cualquier pantalla nueva debe usar estos colores, nunca valores sueltos.

import { Platform } from 'react-native';

// La fuente personalizada solo existe en web (se inyecta por Google Fonts en
// theme/fonts.web.ts). En móvil debe ser undefined para usar la fuente del
// sistema: un nombre no instalado hace que Android aplique un fallback
// impredecible.
export const fontFamily = Platform.select({
  web: "'Plus Jakarta Sans', system-ui, sans-serif",
  default: undefined,
});

export const colors = {
  // Primario — barras de navegación, botones principales, marca
  navy: '#0f1e36',
  navyLight: '#1B3A5C',

  // Acento — calificaciones, botones de acción destacada, badges
  honey: '#feae2c',
  honeyLight: '#F5C349',

  // Fondos y neutros
  white: '#FFFFFF',
  beige: '#FAF1E6',
  border: '#E4E1D8',

  // Texto
  textPrimary: '#1E1E1E',
  textSecondary: '#7A7A76',
  textMuted: '#B9B7AE',
  textOnNavy: '#FFFFFF',
  textOnNavyMuted: '#B9C6D6',

  // Estados
  success: '#2E7D32',
  error: '#ba1a1a',

  // ——— Tokens Stitch (mismo nombre que en el repo de referencia) ———
  // Base
  primary: '#000412',
  primaryContainer: '#0f1e36',
  onPrimary: '#ffffff',
  secondary: '#835500',
  secondaryContainer: '#feae2c',
  onSecondaryContainer: '#6b4500',
  gold: '#feae2c',
  // Surfaces
  surface: '#f9f9ff',
  surfaceLowest: '#ffffff',
  surfaceLow: '#f0f3ff',
  surfaceContainer: '#e7eeff',
  surfaceHigh: '#dee8ff',
  surfaceHighest: '#d8e3fb',
  onSurface: '#111c2d',
  onSurfaceVariant: '#44474d',
  // Success / Tertiary
  tertiaryContainer: '#002416',
  tertiaryFixedDim: '#4edea3',
  onTertiaryContainer: '#009969',
  // Danger
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  // Utilidades
  outline: '#75777e',
  outlineVariant: '#c5c6ce',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  margin: 20,
};

export const typography = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.navy, fontFamily },
  subtitle: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary, fontFamily },
  heading: { fontSize: 16, fontWeight: '600' as const, color: colors.navy, fontFamily },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.textPrimary, fontFamily },
  caption: { fontSize: 12, fontWeight: '400' as const, color: colors.textSecondary, fontFamily },
  button: { fontSize: 15, fontWeight: '600' as const, fontFamily },
};
