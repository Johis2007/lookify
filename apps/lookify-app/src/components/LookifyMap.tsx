// src/components/LookifyMap.tsx
// Re-export para TypeScript. En runtime Metro elige:
// - LookifyMap.native.tsx en iOS/Android (react-native-maps)
// - LookifyMap.web.tsx en web (Leaflet por CDN, sin API key)
// Importar siempre sin extensión:
//   import LookifyMap from '../components/LookifyMap';
export { default } from './LookifyMap.native';
export type { ProPin, TrailPoint } from './LookifyMap.native';
