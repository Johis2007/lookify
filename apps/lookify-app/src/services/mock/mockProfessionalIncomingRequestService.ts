import { SOLICITUD_ENTRANTE_VENTANA_MS } from '../../constants/professionalIncomingRequest';
import {
  AceptarSolicitudEntranteRequest,
  AlCerrarSesionIncomingRequest,
  ObtenerSolicitudActivaRequest,
  ObtenerSolicitudEntranteRequest,
  ProcesarExpiracionSolicitudRequest,
  RechazarSolicitudEntranteRequest,
  RespuestaAccionSolicitudEntrante,
  ResultadoRespuestaPro,
  SimularClienteSolicitudRequest,
  SimularSolicitudEntranteRequest,
  SolicitudEntrante,
  SolicitudEntranteEvento,
  SuscribirseSolicitudesEntrantesRequest,
} from '../../types/professionalIncomingRequest';
import { calcularDomicilio } from '../../utils/pricing';
import { primerNombre } from '../../utils/primerNombre';
import { ServiceError } from '../errors';
import { ProfessionalIncomingRequestService } from '../professionalIncomingRequestService';
import { getCatalogService } from '../catalogService';
import {
  getEstadoSolicitudForSolicitud,
  getServiciosForSolicitud,
  isProfesionalActivado,
  solicitudExiste,
} from './mockProfessionalRegistryStore';
import { getDisponibilidad, setDisponibilidad } from './mockProfessionalDashboardStore';
import { crearServicioEnCursoDesdeAceptacion } from './mockProfessionalServiceInProgressStore';
import {
  clearActiveSolicitud,
  clearExpiryTimer,
  emit,
  getActiveSolicitud,
  hasActiveSolicitudVigente,
  nextDemoClienteConResenas,
  scheduleExpiryTimer,
  setActiveSolicitud,
  subscribe,
} from './mockProfessionalIncomingRequestStore';

const MOCK_LATENCY_MS = 280;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertHabilitado(profesionalId: string, solicitudId: string): void {
  const estado = getEstadoSolicitudForSolicitud(solicitudId);
  if (estado !== 'APROBADO' || !isProfesionalActivado(profesionalId)) {
    throw new ServiceError('PROFESIONAL_NO_HABILITADO');
  }
}

function assertDisponible(profesionalId: string): void {
  if (getDisponibilidad(profesionalId) !== 'DISPONIBLE') {
    throw new ServiceError('PROFESIONAL_NO_DISPONIBLE');
  }
}

function getSolicitudOrThrow(profesionalId: string, solicitudEntranteId: string): SolicitudEntrante {
  const s = getActiveSolicitud(profesionalId);
  if (!s || s.id !== solicitudEntranteId) {
    throw new ServiceError('SOLICITUD_ENTRANTE_NO_ENCONTRADA');
  }
  return s;
}

function publicar(profesionalId: string, tipo: SolicitudEntranteEvento['tipo'], solicitud: SolicitudEntrante): void {
  setActiveSolicitud(solicitud);
  emit(profesionalId, { tipo, solicitud: { ...solicitud } });
}

function resultadoDesdeEstado(estado: SolicitudEntrante['estado']): ResultadoRespuestaPro | null {
  switch (estado) {
    case 'ESPERANDO_CLIENTE':
      return 'ACEPTADA';
    case 'CERRADA_RECHAZADA_PRO':
      return 'RECHAZADA';
    case 'CERRADA_EXPIRADA':
      return 'EXPIRADA';
    case 'CERRADA_YA_ASIGNADA':
      return 'YA_ASIGNADA';
    default:
      return null;
  }
}

function procesarExpiracionInterno(profesionalId: string, solicitudEntranteId: string): RespuestaAccionSolicitudEntrante {
  const s = getActiveSolicitud(profesionalId);
  if (!s || s.id !== solicitudEntranteId) {
    return { resultado: 'EXPIRADA', solicitud: null };
  }
  const prev = resultadoDesdeEstado(s.estado);
  if (prev) {
    return { resultado: prev, solicitud: { ...s } };
  }
  if (s.estado !== 'PENDIENTE_PRO') {
    throw new ServiceError('SOLICITUD_NO_VIGENTE');
  }
  if (Date.now() < s.expiraEn) {
    throw new ServiceError('SOLICITUD_NO_VIGENTE');
  }
  clearExpiryTimer(s.id);
  const actualizada: SolicitudEntrante = { ...s, estado: 'CERRADA_EXPIRADA' };
  publicar(profesionalId, 'ACTUALIZADA', actualizada);
  clearActiveSolicitud(profesionalId);
  return { resultado: 'EXPIRADA', solicitud: actualizada };
}

function armarTimerExpiracion(s: SolicitudEntrante): void {
  if (s.estado !== 'PENDIENTE_PRO') {
    return;
  }
  scheduleExpiryTimer(s.id, s.expiraEn, () => {
    procesarExpiracionInterno(s.profesionalId, s.id);
  });
}

