// src/services/backend/backendProfessionalIncomingRequestService.ts
// Solicitudes reales: bookings pending del profesional + socket booking:new.
// Cache en memoria de la última activa para el listener (indirección sin
// importar mocks). Sin dirección exacta hasta aceptación mutua.

import {
  ProfessionalIncomingRequestService,
} from '../professionalIncomingRequestService';
import {
  AceptarSolicitudEntranteRequest,
  AlCerrarSesionIncomingRequest,
  ObtenerSolicitudActivaRequest,
  ObtenerSolicitudEntranteRequest,
  ProcesarExpiracionSolicitudRequest,
  RechazarSolicitudEntranteRequest,
  RespuestaAccionSolicitudEntrante,
  SimularClienteSolicitudRequest,
  SimularSolicitudEntranteRequest,
  SolicitudEntrante,
} from '../../types/professionalIncomingRequest';
import { ServiceError } from '../errors';
import { api } from '../../lib/backend/directus';
import { bffApi } from '../../lib/backend/bff';
import { loadBackendSession, resolveProfessionalId } from '../../lib/backend/session';
import {
  DBooking,
  DProfessional,
  DReview,
  desglose,
  distanciaAprox,
  expiraEnDesdeCreada,
  primerNombre,
} from '../../lib/backend/mapping';
import {
  disconnectRealtime,
  emitBookingStatus,
  ensureProOnline,
  joinBookingRoom,
  onBookingNew,
} from '../../lib/backend/realtime';

const cacheActiva = new Map<string, SolicitudEntrante>();

/** Última solicitud activa conocida (para el listener, sin mocks). */
export function getActiveSolicitudBackend(profesionalId: string): SolicitudEntrante | null {
  const s = cacheActiva.get(profesionalId);
  return s ? { ...s } : null;
}

function recordar(s: SolicitudEntrante): void {
  cacheActiva.set(s.profesionalId, { ...s });
}

function olvidar(profesionalId: string): void {
  cacheActiva.delete(profesionalId);
}

async function mapearSolicitud(
  token: string,
  b: DBooking,
  professionalId: number,
): Promise<SolicitudEntrante> {
  const svc = typeof b.service === 'object' && b.service !== null ? b.service : null;
  const [pro, clientReviews] = await Promise.all([
    api<DProfessional>(
      'GET',
      `/items/beauty_professionals/${professionalId}?fields=current_lat,current_lng`,
      token,
    ).catch(() => null),
    api<DReview[]>(
      'GET',
      `/items/reviews?filter[client][_eq]=${b.client}&fields=rating&limit=100`,
      token,
    ).catch(() => []),
  ]);
  const total = clientReviews.length;
  const prom = total > 0 ? clientReviews.reduce((a, r) => a + r.rating, 0) / total : null;
  const base = svc?.price_base ?? b.price_snapshot;
  const d = desglose(base, b.price_snapshot);
  const dist = distanciaAprox(pro?.current_lat, pro?.current_lng, b.lat, b.lng);
  return {
    id: String(b.id),
    profesionalId: String(professionalId),
    servicioId: svc ? String(svc.id) : String(b.service),
    servicioNombre: svc?.name ?? 'Servicio',
    duracionMin: svc?.duration_min ?? 60,
    distanciaKmAprox: dist ?? 0,
    desglose: d,
    clientePrimerNombre: primerNombre(b.clientFirstName),
    clienteCalificacionPromedio: prom !== null ? Math.round(prom * 10) / 10 : null,
    clienteTotalResenas: total,
    expiraEn: expiraEnDesdeCreada(b.created_at),
    estado: 'PENDIENTE_PRO',
  };
}

// Reserva propia del profesional vía BFF (valida participación en el servidor).
async function bookingPropio(
  token: string,
  bookingId: string,
  professionalId: number,
): Promise<DBooking> {
  const id = Number(bookingId);
  if (!Number.isInteger(id) || id <= 0) throw new ServiceError('VALIDATION');
  const b = await bffApi<DBooking>(
    'GET',
    `/api/bookings/${id}`,
    token,
    undefined,
    'SOLICITUD_ENTRANTE_NO_ENCONTRADA',
  );
  if (b.professional !== null && Number(b.professional) !== professionalId) {
    throw new ServiceError('SOLICITUD_ENTRANTE_NO_ENCONTRADA');
  }
  return b;
}

