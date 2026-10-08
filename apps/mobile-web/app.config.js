// Fase 6: app.json no puede leer env vars (tenía el literal
// "process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY" como string). Este archivo lo
// envuelve e inyecta la key real desde EXPO_PUBLIC_GOOGLE_MAPS_KEY.
// Expo usa app.config.js con prioridad sobre app.json.
const base = require('./app.json');

module.exports = ({ config }) => {
  const expo = { ...(config?.expo || {}), ...base.expo };
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
  // Sin key el mapa NATIVO sale gris en el APK/IPA (la web usa OSM y no la
  // necesita). Aviso fuerte para no subir un preview sin mapa por olvido.
  if (!mapsKey) {
    console.warn(
      '\n⚠️  EXPO_PUBLIC_GOOGLE_MAPS_KEY vacía: el mapa nativo saldrá gris en el build.' +
        ' Consigue una key (Maps SDK for Android + iOS) y ponla en apps/mobile-web/.env' +
        ' y en las Environment variables del proyecto en expo.dev para EAS.\n'
    );
  }

  const plugins = (expo.plugins || []).map((p) => {
    if (Array.isArray(p) && p[0] === 'react-native-maps') {
      return [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: mapsKey,
          iosGoogleMapsApiKey: mapsKey,
        },
      ];
    }
    return p;
  });

  return { ...config, expo: { ...expo, plugins } };
};