async function crearSolicitudDemo(
  profesionalId: string,
  solicitudId: string
): Promise<SolicitudEntrante> {
  const servicioIds = getServiciosForSolicitud(solicitudId) ?? [];
  const catalogo = await getCatalogService().listarServiciosPorCategoria();
  const firstId = servicioIds[0];
  let servicio: { id: string; nombre: string; duracionMin: number; precio: number } | null = null;
  for (const cat of catalogo) {
    const found = cat.servicios.find((x) => x.id === firstId);
    if (found) {
      servicio = found;
      break;
    }
  }
  if (!servicio) {
    throw new ServiceError('VALIDATION');
  }
  const distanciaKmAprox = 2.3;
  const precioDomicilioCop = calcularDomicilio(distanciaKmAprox);
  const precioBaseCop = servicio.precio;
  const cliente = nextDemoClienteConResenas();
  const expiraEn = Date.now() + SOLICITUD_ENTRANTE_VENTANA_MS;
  const id = `se-${Date.now()}-${profesionalId.slice(-4)}`;
  return {
    id,
    profesionalId,
    servicioId: servicio.id,
    servicioNombre: servicio.nombre,
    duracionMin: servicio.duracionMin,
    distanciaKmAprox,
    desglose: {
      precioBaseCop,
      precioDomicilioCop,
      precioTotalCop: precioBaseCop + precioDomicilioCop,
    },
    clientePrimerNombre: primerNombre('María Fernández'),
    clienteCalificacionPromedio: cliente.calificacion,
    clienteTotalResenas: cliente.total,
    expiraEn,
    estado: 'PENDIENTE_PRO',
  };
}

