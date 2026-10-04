import { useCallback, useEffect, useRef, useState } from 'react';
import { watchThrottled, type LatLng } from './location';
import {
  emitHeartbeat,
  emitLocation,
  emitProOffline,
  emitProOnline,
} from './socket';

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

// Fase 5: estado "pro online" con heartbeat + publicación GPS throttled.
// - Activa is_online en Directus y avisa al realtime-server.
// - Publica ubicación (8s / 20m) por socket + espejo en beauty_professionals.
// - Heartbeat cada 25s para no expirar el TTL 40s de Redis.
// - Limpieza al desmontar o al pasar offline.
export function useProLive(
  authFetch: AuthFetch,
  userId: string | undefined,
  enabled: boolean
) {
  const [professionalId, setProfessionalId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastFix, setLastFix] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopWatch = useRef<(() => void) | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const mirrorAt = useRef(0);

  // Resuelve el id profesional del usuario actual.
  useEffect(() => {
    if (!enabled || !userId) return;
    let alive = true;
    (async () => {
      try {
        const r = await authFetch(
          `/items/beauty_professionals?filter[user][_eq]=${userId}&fields=id,is_online&limit=1`
        );
        if (!r.ok) return;
        const { data } = await r.json();
        if (alive && Array.isArray(data) && data.length) {
          setProfessionalId(Number(data[0].id));
          setIsOnline(Boolean(data[0].is_online));
        }
      } catch {
        /* sin permiso: se queda en null */
      }
    })();
    return () => {
      alive = false;
    };
  }, [authFetch, userId, enabled]);

  const stopPublishing = useCallback(() => {
    stopWatch.current?.();
    stopWatch.current = null;
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = null;
    setPublishing(false);
  }, []);

  useEffect(() => () => stopPublishing(), [stopPublishing]);

  const publishFix = useCallback(
    async (ll: LatLng) => {
      if (!professionalId) return;
      setLastFix(ll);
      emitLocation(professionalId, ll.latitude, ll.longitude);
      // Espejo en Directus como fallback de polling (máx 1 vez / 30s).
      const now = Date.now();
      if (now - mirrorAt.current > 30_000) {
        mirrorAt.current = now;
        try {
          await authFetch(`/items/beauty_professionals/${professionalId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              current_lat: ll.latitude,
              current_lng: ll.longitude,
            }),
          });
        } catch {
          /* best-effort */
        }
      }
    },
    [authFetch, professionalId]
  );

  const setOnline = useCallback(
    async (on: boolean) => {
      if (!professionalId) {
        setError('Aún no tienes perfil profesional.');
        return;
      }
      setError(null);
      try {
        await authFetch(`/items/beauty_professionals/${professionalId}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_online: on }),
        });
      } catch {
        /* best-effort: el socket igual marca presencia */
      }
      if (on) {
        emitProOnline(professionalId);
        setIsOnline(true);
        setPublishing(true);
        try {
          stopWatch.current = await watchThrottled((ll) => {
            publishFix(ll).catch(() => {});
          });
        } catch {
          setError('Sin permiso de ubicación.');
        }
        emitHeartbeat(professionalId);
        if (heartbeat.current) clearInterval(heartbeat.current);
        heartbeat.current = setInterval(() => emitHeartbeat(professionalId), 25_000);
      } else {
        stopPublishing();
        emitProOffline(professionalId);
        setIsOnline(false);
        try {
          await authFetch(`/items/beauty_professionals/${professionalId}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_online: false }),
          });
        } catch {
          /* noop */
        }
      }
    },
    [authFetch, professionalId, publishFix, stopPublishing]
  );

  return { professionalId, isOnline, publishing, lastFix, error, setOnline };
}
