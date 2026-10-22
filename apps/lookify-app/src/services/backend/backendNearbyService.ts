// src/services/backend/backendNearbyService.ts
// Profesionales cercanos reales: GET /realtime/nearby del realtime-server.
// Solo entra un profesional verificado y online. La respuesta trae la
// ubicación del pro (no la del cliente) y su nombre público.

import { NearbyService, ProfesionalCercano } from '../nearbyService';
import { BACKEND } from '../../lib/backend/config';
import { loadClientSession } from '../../lib/backend/clientAuth';
import { ServiceError } from '../errors';
import { distanciaKm } from '../../utils/geo';

type NearbyRow = {
  professional_id: number | string;
  lat: number | null;
  lng: number | null;
  display_name?: string | null;
  rating_avg?: number | null;
  is_online?: boolean | null;
};

// Último resultado en memoria: permite mostrar la distancia al pro que
// aceptó sin volver a preguntar al servidor.
let ultimoListado: ProfesionalCercano[] = [];

export function getUltimoListadoCercanos(): ProfesionalCercano[] {
  return ultimoListado;
}

export function createBackendNearbyService(): NearbyService {
  return {
    async listarCercanos(input): Promise<ProfesionalCercano[]> {
      const session = await loadClientSession();
      if (!session || !session.token || session.token === 'offline-local') {
        throw new ServiceError('INVALID_CREDENTIALS');
      }
      const radioM = Math.min(Math.max(input.radioKm * 1000, 100), 20000);
      const url =
        `${BACKEND.socketUrl}/realtime/nearby?lat=${encodeURIComponent(String(input.lat))}` +
        `&lng=${encodeURIComponent(String(input.lng))}&radius=${radioM}&limit=50`;
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
      } catch {
        throw new ServiceError('NETWORK');
      }
      if (!res.ok) throw new ServiceError('UNKNOWN', 'No pudimos buscar profesionales.');
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const rows: NearbyRow[] = Array.isArray(json?.data) ? json.data : [];
      ultimoListado = rows
        .filter((r) => r.lat !== null && r.lng !== null)
        .map((r) => ({
          id: String(r.professional_id),
          nombre: r.display_name ?? 'Profesional',
          calificacion: r.rating_avg === null || r.rating_avg === undefined ? null : Number(r.rating_avg),
          avatar: null,
          latitude: Number(r.lat),
          longitude: Number(r.lng),
          distanciaKm:
            Math.round(distanciaKm(input.lat, input.lng, Number(r.lat), Number(r.lng)) * 10) / 10,
        }))
        .sort((a, b) => a.distanciaKm - b.distanciaKm);
      return ultimoListado;
    },
  };
}
