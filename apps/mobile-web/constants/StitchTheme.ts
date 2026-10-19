// Design System Lookify PRO — extraído de Stitch (Google).
// Fuente: Plus Jakarta Sans (400/600/700) + Material Symbols Outlined.
// Vale para móvil (Expo Go) y web (expo start --web): mismo código RN.
import { Platform } from 'react-native';

export const Stitch = {
  colors: {
    // Base
    primary: '#000412',
    primaryContainer: '#0f1e36',
    onPrimary: '#ffffff',
    secondary: '#835500',
    secondaryContainer: '#feae2c',
    onSecondaryContainer: '#6b4500',
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
    error: '#ba1a1a',
    errorContainer: '#ffdad6',
    onErrorContainer: '#93000a',
    // Utilidades
    outline: '#75777e',
    outlineVariant: '#c5c6ce',
    gold: '#feae2c',
    navy: '#0f1e36',
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, full: 999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, margin: 20 },
  // La fuente personalizada solo existe en web (se carga por Google Fonts en
  // +html.tsx). En móvil (Expo Go) fontFamily debe ser undefined para usar la
  // fuente del sistema: un nombre no instalado hace que Android aplique un
  // fallback impredecible y todo se vea con tipografía manuscrita.
  font: Platform.select({ web: "'Plus Jakarta Sans', system-ui, sans-serif", default: undefined }),
} as const;

export type StitchColors = typeof Stitch.colors;
