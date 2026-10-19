// Re-export para TypeScript. En runtime Metro elige:
// - LookifyMap.native.tsx en iOS/Android (Expo Go OK)
// - LookifyMap.web.tsx en web (iframe Google Maps Embed)
export { default } from './LookifyMap.native';
export type { ProPin, TrailPoint } from './LookifyMap.native';
