import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import type { LatLng } from './location';

const IS_WEB = Platform.OS === 'web';
const canWindowConfirm = () => typeof window !== 'undefined' && typeof window.confirm === 'function';

export type CoordSource = 'none' | 'gps' | 'live' | 'manual' | 'fallback';

export type ClientCoords = LatLng & {
  accuracy?: number | null;
  label?: string;
};

/** Ubicación por defecto (Soacha centro, ciudad foco) mientras no hay GPS ni manual. */
export const FALLBACK_COORDS: LatLng = { latitude: 4.5792, longitude: -74.2168 };

type PermissionState = 'unknown' | 'granted' | 'denied';

/**
 * Ubicación real de la persona que usa la app (cliente).
 *
 * Flujo exigido:
 *  1. Confirmación explícita ANTES de pedir el permiso del sistema
 *     (diálogo con explicación del por qué).
 *  2. Opción manual (ingresar lat/lng o punto de referencia).
 *  3. Opción GPS (autodetectar con alta precisión).
 *  4. Tracking en tiempo real (watchPosition) con coordenadas visibles.
 */
export function useClientLocation() {
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [coords, setCoords] = useState<ClientCoords | null>(null);
  const [source, setSource] = useState<CoordSource>('none');
  const [requesting, setRequesting] = useState(false);
  const [live, setLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchSub = useRef<Location.LocationSubscription | null>(null);

  // Estado inicial del permiso (sin pedirlo: solo lectura).
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setPermission(p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied'))
      .catch(() => {});
    return () => {
      watchSub.current?.remove();
      watchSub.current = null;
    };
  }, []);

  const applyFix = useCallback((ll: LatLng, accuracy: number | null, src: CoordSource, label?: string) => {
    setCoords({ ...ll, accuracy, ...(label ? { label } : {}) });
    setSource(src);
    setLastUpdate(Date.now());
    setError(null);
  }, []);

  /**
   * Paso 1: confirmación con explicación. Solo si acepta se pide el permiso
   * del sistema y se lee el GPS. Devuelve true si se obtuvo ubicación.
   */
  const requestWithConfirm = useCallback(async (): Promise<boolean> => {
    // En web Alert.alert no resuelve: se usa el confirm del navegador y el
    // permiso real lo pide el GPS (prompt del navegador, solo HTTPS/localhost).
    const accepted = IS_WEB && canWindowConfirm()
      ? window.confirm('Lookify usará tu ubicación actual para mostrarte profesionales cercanos y seguir tu servicio en el mapa. Puedes cambiarla manualmente cuando quieras.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Usar tu ubicación',
            'Lookify usará tu ubicación actual para mostrarte profesionales cercanos y seguir tu servicio en el mapa. Puedes cambiarla manualmente cuando quieras.',
            [
              { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Permitir', onPress: () => resolve(true) },
            ]
          );
        });
    if (!accepted) return false;
    setRequesting(true);
    setError(null);
    try {
      const req = await Location.requestForegroundPermissionsAsync();
      if (!req.granted) {
        setPermission(req.canAskAgain ? 'unknown' : 'denied');
        if (!req.canAskAgain) {
          // En web no hay Ajustes del sistema: se avisa y queda la entrada manual.
          if (IS_WEB && typeof window !== 'undefined') {
            window.alert('Sin ubicación seguiremos con un punto aproximado. Activa el permiso en tu navegador o ingresa tu ubicación manualmente.');
          } else {
            Alert.alert(
              'Permiso denegado',
              'Sin ubicación seguiremos con un punto aproximado. Puedes activarla en Ajustes o ingresar tu ubicación manualmente.',
              [
                { text: 'Ingresar manual', onPress: () => {} },
                { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
                { text: 'Cerrar', style: 'cancel' },
              ]
            );
          }
        } else {
          setError('Permiso de ubicación denegado. Puedes ingresarla manualmente.');
        }
        return false;
      }
      setPermission('granted');
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      applyFix(
        { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        pos.coords.accuracy ?? null,
        live ? 'live' : 'gps'
      );
      return true;
    } catch {
      setError('No se pudo obtener tu ubicación. Revisa tu GPS e inténtalo de nuevo.');
      return false;
    } finally {
      setRequesting(false);
    }
  }, [applyFix, live]);

  /** Reintento directo del GPS (cuando el permiso ya está concedido). */
  const refreshGps = useCallback(async (): Promise<boolean> => {
    if (permission !== 'granted') return requestWithConfirm();
    setRequesting(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      applyFix(
        { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        pos.coords.accuracy ?? null,
        live ? 'live' : 'gps'
      );
      return true;
    } catch {
      setError('No se pudo actualizar el GPS.');
      return false;
    } finally {
      setRequesting(false);
    }
  }, [permission, live, applyFix, requestWithConfirm]);

  /** Tracking en tiempo real: watchPosition (10 m / 5 s) con coordenadas visibles. */
  const setLiveTracking = useCallback(
    async (on: boolean): Promise<boolean> => {
      if (on) {
        if (permission !== 'granted') {
          const ok = await requestWithConfirm();
          if (!ok) return false;
        }
        try {
          watchSub.current?.remove();
          const sub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              distanceInterval: 10,
              timeInterval: 5000,
            },
            (loc) => {
              setCoords((prev) => ({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy ?? null,
                ...(prev?.label ? { label: prev.label } : {}),
              }));
              setSource('live');
              setLastUpdate(Date.now());
            }
          );
          watchSub.current = sub;
          setLive(true);
          setSource((s) => (coords ? 'live' : s));
          return true;
        } catch {
          setError('No se pudo iniciar el seguimiento en vivo.');
          return false;
        }
      }
      watchSub.current?.remove();
      watchSub.current = null;
      setLive(false);
      setSource((s) => (s === 'live' ? 'gps' : s));
      return true;
    },
    [permission, requestWithConfirm, coords]
  );

  /** Ubicación manual (el usuario la ingresa cuando no quiere usar GPS). */
  const setManual = useCallback((lat: number, lng: number, label?: string) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    watchSub.current?.remove();
    watchSub.current = null;
    setLive(false);
    applyFix({ latitude: lat, longitude: lng }, null, 'manual', label?.trim() || 'Ubicación manual');
    return true;
  }, [applyFix]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  /** Coordenadas efectivas: reales si existen, aproximadas si no. */
  const effective: ClientCoords = coords ?? { ...FALLBACK_COORDS, label: 'Ubicación aproximada' };
  const effectiveSource: CoordSource = coords ? source : 'fallback';

  return {
    permission,
    coords: effective,
    hasRealFix: coords !== null,
    source: effectiveSource,
    requesting,
    live,
    lastUpdate,
    error,
    requestWithConfirm,
    refreshGps,
    setLiveTracking,
    setManual,
    openSettings,
  };
}

export type ClientLocation = ReturnType<typeof useClientLocation>;