export function createBackendProfessionalIncomingRequestService(): ProfessionalIncomingRequestService {
  return {
    async obtenerSolicitudActiva(input: ObtenerSolicitudActivaRequest): Promise<SolicitudEntrante | null> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const rows = await bffApi<DBooking[]>(
        'GET',
        '/api/bookings/pro/mine?status=pending',
        session.token,
      );
      const b = rows[0];
      if (!b) {
        olvidar(String(professionalId));
        return null;
      }
      const s = await mapearSolicitud(session.token, b, professionalId);
      recordar(s);
      return s;
    },

    async obtenerSolicitud(input: ObtenerSolicitudEntranteRequest): Promise<SolicitudEntrante | null> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      try {
        const b = await bookingPropio(session.token, input.solicitudEntranteId, professionalId);
        if (b.status !== 'pending') return null;
        const s = await mapearSolicitud(session.token, b, professionalId);
        recordar(s);
        return s;
      } catch (e) {
        if (e instanceof ServiceError && e.code === 'SOLICITUD_ENTRANTE_NO_ENCONTRADA') return null;
        throw e;
      }
    },

    suscribirseASolicitudesEntrantes(input, callback): () => void {
      ensureProOnline();
      return onBookingNew((bookingId) => {
        void (async () => {
          try {
            const session = await loadBackendSession();
            if (!session) return;
            const professionalId = await resolveProfessionalId(input.profesionalId);
            const b = await bookingPropio(session.token, bookingId, professionalId);
            if (b.status !== 'pending') return;
            const s = await mapearSolicitud(session.token, b, professionalId);
            recordar(s);
            callback({ tipo: 'NUEVA', solicitud: s });
          } catch {
            /* reserva ajena o sin acceso: se ignora */
          }
        })();
      });
    },

    async aceptarSolicitud(input: AceptarSolicitudEntranteRequest): Promise<RespuestaAccionSolicitudEntrante> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const b = await bookingPropio(session.token, input.solicitudEntranteId, professionalId);
      if (b.status !== 'pending') {
        olvidar(String(professionalId));
        return { resultado: b.status === 'accepted' ? 'ACEPTADA' : 'YA_ASIGNADA', solicitud: null };
      }
      await bffApi('POST', `/api/bookings/${b.id}/accept`, session.token, {});
      joinBookingRoom(String(b.id), professionalId);
      emitBookingStatus(String(b.id), 'accepted');
      const actualizada = await bookingPropio(session.token, String(b.id), professionalId);
      const s = await mapearSolicitud(session.token, actualizada, professionalId);
      s.estado = 'ESPERANDO_CLIENTE';
      recordar(s);
      return { resultado: 'ACEPTADA', solicitud: s };
    },

    async rechazarSolicitud(input: RechazarSolicitudEntranteRequest): Promise<RespuestaAccionSolicitudEntrante> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const b = await bookingPropio(session.token, input.solicitudEntranteId, professionalId);
      if (b.status !== 'pending') {
        olvidar(String(professionalId));
        return { resultado: 'YA_ASIGNADA', solicitud: null };
      }
      await bffApi('POST', `/api/bookings/${b.id}/reject`, session.token, {});
      emitBookingStatus(String(b.id), 'rejected');
      olvidar(String(professionalId));
      return { resultado: 'RECHAZADA', solicitud: null };
    },

    async procesarExpiracion(input: ProcesarExpiracionSolicitudRequest): Promise<RespuestaAccionSolicitudEntrante> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      try {
        const b = await bookingPropio(session.token, input.solicitudEntranteId, professionalId);
        if (b.status !== 'pending') {
          olvidar(String(professionalId));
          return { resultado: 'YA_ASIGNADA', solicitud: null };
        }
        if (Date.now() < expiraEnDesdeCreada(b.created_at)) {
          const s = await mapearSolicitud(session.token, b, professionalId);
          return { resultado: 'ACEPTADA', solicitud: s };
        }
        olvidar(String(professionalId));
        return { resultado: 'EXPIRADA', solicitud: null };
      } catch (e) {
        if (e instanceof ServiceError && e.code === 'SOLICITUD_ENTRANTE_NO_ENCONTRADA') {
          return { resultado: 'YA_ASIGNADA', solicitud: null };
        }
        throw e;
      }
    },

    async simularSolicitudEntrante(input: SimularSolicitudEntranteRequest): Promise<SolicitudEntrante> {
      const s = await this.obtenerSolicitudActiva({ profesionalId: input.profesionalId });
      if (!s) throw new ServiceError('SOLICITUD_ENTRANTE_NO_ENCONTRADA');
      return s;
    },

    async simularClienteAcepta(_input: SimularClienteSolicitudRequest): Promise<void> {
      throw new ServiceError('OPERACION_NO_PERMITIDA', 'Sin actor cliente en modo backend.');
    },

    async simularClienteRechaza(_input: SimularClienteSolicitudRequest): Promise<void> {
      throw new ServiceError('OPERACION_NO_PERMITIDA', 'Sin actor cliente en modo backend.');
    },

    async simularExpiracionSolicitud(_input: SimularClienteSolicitudRequest): Promise<void> {
      throw new ServiceError('OPERACION_NO_PERMITIDA', 'Sin reloj de demo en modo backend.');
    },

    async alCerrarSesion(_input: AlCerrarSesionIncomingRequest): Promise<void> {
      disconnectRealtime();
    },
  };
}
