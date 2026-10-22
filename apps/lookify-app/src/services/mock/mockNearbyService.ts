import { NearbyService, ProfesionalCercano } from '../nearbyService';
import { MOCK_PROFESSIONALS } from '../../data/mockProfessionals';
import { distanciaKm } from '../../utils/geo';

// Mock de cercanos: deriva de los datos de ejemplo (sin red).

export function createMockNearbyService(): NearbyService {
  return {
    async listarCercanos(input): Promise<ProfesionalCercano[]> {
      return MOCK_PROFESSIONALS.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        calificacion: p.calificacion,
        avatar: null,
        latitude: p.latitude,
        longitude: p.longitude,
        distanciaKm:
          Math.round(
            distanciaKm(input.lat, input.lng, p.latitude, p.longitude) * 10
          ) / 10,
      })).filter((p) => p.distanciaKm <= input.radioKm);
    },
  };
}
