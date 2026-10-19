// Fase 6: app.json no puede leer env vars (tenía el literal
// "process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY" como string). Este archivo lo
// envuelve e inyecta la key real desde EXPO_PUBLIC_GOOGLE_MAPS_KEY.
// Expo usa app.config.js con prioridad sobre app.json.
const base = require('./app.json');

module.exports = ({ config }) => {
  const expo = { ...(config?.expo || {}), ...base.expo };
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
  // El mapa nativo usa tiles OSM (UrlTile) y funciona SIN key en Expo Go y
  // en build propio. La key solo hace falta para tiles base de Google o la
  // API Directions (ruta hacia destino). Sin key se avisa una vez.
  if (!mapsKey) {
    console.warn(
      '\nℹ️  EXPO_PUBLIC_GOOGLE_MAPS_KEY vacía: el mapa usa OpenStreetMap (sin key).' +
        ' Solo consigue una key (Maps SDK + Directions) si quieres ruta Google hacia destino.\n'
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
