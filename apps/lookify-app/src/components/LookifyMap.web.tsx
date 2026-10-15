// src/components/LookifyMap.web.tsx
// Mapa unificado en web: Leaflet 1.9.4 por CDN (sin API key, tiles OSM).
// Metro usa este archivo en web (.web.tsx tiene prioridad sobre .tsx).
// Monta el mapa una sola vez y actualiza pines + recorrido + cámara sin
// recargar. Solo toca window/document dentro de useEffect (seguro en el
// prerender estático del export web).
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type ProPin = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  color?: string;
};

export type TrailPoint = { latitude: number; longitude: number };

type Props = {
  initial: { latitude: number; longitude: number };
  pins?: ProPin[];
  trail?: TrailPoint[];
  follow?: { latitude: number; longitude: number } | null;
  onProPress?: (id: string) => void;
};

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    try {
      if (!document.querySelector(`link[data-leaflet]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = LEAFLET_CSS;
        link.setAttribute('data-leaflet', '1');
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.async = true;
      script.onload = () => resolve((window as any).L);
      script.onerror = () => {
        leafletPromise = null;
        reject(new Error('MAP_LIB_FAIL'));
      };
      document.head.appendChild(script);
    } catch (e) {
      leafletPromise = null;
      reject(e);
    }
  });
  return leafletPromise;
}

export default function LookifyMap({ initial, pins = [], trail = [], follow, onProPress }: Props) {
  const divRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const lineRef = useRef<any>(null);
  const pressRef = useRef(onProPress);
  useEffect(() => {
    pressRef.current = onProPress;
  }, [onProPress]);
  const lastCamRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Monta el mapa una sola vez (solo cliente: useEffect no corre en el
  // prerender estático del export web).
  useEffect(() => {
    let cancelled = false;
    let map: any = null;
    const markers = markersRef.current;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !divRef.current) return;
        map = L.map(divRef.current, { zoomControl: true }).setView(
          [initial.latitude, initial.longitude],
          14
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
        // @ts-ignore - fix de iconos cuando Leaflet viene de CDN
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
        lastCamRef.current = { ...initial };
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      try {
        map?.remove();
      } catch {
        /* noop */
      }
      if (mapRef.current === map) mapRef.current = null;
      markers.clear();
      lineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pines + recorrido + cámara seguidora, sin recargar nada.
  useEffect(() => {
    const map = mapRef.current;
    const W = window as any;
    if (!map || !W.L || !ready) return;
    const L = W.L;

    // Pines: diff por id para no parpadear.
    const seen = new Set<string>();
    for (const p of pins) {
      seen.add(p.id);
      const cur = markersRef.current.get(p.id);
      if (cur) {
        cur.setLatLng([p.latitude, p.longitude]);
        if (p.title) cur.setTooltipContent(p.title);
      } else {
        const m = L.marker([p.latitude, p.longitude], { title: p.title ?? 'Profesional Lookify' });
        if (p.title) m.bindTooltip(p.title);
        m.on('click', () => pressRef.current?.(p.id));
        m.addTo(map);
        markersRef.current.set(p.id, m);
      }
    }
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        try {
          map.removeLayer(m);
        } catch {
          /* noop */
        }
        markersRef.current.delete(id);
      }
    }

    // Recorrido del profesional.
    if (trail.length > 1) {
      const latlngs = trail.map((t) => [t.latitude, t.longitude]);
      if (lineRef.current) lineRef.current.setLatLngs(latlngs);
      else lineRef.current = L.polyline(latlngs, { color: '#143ca0', weight: 4, opacity: 0.65 }).addTo(map);
    } else if (lineRef.current) {
      try {
        map.removeLayer(lineRef.current);
      } catch {
        /* noop */
      }
      lineRef.current = null;
    }

    // La cámara sigue al profesional (>30m, como en nativo).
    const target = follow ?? null;
    if (target) {
      const prev = lastCamRef.current;
      const moved = !prev ||
        Math.abs(target.latitude - prev.latitude) * 111_320 > 30 ||
        Math.abs(target.longitude - prev.longitude) * 111_320 > 30;
      if (moved || !prev) {
        lastCamRef.current = { ...target };
        try {
          map.setView([target.latitude, target.longitude], Math.max(map.getZoom(), 14), { animate: true });
        } catch {
          /* mapa aún montando */
        }
      }
    }
  }, [ready, pins, trail, follow]);

  const center = follow ?? initial;
  const q = `${center.latitude.toFixed(5)},${center.longitude.toFixed(5)}`;

  return (
    <View style={styles.container}>
      {/* @ts-ignore - div solo existe en web */}
      <div ref={divRef} style={{ width: '100%', height: '100%', minHeight: 200, backgroundColor: '#e8edf3' }} />
      {!ready && !failed && (
        <View style={styles.loading}>
          <Text style={styles.loadingT}>Cargando mapa en vivo…</Text>
        </View>
      )}
      {failed && (
        <View style={styles.loading}>
          <Text style={styles.loadingT}>Sin mapa offline · 📍 {q}</Text>
        </View>
      )}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {pins.length} profesionales cerca{trail.length > 1 ? ` · recorrido ${trail.length} pts` : ''} · 📍 {q}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' as any },
  loading: {
    position: 'absolute' as any,
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  loadingT: { color: '#0f1e36', fontSize: 12, fontWeight: '700' as any },
  badge: {
    position: 'absolute' as any,
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: { color: '#fff', fontSize: 12 },
});
