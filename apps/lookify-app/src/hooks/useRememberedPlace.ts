// src/hooks/useRememberedPlace.ts
// Recuerda tu ubicación entre sesiones (SecureStore) y le pone nombre.
//
// - Al abrir la app muestra tu último punto guardado (ej. Soacha) mientras
//   el GPS en vivo se fija: no empiezas en el punto mock.
// - El nombre sale del geocodificador nativo (expo-location, sin API key).
//   Si no hay red/geocoder, usa cajas aproximadas (Soacha primero).
// - Guarda solo si te moviste >50 m (no escribe cada 2 s) y re-etiqueta si
//   te moviste >500 m.

import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { MOCK_CLIENT_LOCATION } from '../constants/geo';
import { distanciaKm } from '../utils/geo';
import type { LiveCoords } from './useLiveLocation';

const STORE_KEY = 'lookify:lastPlace';
const SAVE_MIN_M = 50;
const LABEL_MIN_M = 500;

export type RememberedPlace = {
  latitude: number;
  longitude: number;
  label: string;
};

/** Caja aproximada de Soacha (tu ubicación): 4.55–4.65, -74.28–-74.15. */
function guessFromBox(lat: number, lng: number): string {
  if (lat >= 4.55 && lat <= 4.65 && lng >= -74.28 && lng <= -74.15) return 'Soacha';
  if (lat >= 4.4 && lat <= 4.85 && lng >= -74.25 && lng <= -73.99) return 'Bogotá';
  return 'Tu ubicación';
}

async function resolveLabel(lat: number, lng: number): Promise<string> {
  try {
    const r = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const first = r?.[0];
    const city =
      first?.city ?? first?.district ?? first?.subregion ?? first?.region ?? first?.name ?? null;
    if (city) return city;
  } catch {
    /* sin red/geocoder: fallback a caja */
  }
  return guessFromBox(lat, lng);
}

async function loadStored(): Promise<RememberedPlace | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<RememberedPlace>;
    if (typeof p.latitude === 'number' && typeof p.longitude === 'number') {
      return { latitude: p.latitude, longitude: p.longitude, label: p.label ?? 'Tu ubicación' };
    }
  } catch {
    /* sin guardado previo */
  }
  return null;
}

export function useRememberedPlace(live: LiveCoords | null): {
  /** Punto a mostrar: en vivo > recordado > mock. */
  coords: { latitude: number; longitude: number };
  /** Nombre del lugar (ej. "Soacha"). */
  label: string;
  /** true si hay punto real (vivo o recordado). */
  hasFix: boolean;
  /** true si el punto es del GPS en vivo. */
  isLive: boolean;
} {
  const [stored, setStored] = useState<RememberedPlace | null>(null);
  const storedRef = useRef<RememberedPlace | null>(null);
  useEffect(() => {
    storedRef.current = stored;
  }, [stored]);

  useEffect(() => {
    void loadStored().then(setStored);
  }, []);

  // Guarda cada fix en vivo (throttle >50 m).
  useEffect(() => {
    if (!live) return;
    const prev = storedRef.current;
    if (prev) {
      const movedM = distanciaKm(prev.latitude, prev.longitude, live.latitude, live.longitude) * 1000;
      if (movedM < SAVE_MIN_M) return;
    }
    const next: RememberedPlace = {
      latitude: live.latitude,
      longitude: live.longitude,
      label: prev?.label ?? guessFromBox(live.latitude, live.longitude),
    };
    setStored(next);
    void SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next)).catch(() => {});
  }, [live]);

  // Etiqueta con nombre (throttle >500 m o sin etiqueta real).
  useEffect(() => {
    const cur = live
      ? { latitude: live.latitude, longitude: live.longitude }
      : storedRef.current;
    if (!cur) return;
    const prev = storedRef.current;
    if (prev?.label && prev.label !== 'Tu ubicación') {
      const movedM = distanciaKm(prev.latitude, prev.longitude, cur.latitude, cur.longitude) * 1000;
      if (movedM < LABEL_MIN_M) return;
    }
    let cancelled = false;
    void resolveLabel(cur.latitude, cur.longitude).then((label) => {
      if (cancelled) return;
      setStored((s) => {
        const base = s ?? { latitude: cur.latitude, longitude: cur.longitude, label };
        const next = { ...base, label };
        void SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [live]);

  if (live) {
    return {
      coords: { latitude: live.latitude, longitude: live.longitude },
      label: stored?.label ?? guessFromBox(live.latitude, live.longitude),
      hasFix: true,
      isLive: true,
    };
  }
  if (stored) return { coords: stored, label: stored.label, hasFix: true, isLive: false };
  return {
    coords: { ...MOCK_CLIENT_LOCATION },
    label: 'Chapinero, Bogotá',
    hasFix: false,
    isLive: false,
  };
}
