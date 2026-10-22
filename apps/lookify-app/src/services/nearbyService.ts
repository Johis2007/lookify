import { createMockNearbyService } from './mock/mockNearbyService';

// Profesionales cercanos (radio) del cliente.
// En modo backend consulta GET /realtime/nearby del realtime-server; con
// EXPO_PUBLIC_USE_BACKEND=false usa el mock (sin red).

export type ProfesionalCercano = {
  id: string;
  nombre: string;
  calificacion: number | null;
  avatar: string | null;
  latitude: number;
  longitude: number;
  /** Distancia aproximada al cliente en km (1 decimal). */
  distanciaKm: number;
};

export interface NearbyService {
  listarCercanos(input: {
    lat: number;
    lng: number;
    radioKm: number;
  }): Promise<ProfesionalCercano[]>;
}

let implementation: NearbyService = createMockNearbyService();

export function getNearbyService(): NearbyService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP (ver initBackend). */
export function setNearbyServiceForTesting(service: NearbyService): void {
  implementation = service;
}
