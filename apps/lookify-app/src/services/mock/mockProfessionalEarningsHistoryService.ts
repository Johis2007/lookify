import { HISTORIAL_PAGE_SIZE } from '../../constants/professionalEarningsHistory';
import {
  ListarHistorialRequest,
  ObtenerResumenPeriodoRequest,
  PeriodoHistorialIngresos,
  RespuestaListarHistorial,
  RespuestaResumenPeriodo,
  SembrarHistorialDemoRequest,
} from '../../types/professionalEarningsHistory';
import { ServiceError } from '../errors';
import { ProfessionalEarningsHistoryService } from '../professionalEarningsHistoryService';
import { isProfesionalActivado } from './mockProfessionalRegistryStore';
import {
  construirResumenPeriodo,
  historialStoreVacio,
  listarHistorialInterno,
  obtenerHistorialItems,
  sembrarHistorialDemoInterno,
} from './mockProfessionalEarningsHistoryStore';

const MOCK_LATENCY_MS = 320;

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

function parsePeriodo(periodo: string): PeriodoHistorialIngresos {
  if (periodo === 'HOY' || periodo === 'SEMANA' || periodo === 'MES') {
    return periodo;
  }
  throw new ServiceError('PERIODO_INVALIDO');
}

export function createMockProfessionalEarningsHistoryService(): ProfessionalEarningsHistoryService {
  return {
    async obtenerResumenPeriodo(
      input: ObtenerResumenPeriodoRequest
    ): Promise<RespuestaResumenPeriodo> {
      await delay(MOCK_LATENCY_MS);
      if (!input.profesionalId) {
        throw new ServiceError('VALIDATION');
      }
      assertHabilitado(input.profesionalId);
      const periodo = parsePeriodo(input.periodo);
      const now = ahoraServidor();
      const resumen = construirResumenPeriodo(obtenerHistorialItems(input.profesionalId), periodo, now);
      return { resumen, ahoraServidor: now };
    },

    async listarHistorial(input: ListarHistorialRequest): Promise<RespuestaListarHistorial> {
      await delay(MOCK_LATENCY_MS);
      if (!input.profesionalId) {
        throw new ServiceError('VALIDATION');
      }
      assertHabilitado(input.profesionalId);
      const periodo = parsePeriodo(input.periodo);
      const limit = input.limit ?? HISTORIAL_PAGE_SIZE;
      if (limit < 1 || limit > 50) {
        throw new ServiceError('VALIDATION');
      }
      const now = ahoraServidor();
      try {
        const { items, nextCursor } = listarHistorialInterno(
          input.profesionalId,
          periodo,
          now,
          input.cursor,
          limit
        );
        return { items, nextCursor, ahoraServidor: now };
      } catch (e) {
        if (e instanceof Error && e.message === 'CURSOR_INVALIDO') {
          throw new ServiceError('CURSOR_INVALIDO');
        }
        throw e;
      }
    },

    async sembrarHistorialDemo(input: SembrarHistorialDemoRequest): Promise<void> {
      await delay(MOCK_LATENCY_MS);
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      if (!input.profesionalId) {
        throw new ServiceError('VALIDATION');
      }
      assertHabilitado(input.profesionalId);
      if (!historialStoreVacio(input.profesionalId)) {
        return;
      }
      sembrarHistorialDemoInterno(input.profesionalId, ahoraServidor());
    },
  };
}
