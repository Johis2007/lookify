// src/services/backend/backendProfessionalIncomingRequestService.ts
// Solicitudes reales del profesional (4B, modelo "claim"): las ofertas vivas
// son las que el servidor le difunde a este profesional, es decir
// GET /api/bookings/pro/available. Aceptar o rechazar es un POST sobre la
// reserva. La dirección exacta del cliente nunca se muestra: solo la zona
// (~500 m) y la distancia redondeada que envía el BFF.

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
import { bffApi } from '../../lib/backend/bff';
import { loadBackendSession, resolveProfessionalId } from '../../lib/backend/session';
import { DBooking } from '../../lib/backend/mapping';
import {
  disconnectRealtime,
  ensureProOnline,
  joinBookingRoom,
  onBookingNew,
  onBookingTaken,
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

/** Oferta viva que el BFF difunde a este profesional. */
type OfertaDisponible = {
  id: string;
  servicioId: string | null;
  servicioNombre: string;
  duracionMin: number;
  precio: number;
  distanciaM: number;
  zona: { lat: number; lng: number };
  clientePrimerNombre: string;
  expiraEn: string | null;
  creadaEn: string | null;
};

async function listarOfertas(token: string): Promise<OfertaDisponible[]> {
  const rows = await bffApi<OfertaDisponible[]>('GET', '/api/bookings/pro/available', token);
  return Array.isArray(rows) ? rows : [];
}

/** Estado de la reserva (null si este profesional ya no es participante). */
async function consultarReserva(bookingId: string, token: string): Promise<DBooking | null> {
  try {
    return await bffApi<DBooking>('GET', `/api/bookings/${encodeURIComponent(bookingId)}`, token);
  } catch {
    return null;
  }
}

function mapearOferta(dto: OfertaDisponible, profesionalId: number): SolicitudEntrante {
  const precio = Number(dto.precio ?? 0);
  return {
    id: String(dto.id),
    profesionalId: String(profesionalId),
    servicioId: dto.servicioId ?? '',
    servicioNombre: dto.servicioNombre ?? 'Servicio',
    duracionMin: Number(dto.duracionMin ?? 60),
    distanciaKmAprox: Math.round((Number(dto.distanciaM ?? 0) / 1000) * 10) / 10,
    // El precio del servidor es la base del servicio; el domicilio se
    // calcula al final (no lo decide el servidor en esta fase).
    desglose: {
      precioBaseCop: precio,
      precioDomicilioCop: 0,
      precioTotalCop: precio,
    },
    clientePrimerNombre: dto.clientePrimerNombre ?? 'Cliente',
    clienteCalificacionPromedio: null,
    clienteTotalResenas: 0,
    expiraEn: dto.expiraEn ? Date.parse(dto.expiraEn) : Date.now() + 60_000,
    estado: 'PENDIENTE_PRO',
  };
}

// Reserva ya asignada a este profesional (tras aceptar).
function mapearAceptada(b: DBooking, profesionalId: number): SolicitudEntrante {
  const svc = typeof b.service === 'object' && b.service !== null ? b.service : null;
  const precio = Number(b.price_snapshot ?? svc?.price_base ?? 0);
  return {
    id: String(b.id),
    profesionalId: String(profesionalId),
    servicioId: svc ? String(svc.id) : String(b.service),
    servicioNombre: svc?.name ?? 'Servicio',
    duracionMin: svc?.duration_min ?? 60,
    distanciaKmAprox: 0,
    desglose: {
      precioBaseCop: precio,
      precioDomicilioCop: 0,
      precioTotalCop: precio,
    },
    clientePrimerNombre: b.clientFirstName ?? 'Cliente',
    clienteCalificacionPromedio: null,
    clienteTotalResenas: 0,
    expiraEn: Date.now() + 60_000,
    estado: 'LISTA_PARA_SERVICIO',
  };
}

export function createBackendProfessionalIncomingRequestService(): ProfessionalIncomingRequestService {
  return {
    async obtenerSolicitudActiva(input: ObtenerSolicitudActivaRequest): Promise<SolicitudEntrante | null> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const ofertas = await listarOfertas(session.token);
      const dto = ofertas[0];
      if (!dto) {
        olvidar(String(professionalId));
        return null;
      }
      const s = mapearOferta(dto, professionalId);
      recordar(s);
      return s;
    },

    async obtenerSolicitud(input: ObtenerSolicitudEntranteRequest): Promise<SolicitudEntrante | null> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const ofertas = await listarOfertas(session.token);
      const dto = ofertas.find((o) => String(o.id) === String(input.solicitudEntranteId));
      if (!dto) {
        // Ya no está disponible: otro profesional la tomó o expiró.
        olvidar(String(professionalId));
        return null;
      }
      const s = mapearOferta(dto, professionalId);
      recordar(s);
      return s;
    },

    suscribirseASolicitudesEntrantes(input, callback): () => void {
      ensureProOnline();
      const unsubNueva = onBookingNew((bookingId) => {
        void (async () => {
          try {
            const session = await loadBackendSession();
            if (!session) return;
            const professionalId = await resolveProfessionalId(input.profesionalId);
            const ofertas = await listarOfertas(session.token);
            const dto = ofertas.find((o) => String(o.id) === String(bookingId));
            if (!dto) return;
            const s = mapearOferta(dto, professionalId);
            recordar(s);
            callback({ tipo: 'NUEVA', solicitud: s });
          } catch {
            /* oferta ajena o sin acceso: se ignora */
          }
        })();
      });
      // Otro profesional tomó la reserva: la oferta se retira de inmediato.
      const unsubTomada = onBookingTaken((bookingId) => {
        const cache = cacheActiva.get(String(input.profesionalId));
        if (!cache || String(cache.id) !== String(bookingId)) return;
        const cerrada: SolicitudEntrante = { ...cache, estado: 'CERRADA_YA_ASIGNADA' };
        recordar(cerrada);
        callback({ tipo: 'ACTUALIZADA', solicitud: cerrada });
      });
      return () => {
        unsubNueva();
        unsubTomada();
      };
    },

    async aceptarSolicitud(input: AceptarSolicitudEntranteRequest): Promise<RespuestaAccionSolicitudEntrante> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const ofertaId = String(input.solicitudEntranteId);
      const ofertas = await listarOfertas(session.token);
      const dto = ofertas.find((o) => String(o.id) === ofertaId);
      if (!dto) {
        olvidar(String(professionalId));
        return { resultado: 'YA_ASIGNADA', solicitud: null };
      }
      await bffApi('POST', `/api/bookings/${encodeURIComponent(ofertaId)}/accept`, session.token, {});
      joinBookingRoom(ofertaId, professionalId);
      const aceptada = await bffApi<DBooking>(
        'GET',
        `/api/bookings/${encodeURIComponent(ofertaId)}`,
        session.token,
        undefined,
        'SOLICITUD_ENTRANTE_NO_ENCONTRADA',
      );
      const s = mapearAceptada(aceptada, professionalId);
      recordar(s);
      return { resultado: 'ACEPTADA', solicitud: s };
    },

    async rechazarSolicitud(input: RechazarSolicitudEntranteRequest): Promise<RespuestaAccionSolicitudEntrante> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const ofertaId = String(input.solicitudEntranteId);
      const ofertas = await listarOfertas(session.token);
      const dto = ofertas.find((o) => String(o.id) === ofertaId);
      if (!dto) {
        olvidar(String(professionalId));
        return { resultado: 'YA_ASIGNADA', solicitud: null };
      }
      await bffApi('POST', `/api/bookings/${encodeURIComponent(ofertaId)}/reject`, session.token, {});
      olvidar(String(professionalId));
      return { resultado: 'RECHAZADA', solicitud: null };
    },

    async procesarExpiracion(input: ProcesarExpiracionSolicitudRequest): Promise<RespuestaAccionSolicitudEntrante> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const profesionalId = await resolveProfessionalId(input.profesionalId);
      const ofertaId = String(input.solicitudEntranteId);
      const ofertas = await listarOfertas(session.token);
      const dto = ofertas.find((o) => String(o.id) === ofertaId);
      if (dto) {
        // El servidor todavía ofrece la reserva: no expiró (la cuenta atrás
        // local pudo adelantarse por reloj). Se mantiene pendiente.
        const s = mapearOferta(dto, profesionalId);
        recordar(s);
        return { resultado: 'PENDIENTE', solicitud: s };
      }
      olvidar(String(profesionalId));
      // Ya no está en la lista: expiró o la tomó otro profesional.
      const b = await consultarReserva(ofertaId, session.token);
      if (b && b.status === 'accepted') {
        const s = mapearAceptada(b, profesionalId);
        recordar(s);
        return { resultado: 'ACEPTADA', solicitud: s };
      }
      return { resultado: 'EXPIRADA', solicitud: null };
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
