// src/services/backend/backendProfessionalServiceInProgressService.ts
// Servicio en curso real sobre bookings: accepted→EN_CAMINO, llegada (evento)
// →LLEGUE, in_progress→INICIADO, completed→FINALIZADO, cancelled→CANCELADA.
// PIN determinista (misma fórmula que mobile-web); intentos/bloqueo en
// memoria local (Directus no guarda PIN: ver docs/adaptacion-backend.md).

import {
  ProfessionalServiceInProgressService,
} from '../professionalServiceInProgressService';
import {
  CancelarServicioPorProfesionalRequest,
  ExpirarBloqueoPinDemoRequest,
  FinalizarServicioEnCursoRequest,
  MarcarLlegadaRequest,
  MotivoCancelacionProfesional,
  ObtenerPinDemoRequest,
  ObtenerServicioActivoRequest,
  RespuestaPinDemo,
  RespuestaServicioActivo,
  RespuestaServicioEnCurso,
  RespuestaValidarPin,
  ServicioEnCurso,
  ValidarPinServicioRequest,
  esEtapaServicioActiva,
} from '../../types/professionalServiceInProgress';
import { ServiceError } from '../errors';
import { bffApi } from '../../lib/backend/bff';
import { loadBackendSession, resolveProfessionalId } from '../../lib/backend/session';
import {
  DBooking,
  DBookingEvent,
  desglose,
  pinForBookingId,
  primerNombre,
} from '../../lib/backend/mapping';
import { emitBookingStatus, joinBookingRoom } from '../../lib/backend/realtime';

type EventStatus =
  | 'llegada'
  | 'iniciado'
  | 'finalizado'
  | 'cancelado_por_profesional'
  | 'nota';

const MAX_INTENTOS_PIN = 3;
const BLOQUEO_PIN_MS = 5 * 60_000;

type PinState = { fallidos: number; bloqueadoHasta: number | null };
const pinState = new Map<number, PinState>();

function estadoPin(bookingId: number): PinState {
  let s = pinState.get(bookingId);
  if (!s) {
    s = { fallidos: 0, bloqueadoHasta: null };
    pinState.set(bookingId, s);
  }
  if (s.bloqueadoHasta !== null && Date.now() >= s.bloqueadoHasta) {
    s.fallidos = 0;
    s.bloqueadoHasta = null;
  }
  return s;
}

async function logEvento(
  token: string,
  bookingId: number,
  status: EventStatus,
  note?: string,
): Promise<void> {
  await bffApi('POST', `/api/bookings/${bookingId}/events`, token, {
    status,
    ...(note ? { note } : {}),
  }).catch(() => undefined);
}

async function eventosDe(token: string, bookingId: number): Promise<DBookingEvent[]> {
  return bffApi<DBookingEvent[]>('GET', `/api/bookings/${bookingId}/events`, token).catch(() => []);
}

async function momentoEvento(token: string, bookingId: number, status: string): Promise<number | null> {
  const events = await eventosDe(token, bookingId);
  const e = events
    .filter((ev) => ev.status === status)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
  if (!e) return null;
  const m = /:(\d+)$/.exec(e.note ?? '');
  if (m) return Number(m[1]);
  return e.created_at ? Date.parse(e.created_at) : null;
}
async function llegadaEn(token: string, bookingId: number): Promise<number | null> {
  return momentoEvento(token, bookingId, 'llegada');
}

async function motivoDeEventos(token: string, bookingId: number): Promise<MotivoCancelacionProfesional | null> {
  const events = await eventosDe(token, bookingId);
  const validos: MotivoCancelacionProfesional[] = [
    'CLIENTE_AUSENTE',
    'DIRECCION_INCORRECTA',
    'CLIENTE_CANCELO_EN_PERSONA',
    'NO_PUEDO_CONTINUAR',
  ];
  for (const e of [...events].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))) {
    const m = /^motivo:([A-Z_]+)/.exec(e.note ?? '');
    if (m && (validos as string[]).includes(m[1])) return m[1] as MotivoCancelacionProfesional;
  }
  return null;
}

