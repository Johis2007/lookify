import {
  MOTIVOS_CANCELACION_PROFESIONAL,
  PIN_BLOQUEO_MS,
  PIN_MAX_INTENTOS_FALLIDOS,
  PIN_SERVICIO_LENGTH,
} from '../../constants/professionalServiceInProgress';
import {
  CancelarServicioPorProfesionalRequest,
  esEtapaServicioActiva,
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
} from '../../types/professionalServiceInProgress';
import { ServiceError } from '../errors';
import { ProfessionalServiceInProgressService } from '../professionalServiceInProgressService';
import { isProfesionalActivado } from './mockProfessionalRegistryStore';
import { registrarDesdeServicioEnCursoInterno } from './mockProfessionalEarningsHistoryStore';
import {
  guardarServicioEnCurso,
  leerRegistroServicioEnCurso,
} from './mockProfessionalServiceInProgressStore';

const MOCK_LATENCY_MS = 280;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ahoraServidor(): number {
  return Date.now();
}

function assertHabilitado(profesionalId: string): void {
  if (!profesionalId || !isProfesionalActivado(profesionalId)) {
    throw new ServiceError('PROFESIONAL_NO_HABILITADO');
  }
}

function esMotivoValido(motivo: string): motivo is MotivoCancelacionProfesional {
  return MOTIVOS_CANCELACION_PROFESIONAL.some((item) => item.codigo === motivo);
}

function intentosRestantes(servicio: ServicioEnCurso): number {
  return Math.max(0, PIN_MAX_INTENTOS_FALLIDOS - servicio.intentosFallidosPin);
}

function exigirRegistro(profesionalId: string, servicioId: string, now: number) {
  if (!profesionalId || !servicioId) {
    throw new ServiceError('VALIDATION');
  }
  assertHabilitado(profesionalId);
  const reg = leerRegistroServicioEnCurso(profesionalId, now);
  if (!reg || reg.servicio.id !== servicioId) {
    throw new ServiceError('SERVICIO_EN_CURSO_NO_ENCONTRADO');
  }
  return reg;
}

function persistir(profesionalId: string, servicio: ServicioEnCurso): ServicioEnCurso {
  const guardado = guardarServicioEnCurso(profesionalId, servicio);
  if (!guardado) {
    throw new ServiceError('SERVICIO_EN_CURSO_NO_ENCONTRADO');
  }
  return guardado.servicio;
}