export function createMockProfessionalIncomingRequestService(): ProfessionalIncomingRequestService {
  return {
    async obtenerSolicitudActiva(input: ObtenerSolicitudActivaRequest): Promise<SolicitudEntrante | null> {
      await delay(MOCK_LATENCY_MS);
      const s = getActiveSolicitud(input.profesionalId);
      if (!s) {
        return null;
      }
      if (s.estado === 'PENDIENTE_PRO' && Date.now() >= s.expiraEn) {
        const res = procesarExpiracionInterno(input.profesionalId, s.id);
        return res.solicitud;
      }
      if (
        s.estado === 'CERRADA_EXPIRADA' ||
        s.estado === 'CERRADA_RECHAZADA_PRO' ||
        s.estado === 'CERRADA_RECHAZADA_CLIENTE'
      ) {
        return null;
      }
      return { ...s };
    },

    async obtenerSolicitud(input: ObtenerSolicitudEntranteRequest): Promise<SolicitudEntrante | null> {
      await delay(MOCK_LATENCY_MS);
      try {
        const s = getSolicitudOrThrow(input.profesionalId, input.solicitudEntranteId);
        if (s.estado === 'PENDIENTE_PRO' && Date.now() >= s.expiraEn) {
          const res = procesarExpiracionInterno(input.profesionalId, s.id);
          return res.solicitud;
        }
        return { ...s };
      } catch {
        return null;
      }
    },

    suscribirseASolicitudesEntrantes(
      input: SuscribirseSolicitudesEntrantesRequest,
      callback: (evento: SolicitudEntranteEvento) => void
    ): () => void {
      return subscribe(input.profesionalId, callback);
    },

    async aceptarSolicitud(input: AceptarSolicitudEntranteRequest): Promise<RespuestaAccionSolicitudEntrante> {
      await delay(MOCK_LATENCY_MS);
      const s = getActiveSolicitud(input.profesionalId);
      if (!s || s.id !== input.solicitudEntranteId) {
        throw new ServiceError('SOLICITUD_ENTRANTE_NO_ENCONTRADA');
      }
      const prev = resultadoDesdeEstado(s.estado);
      if (prev === 'ACEPTADA') {
        return { resultado: 'ACEPTADA', solicitud: { ...s } };
      }
      if (prev === 'RECHAZADA' || prev === 'EXPIRADA' || prev === 'YA_ASIGNADA') {
        return { resultado: prev, solicitud: { ...s } };
      }
      if (s.estado !== 'PENDIENTE_PRO') {
        throw new ServiceError('SOLICITUD_NO_VIGENTE');
      }
      assertDisponible(input.profesionalId);
      if (Date.now() >= s.expiraEn) {
        return procesarExpiracionInterno(input.profesionalId, s.id);
      }
      clearExpiryTimer(s.id);
      const actualizada: SolicitudEntrante = { ...s, estado: 'ESPERANDO_CLIENTE' };
      publicar(input.profesionalId, 'ACTUALIZADA', actualizada);
      return { resultado: 'ACEPTADA', solicitud: actualizada };
    },

    async rechazarSolicitud(input: RechazarSolicitudEntranteRequest): Promise<RespuestaAccionSolicitudEntrante> {
      await delay(MOCK_LATENCY_MS);
      const s = getActiveSolicitud(input.profesionalId);
      if (!s || s.id !== input.solicitudEntranteId) {
        throw new ServiceError('SOLICITUD_ENTRANTE_NO_ENCONTRADA');
      }
      const prev = resultadoDesdeEstado(s.estado);
      if (prev === 'RECHAZADA') {
        return { resultado: 'RECHAZADA', solicitud: { ...s } };
      }
      if (prev === 'EXPIRADA' || prev === 'YA_ASIGNADA') {
        return { resultado: prev, solicitud: { ...s } };
      }
      if (s.estado !== 'PENDIENTE_PRO' && s.estado !== 'ESPERANDO_CLIENTE') {
        throw new ServiceError('SOLICITUD_NO_VIGENTE');
      }
      clearExpiryTimer(s.id);
      const actualizada: SolicitudEntrante = {
        ...s,
        estado: 'CERRADA_RECHAZADA_PRO',
      };
      publicar(input.profesionalId, 'ACTUALIZADA', actualizada);
      clearActiveSolicitud(input.profesionalId);
      return { resultado: 'RECHAZADA', solicitud: actualizada };
    },

    async procesarExpiracion(
      input: ProcesarExpiracionSolicitudRequest
    ): Promise<RespuestaAccionSolicitudEntrante> {
      await delay(MOCK_LATENCY_MS);
      return procesarExpiracionInterno(input.profesionalId, input.solicitudEntranteId);
    },

    async simularSolicitudEntrante(input: SimularSolicitudEntranteRequest): Promise<SolicitudEntrante> {
      await delay(MOCK_LATENCY_MS);
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      if (!input.profesionalId || !input.solicitudId || !solicitudExiste(input.solicitudId)) {
        throw new ServiceError('VALIDATION');
      }
      assertHabilitado(input.profesionalId, input.solicitudId);
      assertDisponible(input.profesionalId);
      if (hasActiveSolicitudVigente(input.profesionalId)) {
        const existing = getActiveSolicitud(input.profesionalId)!;
        return { ...existing };
      }
      const solicitud = await crearSolicitudDemo(input.profesionalId, input.solicitudId);
      setActiveSolicitud(solicitud);
      armarTimerExpiracion(solicitud);
      emit(input.profesionalId, { tipo: 'NUEVA', solicitud: { ...solicitud } });
      return { ...solicitud };
    },

    async simularClienteAcepta(input: SimularClienteSolicitudRequest): Promise<void> {
      await delay(MOCK_LATENCY_MS);
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      const s = getSolicitudOrThrow(input.profesionalId, input.solicitudEntranteId);
      if (s.estado !== 'ESPERANDO_CLIENTE') {
        throw new ServiceError('SOLICITUD_NO_VIGENTE');
      }
      const actualizada: SolicitudEntrante = { ...s, estado: 'LISTA_PARA_SERVICIO' };
      crearServicioEnCursoDesdeAceptacion({
        solicitudEntranteId: s.id,
        profesionalId: s.profesionalId,
        servicioId: s.servicioId,
        servicioNombre: s.servicioNombre,
        duracionMin: s.duracionMin,
        clientePrimerNombre: s.clientePrimerNombre,
        desglose: s.desglose,
      });
      setDisponibilidad(input.profesionalId, 'OCUPADO');
      publicar(input.profesionalId, 'ACTUALIZADA', actualizada);
      clearActiveSolicitud(input.profesionalId);
    },

    async simularClienteRechaza(input: SimularClienteSolicitudRequest): Promise<void> {
      await delay(MOCK_LATENCY_MS);
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      const s = getSolicitudOrThrow(input.profesionalId, input.solicitudEntranteId);
      if (s.estado !== 'ESPERANDO_CLIENTE') {
        throw new ServiceError('SOLICITUD_NO_VIGENTE');
      }
      const actualizada: SolicitudEntrante = { ...s, estado: 'CERRADA_RECHAZADA_CLIENTE' };
      publicar(input.profesionalId, 'ACTUALIZADA', actualizada);
      clearActiveSolicitud(input.profesionalId);
    },

    async simularExpiracionSolicitud(input: SimularClienteSolicitudRequest): Promise<void> {
      await delay(MOCK_LATENCY_MS);
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      const s = getActiveSolicitud(input.profesionalId);
      if (!s || s.id !== input.solicitudEntranteId) {
        throw new ServiceError('SOLICITUD_ENTRANTE_NO_ENCONTRADA');
      }
      if (s.estado === 'ESPERANDO_CLIENTE') {
        const actualizada: SolicitudEntrante = { ...s, estado: 'CERRADA_RECHAZADA_CLIENTE' };
        publicar(input.profesionalId, 'ACTUALIZADA', actualizada);
        clearActiveSolicitud(input.profesionalId);
        return;
      }
      procesarExpiracionInterno(input.profesionalId, input.solicitudEntranteId);
    },

    async alCerrarSesion(input: AlCerrarSesionIncomingRequest): Promise<void> {
      await delay(50);
      clearActiveSolicitud(input.profesionalId);
    },
  };
}