async function mapearEnCurso(
  token: string,
  b: DBooking,
  professionalId: number,
): Promise<ServicioEnCurso> {
  const svc = typeof b.service === 'object' && b.service !== null ? b.service : null;
  let etapa: ServicioEnCurso['etapa'];
  if (b.status === 'accepted') {
    etapa = (await llegadaEn(token, b.id)) !== null ? 'LLEGUE' : 'EN_CAMINO';
  } else if (b.status === 'in_progress') {
    etapa = 'INICIADO';
  } else if (b.status === 'completed') {
    etapa = 'FINALIZADO';
  } else {
    etapa = 'CANCELADA_POR_PROFESIONAL';
  }
  let cliente = 'Cliente';
  try {
    cliente = primerNombre(b.clientFirstName);
  } catch {
    /* noop */
  }
  const d = desglose(svc?.price_base ?? b.price_snapshot, b.price_snapshot);
  const pin = estadoPin(b.id);
  const llegada = etapa === 'EN_CAMINO' ? null : await llegadaEn(token, b.id);
  const iniciadoEn =
    etapa === 'INICIADO' || etapa === 'FINALIZADO'
      ? await momentoEvento(token, b.id, 'iniciado')
      : null;
  const finalizadoEn =
    etapa === 'FINALIZADO'
      ? b.completed_at
        ? Date.parse(b.completed_at)
        : await momentoEvento(token, b.id, 'finalizado')
      : null;
  const canceladoEn =
    etapa === 'CANCELADA_POR_PROFESIONAL'
      ? await momentoEvento(token, b.id, 'cancelado_por_profesional')
      : null;
  return {
    id: String(b.id),
    profesionalId: String(professionalId),
    etapa,
    servicioId: svc ? String(svc.id) : String(b.service),
    servicioNombre: svc?.name ?? 'Servicio',
    duracionMin: svc?.duration_min ?? 60,
    clientePrimerNombre: cliente,
    direccionExacta: b.address_text ?? '',
    desglose: {
      precioBaseCop: d.precioBaseCop,
      precioDomicilioCop: d.precioDomicilioCop,
      precioTotalCop: d.precioTotalCop,
    },
    llegadaEn: llegada,
    iniciadoEn,
    finalizadoEn,
    canceladoEn,
    intentosFallidosPin: pin.fallidos,
    bloqueadoHasta: pin.bloqueadoHasta,
    motivoCancelacion:
      etapa === 'CANCELADA_POR_PROFESIONAL' ? await motivoDeEventos(token, b.id) : null,
  };
}

async function bookingDelFlujo(
  token: string,
  servicioId: string,
  professionalId: number,
): Promise<DBooking> {
  const id = Number(servicioId);
  if (!Number.isInteger(id) || id <= 0) throw new ServiceError('VALIDATION');
  const b = await bffApi<DBooking>(
    'GET',
    `/api/bookings/${id}`,
    token,
    undefined,
    'SERVICIO_EN_CURSO_NO_ENCONTRADO',
  );
  if (b.professional !== null && Number(b.professional) !== professionalId) {
    throw new ServiceError('SERVICIO_EN_CURSO_NO_ENCONTRADO');
  }
  return b;
}

