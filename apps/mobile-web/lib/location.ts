import * as Location from 'expo-location';
import { emitLocationUpdate, emitProfOnline, emitProfOffline } from './socket';

/**
 * Configuración de throttling GPS según roadmap:
 * - Solo emitir si se movió > 20 metros
 * - Mínimo 8 segundos entre emisiones
 * - Heartbeat cada 30s para mantener online
 */

const THROTTLE_DISTANCE = 20; // metros
const THROTTLE_TIME = 8000; // ms (8s)
const HEARTBEAT_INTERVAL = 30000; // ms (30s)

let lastLocation: { lat: number; lng: number; timestamp: number } | null = null;
let locationSubscription: Location.LocationSubscription | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let isOnline = false;
let professionalId: string | null = null;

/**
 * Calcular distancia entre dos puntos (Haversine) en metros
 */
function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Verificar si debe emitir ubicación (throttle por distancia y tiempo)
 */
function shouldEmit(newLat: number, newLng: number, timestamp: number): boolean {
  if (!lastLocation) return true;

  const distance = calculateDistance(
    lastLocation.lat, lastLocation.lng,
    newLat, newLng
  );

  const timeDiff = timestamp - lastLocation.timestamp;

  return distance >= THROTTLE_DISTANCE || timeDiff >= THROTTLE_TIME;
}

/**
 * Iniciar tracking de ubicación para profesional
 */
export async function startLocationTracking(profId: string): Promise<{ success: boolean; error?: string }> {
  professionalId = profId;

  // Solicitar permisos
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    return { success: false, error: 'Permiso de ubicación denegado' };
  }

  // Solicitar permisos de fondo (opcional, para tracking en background)
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  console.log('[Location] Background permission:', bgStatus);

  // Configurar opciones de alta precisión
  const options: Location.LocationOptions = {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000, // Request update every 5s (throttle interno filtra)
    distanceInterval: 10, // Mínimo 10m de cambio
    mayShowUserSettingsDialog: true,
  };

  // Iniciar watch
  locationSubscription = await Location.watchPositionAsync(options, (loc) => {
    const { latitude: lat, longitude: lng } = loc.coords;
    const now = loc.timestamp || Date.now();

    if (shouldEmit(lat, lng, now)) {
      lastLocation = { lat, lng, timestamp: now };
      emitLocationUpdate({ lat, lng, ts: now });
    }
  });

  // Heartbeat para mantener online status
  heartbeatInterval = setInterval(() => {
    if (professionalId && lastLocation) {
      emitProfOnline(professionalId);
    }
  }, HEARTBEAT_INTERVAL);

  // Emitir online inicial
  emitProfOnline(profId);
  isOnline = true;

  return { success: true };
}

/**
 * Detener tracking de ubicación
 */
export function stopLocationTracking() {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (professionalId) {
    emitProfOffline(professionalId);
    professionalId = null;
  }

  lastLocation = null;
  isOnline = false;
}

/**
 * Obtener ubicación actual una sola vez (para cliente)
 */
export async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
  };
}

/**
 * Verificar si el tracking está activo
 */
export function isTrackingActive(): boolean {
  return locationSubscription !== null && isOnline;
}

/**
 * Obtener última ubicación conocida
 */
export function getLastLocation() {
  return lastLocation;
}

/**
 * Geocodificar dirección a coordenadas
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(address);
    if (results.length > 0) {
      return { lat: results[0].latitude, lng: results[0].longitude };
    }
  } catch (e) {
    console.error('[Location] Geocode error:', e);
  }
  return null;
}

/**
 * Reverse geocoding: coordenadas a dirección
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (results.length > 0) {
      const r = results[0];
      return `${r.street || ''} ${r.streetNumber || ''}, ${r.city || ''}, ${r.region || ''}`.trim();
    }
  } catch (e) {
    console.error('[Location] Reverse geocode error:', e);
  }
  return null;
}

export default {
  startLocationTracking,
  stopLocationTracking,
  getCurrentLocation,
  isTrackingActive,
  getLastLocation,
  geocodeAddress,
  reverseGeocode,
};