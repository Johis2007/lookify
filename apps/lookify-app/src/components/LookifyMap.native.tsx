// src/components/LookifyMap.native.tsx
// Mapa en Expo Go vía WebView + Leaflet (SIN API key, SIN módulo nativo).
// react-native-maps salía negro: la key Google embebida en Expo Go está
// vencida y OSM directo bloquea a las apps (403). Leaflet dibuja los tiles
// Esri directo en la página y siempre se ve. Misma API que antes
// (initial/pins/trail/route/follow/onProPress): las pantallas no cambian.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type ProPin = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  /** Color del pin (ej. cliente navy, profesional honey). */
  color?: string;
};

export type TrailPoint = { latitude: number; longitude: number };

type Props = {
  initial: { latitude: number; longitude: number };
  pins?: ProPin[];
  /** Recorrido (línea azul). */
  trail?: TrailPoint[];
  /** Ruta hacia el destino (línea roja). */
  route?: TrailPoint[];
  /** Centro a seguir con cámara animada (tracking en vivo). */
  follow?: { latitude: number; longitude: number } | null;
  onProPress?: (id: string) => void;
};

const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

function buildHtml(initial: { latitude: number; longitude: number }): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#m{height:100%;margin:0;padding:0}body{background:#e8edf3}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('m', { zoomControl: true }).setView([${initial.latitude}, ${initial.longitude}], 14);
L.tileLayer('${ESRI_TILES}', { maxZoom: 19, attribution: 'Powered by Esri' }).addTo(map);
var markers = {}, trailLine = null, routeLine = null;
function upsertPin(p) {
  var cur = markers[p.id];
  var opts = { radius: 9, color: '#ffffff', weight: 2, fillColor: p.color || '#E53935', fillOpacity: 1 };
  if (cur) { cur.setLatLng([p.latitude, p.longitude]); cur.setStyle({ fillColor: opts.fillColor }); }
  else {
    cur = L.circleMarker([p.latitude, p.longitude], opts).addTo(map);
    if (p.title) cur.bindTooltip(p.title);
    (function (id) { cur.on('click', function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'press', id: id }));
    }); })(p.id);
    markers[p.id] = cur;
  }
}
window.__lookifyUpdate = function (d) {
  var seen = {};
  (d.pins || []).forEach(function (p) { seen[p.id] = 1; upsertPin(p); });
  Object.keys(markers).forEach(function (id) {
    if (!seen[id]) { try { map.removeLayer(markers[id]); } catch (e) {} delete markers[id]; }
  });
  var t = d.trail || [];
  if (t.length > 1) {
    var ll = t.map(function (p) { return [p.latitude, p.longitude]; });
    if (trailLine) trailLine.setLatLngs(ll);
    else trailLine = L.polyline(ll, { color: '#143ca0', weight: 4, opacity: 0.65 }).addTo(map);
  } else if (trailLine) { try { map.removeLayer(trailLine); } catch (e) {} trailLine = null; }
  var r = d.route || [];
  if (r.length > 1) {
    var rl = r.map(function (p) { return [p.latitude, p.longitude]; });
    if (routeLine) routeLine.setLatLngs(rl);
    else routeLine = L.polyline(rl, { color: '#E53935', weight: 5, opacity: 0.85 }).addTo(map);
  } else if (routeLine) { try { map.removeLayer(routeLine); } catch (e) {} routeLine = null; }
};
window.__lookifyFollow = function (lat, lng) {
  try { map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true }); } catch (e) {}
};
window.ReactNativeWebView.postMessage('READY');
</script></body></html>`;
}

export default function LookifyMap({ initial, pins = [], trail = [], route = [], follow, onProPress }: Props) {
  const ref = useRef<WebView | null>(null);
  const pressRef = useRef(onProPress);
  const lastFollow = useRef<{ latitude: number; longitude: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    pressRef.current = onProPress;
  }, [onProPress]);

  const html = useMemo(
    () => buildHtml(initial),
    // Solo al montar: cambios de initial no recargan el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Pines + líneas en vivo (inyectado, sin recargar la página).
  useEffect(() => {
    if (!ready) return;
    const payload = JSON.stringify({ pins, trail, route });
    ref.current?.injectJavaScript(`window.__lookifyUpdate(${payload});true;`);
  }, [ready, pins, trail, route]);

  // Cámara seguidora (>30 m, como antes en nativo).
  useEffect(() => {
    if (!ready || !follow) return;
    const prev = lastFollow.current;
    lastFollow.current = follow;
    if (!prev) return;
    const dLat = Math.abs(follow.latitude - prev.latitude) * 111_320;
    const dLng = Math.abs(follow.longitude - prev.longitude) * 111_320;
    if (dLat < 30 && dLng < 30) return;
    ref.current?.injectJavaScript(`window.__lookifyFollow(${follow.latitude}, ${follow.longitude});true;`);
  }, [ready, follow]);

  const onMessage = (e: WebViewMessageEvent) => {
    const data = e.nativeEvent.data;
    if (data === 'READY') {
      setReady(true);
      console.log('[LookifyMap] mapa Leaflet listo (WebView)');
      return;
    }
    try {
      const msg = JSON.parse(data);
      if (msg?.type === 'press' && typeof msg.id === 'string') pressRef.current?.(msg.id);
    } catch {
      /* mensaje no-JSON: ignorar */
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={ref}
        style={styles.web}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        javaScriptEnabled
      />
      {!ready && !failed && (
        <View style={styles.loading}>
          <Text style={styles.loadingT}>Cargando mapa en vivo…</Text>
        </View>
      )}
      {failed && (
        <View style={styles.loading}>
          <Text style={styles.loadingT}>
            Sin mapa offline · 📍 {initial.latitude.toFixed(5)}, {initial.longitude.toFixed(5)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e8edf3' },
  web: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  loadingT: { color: '#0f1e36', fontSize: 12, fontWeight: '700' },
});