export function createBackendProfessionalServiceInProgressService(): ProfessionalServiceInProgressService {
  return {
    async obtenerServicioActivo(input: ObtenerServicioActivoRequest): Promise<RespuestaServicioActivo> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const rows = await bffApi<DBooking[]>(
        'GET',
        '/api/bookings/pro/mine?status=accepted,in_progress',
        session.token,
      );
      const b = rows[0];
      if (!b) return { servicio: null, ahoraServidor: Date.now() };
      const servicio = await mapearEnCurso(session.token, b, professionalId);
      if (!esEtapaServicioActiva(servicio.etapa)) return { servicio: null, ahoraServidor: Date.now() };
      return { servicio, ahoraServidor: Date.now() };
    },

    async marcarLlegada(input: MarcarLlegadaRequest): Promise<RespuestaServicioEnCurso> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const b = await bookingDelFlujo(session.token, input.servicioId, professionalId);
      const actual = await mapearEnCurso(session.token, b, professionalId);
      if (actual.etapa !== 'EN_CAMINO') {
        if (actual.etapa === 'LLEGUE' || actual.etapa === 'INICIADO') {
          return { servicio: actual, ahoraServidor: Date.now() };
        }
        throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      }
      const ahora = Date.now();
      await logEvento(session.token, b.id, 'llegada', `llegada:${ahora}`);
      emitBookingStatus(String(b.id), 'llegada');
      const servicio = await mapearEnCurso(session.token, b, professionalId);
      return { servicio, ahoraServidor: ahora };
    },

    async validarPin(input: ValidarPinServicioRequest): Promise<RespuestaValidarPin> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      if (!/^\d{4}$/.test(input.pin)) throw new ServiceError('VALIDATION');
      const b = await bookingDelFlujo(session.token, input.servicioId, professionalId);
      const actual = await mapearEnCurso(session.token, b, professionalId);
      if (actual.etapa === 'INICIADO') {
        return {
          resultado: 'VALIDO',
          intentosRestantes: MAX_INTENTOS_PIN,
          bloqueadoHasta: null,
          servicio: actual,
          ahoraServidor: Date.now(),
        };
      }
      if (actual.etapa !== 'LLEGUE') throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      const pin = estadoPin(b.id);
      if (pin.bloqueadoHasta !== null && Date.now() < pin.bloqueadoHasta) {
        return {
          resultado: 'BLOQUEADO',
          intentosRestantes: 0,
          bloqueadoHasta: pin.bloqueadoHasta,
          servicio: actual,
          ahoraServidor: Date.now(),
        };
      }
      if (input.pin !== pinForBookingId(b.id)) {
        pin.fallidos += 1;
        if (pin.fallidos >= MAX_INTENTOS_PIN) {
          pin.bloqueadoHasta = Date.now() + BLOQUEO_PIN_MS;
          return {
            resultado: 'BLOQUEADO',
            intentosRestantes: 0,
            bloqueadoHasta: pin.bloqueadoHasta,
            servicio: { ...actual, intentosFallidosPin: pin.fallidos, bloqueadoHasta: pin.bloqueadoHasta },
            ahoraServidor: Date.now(),
          };
        }
        return {
          resultado: 'INVALIDO',
          intentosRestantes: MAX_INTENTOS_PIN - pin.fallidos,
          bloqueadoHasta: null,
          servicio: { ...actual, intentosFallidosPin: pin.fallidos },
          ahoraServidor: Date.now(),
        };
      }
      pin.fallidos = 0;
      pin.bloqueadoHasta = null;
      const ahora = Date.now();
      await bffApi('POST', `/api/bookings/${b.id}/start`, session.token, {});
      await logEvento(session.token, b.id, 'iniciado', `iniciado:${ahora}`);
      emitBookingStatus(String(b.id), 'in_progress');
      const recargado = await bookingDelFlujo(session.token, String(b.id), professionalId);
      const servicio = await mapearEnCurso(session.token, recargado, professionalId);
      return {
        resultado: 'VALIDO',
        intentosRestantes: MAX_INTENTOS_PIN,
        bloqueadoHasta: null,
        servicio,
        ahoraServidor: Date.now(),
      };
    },

    async cancelarPorProfesional(
      input: CancelarServicioPorProfesionalRequest,
    ): Promise<RespuestaServicioEnCurso> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const b = await bookingDelFlujo(session.token, input.servicioId, professionalId);
      const actual = await mapearEnCurso(session.token, b, professionalId);
      if (actual.etapa === 'CANCELADA_POR_PROFESIONAL') {
        return { servicio: actual, ahoraServidor: Date.now() };
      }
      if (actual.etapa !== 'EN_CAMINO' && actual.etapa !== 'LLEGUE') {
        throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      }
      await bffApi('POST', `/api/bookings/${b.id}/cancel`, session.token, {});
      await logEvento(session.token, b.id, 'cancelado_por_profesional', `motivo:${input.motivo}`);
      emitBookingStatus(String(b.id), 'cancelled');
      const recargado = await bookingDelFlujo(session.token, String(b.id), professionalId);
      const servicio = await mapearEnCurso(session.token, recargado, professionalId);
      return { servicio, ahoraServidor: Date.now() };
    },

    async finalizarServicio(input: FinalizarServicioEnCursoRequest): Promise<RespuestaServicioEnCurso> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const b = await bookingDelFlujo(session.token, input.servicioId, professionalId);
      const actual = await mapearEnCurso(session.token, b, professionalId);
      if (actual.etapa === 'FINALIZADO') {
        return { servicio: actual, ahoraServidor: Date.now() };
      }
      if (actual.etapa !== 'INICIADO') throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      await bffApi('POST', `/api/bookings/${b.id}/complete`, session.token, {});
      await logEvento(session.token, b.id, 'finalizado', `finalizado:${Date.now()}`);
      emitBookingStatus(String(b.id), 'completed');
      joinBookingRoom(String(b.id), professionalId);
      const recargado = await bookingDelFlujo(session.token, String(b.id), professionalId);
      const servicio = await mapearEnCurso(session.token, recargado, professionalId);
      return { servicio, ahoraServidor: Date.now() };
    },

    async obtenerPinDemo(input: ObtenerPinDemoRequest): Promise<RespuestaPinDemo> {
      const id = Number(input.servicioId);
      if (!Number.isInteger(id) || id <= 0) throw new ServiceError('VALIDATION');
      return { pin: pinForBookingId(id), ahoraServidor: Date.now() };
    },

    async expirarBloqueoPinDemo(input: ExpirarBloqueoPinDemoRequest): Promise<RespuestaServicioEnCurso> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const id = Number(input.servicioId);
      pinState.delete(Number.isInteger(id) ? id : -1);
      const b = await bookingDelFlujo(session.token, input.servicioId, professionalId);
      const servicio = await mapearEnCurso(session.token, b, professionalId);
      return { servicio, ahoraServidor: Date.now() };
    },
  };
}