export function createMockProfessionalServiceInProgressService(): ProfessionalServiceInProgressService {
  return {
    async obtenerServicioActivo(
      input: ObtenerServicioActivoRequest
    ): Promise<RespuestaServicioActivo> {
      await delay(MOCK_LATENCY_MS);
      if (!input.profesionalId) {
        throw new ServiceError('VALIDATION');
      }
      assertHabilitado(input.profesionalId);
      const now = ahoraServidor();
      const reg = leerRegistroServicioEnCurso(input.profesionalId, now);
      const servicio =
        reg && esEtapaServicioActiva(reg.servicio.etapa) ? reg.servicio : null;
      return { servicio, ahoraServidor: now };
    },

    async marcarLlegada(input: MarcarLlegadaRequest): Promise<RespuestaServicioEnCurso> {
      await delay(MOCK_LATENCY_MS);
      const now = ahoraServidor();
      const reg = exigirRegistro(input.profesionalId, input.servicioId, now);
      const actual = reg.servicio;
      if (actual.etapa === 'LLEGUE' || actual.etapa === 'INICIADO') {
        return { servicio: actual, ahoraServidor: now };
      }
      if (actual.etapa !== 'EN_CAMINO') {
        throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      }
      const servicio = persistir(input.profesionalId, {
        ...actual,
        etapa: 'LLEGUE',
        llegadaEn: now,
      });
      return { servicio, ahoraServidor: now };
    },

    async validarPin(input: ValidarPinServicioRequest): Promise<RespuestaValidarPin> {
      await delay(MOCK_LATENCY_MS);
      const now = ahoraServidor();
      const reg = exigirRegistro(input.profesionalId, input.servicioId, now);
      if (!new RegExp(`^\\d{${PIN_SERVICIO_LENGTH}}$`).test(input.pin)) {
        throw new ServiceError('VALIDATION');
      }
      const actual = reg.servicio;
      if (actual.etapa === 'INICIADO') {
        return {
          resultado: 'VALIDO',
          intentosRestantes: intentosRestantes(actual),
          bloqueadoHasta: actual.bloqueadoHasta,
          servicio: actual,
          ahoraServidor: now,
        };
      }
      if (actual.etapa !== 'LLEGUE') {
        throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      }
      if (actual.bloqueadoHasta != null && now < actual.bloqueadoHasta) {
        return {
          resultado: 'BLOQUEADO',
          intentosRestantes: 0,
          bloqueadoHasta: actual.bloqueadoHasta,
          servicio: actual,
          ahoraServidor: now,
        };
      }

      if (input.pin === reg.pin) {
        const servicio = persistir(input.profesionalId, {
          ...actual,
          etapa: 'INICIADO',
          iniciadoEn: actual.iniciadoEn ?? now,
          bloqueadoHasta: null,
        });
        return {
          resultado: 'VALIDO',
          intentosRestantes: intentosRestantes(servicio),
          bloqueadoHasta: null,
          servicio,
          ahoraServidor: now,
        };
      }

      const fallidos = actual.intentosFallidosPin + 1;
      if (fallidos >= PIN_MAX_INTENTOS_FALLIDOS) {
        const bloqueadoHasta = now + PIN_BLOQUEO_MS;
        const servicio = persistir(input.profesionalId, {
          ...actual,
          intentosFallidosPin: PIN_MAX_INTENTOS_FALLIDOS,
          bloqueadoHasta,
        });
        return {
          resultado: 'BLOQUEADO',
          intentosRestantes: 0,
          bloqueadoHasta,
          servicio,
          ahoraServidor: now,
        };
      }

      const servicio = persistir(input.profesionalId, {
        ...actual,
        intentosFallidosPin: fallidos,
      });
      return {
        resultado: 'INVALIDO',
        intentosRestantes: intentosRestantes(servicio),
        bloqueadoHasta: null,
        servicio,
        ahoraServidor: now,
      };
    },

    async cancelarPorProfesional(
      input: CancelarServicioPorProfesionalRequest
    ): Promise<RespuestaServicioEnCurso> {
      await delay(MOCK_LATENCY_MS);
      const now = ahoraServidor();
      const reg = exigirRegistro(input.profesionalId, input.servicioId, now);
      if (!esMotivoValido(input.motivo)) {
        throw new ServiceError('VALIDATION');
      }
      const actual = reg.servicio;
      if (actual.etapa === 'CANCELADA_POR_PROFESIONAL') {
        registrarDesdeServicioEnCursoInterno(input.profesionalId, actual);
        return { servicio: actual, ahoraServidor: now };
      }
      if (actual.etapa !== 'EN_CAMINO' && actual.etapa !== 'LLEGUE') {
        throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      }
      const servicio = persistir(input.profesionalId, {
        ...actual,
        etapa: 'CANCELADA_POR_PROFESIONAL',
        motivoCancelacion: input.motivo,
        canceladoEn: now,
      });
      registrarDesdeServicioEnCursoInterno(input.profesionalId, servicio);
      return { servicio, ahoraServidor: now };
    },

    async finalizarServicio(
      input: FinalizarServicioEnCursoRequest
    ): Promise<RespuestaServicioEnCurso> {
      await delay(MOCK_LATENCY_MS);
      const now = ahoraServidor();
      const reg = exigirRegistro(input.profesionalId, input.servicioId, now);
      const actual = reg.servicio;
      if (actual.etapa === 'FINALIZADO') {
        registrarDesdeServicioEnCursoInterno(input.profesionalId, actual);
        return { servicio: actual, ahoraServidor: now };
      }
      if (actual.etapa !== 'INICIADO') {
        throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      }
      const servicio = persistir(input.profesionalId, {
        ...actual,
        etapa: 'FINALIZADO',
        finalizadoEn: now,
      });
      registrarDesdeServicioEnCursoInterno(input.profesionalId, servicio);
      return { servicio, ahoraServidor: now };
    },

    async obtenerPinDemo(input: ObtenerPinDemoRequest): Promise<RespuestaPinDemo> {
      await delay(MOCK_LATENCY_MS);
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      const now = ahoraServidor();
      const reg = exigirRegistro(input.profesionalId, input.servicioId, now);
      if (!esEtapaServicioActiva(reg.servicio.etapa)) {
        throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      }
      return { pin: reg.pin, ahoraServidor: now };
    },

    async expirarBloqueoPinDemo(
      input: ExpirarBloqueoPinDemoRequest
    ): Promise<RespuestaServicioEnCurso> {
      await delay(MOCK_LATENCY_MS);
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      const now = ahoraServidor();
      const reg = exigirRegistro(input.profesionalId, input.servicioId, now);
      if (reg.servicio.etapa !== 'LLEGUE') {
        throw new ServiceError('ETAPA_NO_PERMITE_ACCION');
      }
      const servicio = persistir(input.profesionalId, {
        ...reg.servicio,
        bloqueadoHasta: null,
        intentosFallidosPin: 0,
      });
      return { servicio, ahoraServidor: now };
    },
  };
}
