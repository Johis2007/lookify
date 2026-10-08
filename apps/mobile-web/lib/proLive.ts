import { useCallback, useEffect, useRef, useState } from 'react';
import { watchThrottled, type LatLng } from './location';
import { ensureLocationPermission } from './permissions';
import { readJson } from './http';
import {
  attachBookingToPro,
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
  const [verification, setVerification] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastFix, setLastFix] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopWatch = useRef<(() => void) | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const mirrorAt = useRef(0);

  // Resuelve el id profesional del usuario actual (+ estado de verificación).
  // Expuesto como reload() para re-consultar tras la revisión del admin.
  const reload = useCallback(async () => {
    if (!enabled || !userId) return;
    try {
      const r = await authFetch(
        `/items/beauty_professionals?filter[user][_eq]=${userId}&fields=id,is_online,verification_status&limit=1`
      );
      if (!r.ok) return;
      const data = (await readJson<{ data?: any[] }>(r))?.data;
      if (Array.isArray(data) && data.length) {
        setProfessionalId(Number(data[0].id));
        setIsOnline(Boolean(data[0].is_online));
        setVerification(typeof data[0].verification_status === 'string' ? data[0].verification_status : null);
      }
    } catch {
      /* sin permiso: se queda en null */
    }
  }, [authFetch, userId, enabled]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const stopPublishing = useCallback(() => {
    stopWatch.current?.();
    stopWatch.current = null;
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = null;
    setPublishing(false);
  }, []);

  // Ref espejo del estado para la limpieza al desmontar (sin setState).
  // authFetch va en ref porque rota con cada refresh del token.
  const liveRef = useRef({ isOnline: false, professionalId: null as number | null });
  liveRef.current = { isOnline, professionalId };
  const fetchRef = useRef(authFetch);
  fetchRef.current = authFetch;

  // Al desmontar en caliente (ej. logout): marcar offline en servidor y
  // Directus para no dejar fantasma "online" en el radar.
  useEffect(() => {
    const doStop = stopPublishing;
    return () => {
      doStop();
      const snap = liveRef.current;
      if (snap.isOnline && snap.professionalId) {
        const pid = snap.professionalId;
        emitProOffline(pid);
        fetchRef.current(`/items/beauty_professionals/${pid}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_online: false }),
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPublishing]);

  // Al ponerse online, vincular las reservas activas (accepted/in_progress)
  // a este GPS: si la aceptación se hizo en otro dispositivo (ej. panel
  // admin), el tracking del cliente igual recibe pro:location en vivo.
  // Best-effort: si falla, el attach del incoming/tracking lo compensa.
  const attachActiveBookings = useCallback(async (pid: number) => {
    try {
      const r = await fetchRef.current(
        `/items/bookings?filter[professional][_eq]=${pid}&filter[status][_in]=accepted,in_progress&fields=id&limit=10`
      );
      if (!r.ok) return;
      const rows = (await readJson<{ data?: any[] }>(r))?.data;
      if (Array.isArray(rows)) {
        for (const b of rows) {
          if (b?.id != null) attachBookingToPro(b.id, pid);
        }
      }
    } catch {
      /* best-effort */
    }
  }, []);

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
      // Solo profesionales verificados reciben solicitudes (rol fijo en registro).
      if (on && verification !== null && verification !== 'verified') {
        setError('Tu cuenta está en revisión. Podrás recibir solicitudes cuando el administrador la apruebe.');
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
        // Sin permiso de ubicación no se marca online: evita estado
        // inconsistente (online sin GPS) y guía a Ajustes si lo negó.
        const locOk = await ensureLocationPermission();
        if (!locOk) {
          setError('Activa la ubicación para ponerte online.');
          return;
        }
        emitProOnline(professionalId);
        setIsOnline(true);
        setPublishing(true);
        void attachActiveBookings(professionalId);
        try {
          stopWatch.current = await watchThrottled((ll) => {
            publishFix(ll).catch(() => {});
          });
        } catch {
          setError('No se pudo iniciar el GPS.');
          stopPublishing();
          emitProOffline(professionalId);
          setIsOnline(false);
          return;
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
    [authFetch, professionalId, verification, publishFix, stopPublishing, attachActiveBookings]
  );

  return { professionalId, verification, isOnline, publishing, lastFix, error, setOnline, reload };
}
