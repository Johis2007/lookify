import {
  ListarHistorialRequest,
  ObtenerResumenPeriodoRequest,
  RespuestaListarHistorial,
  RespuestaResumenPeriodo,
  SembrarHistorialDemoRequest,
} from '../types/professionalEarningsHistory';
import { createMockProfessionalEarningsHistoryService } from './mock/mockProfessionalEarningsHistoryService';

export interface ProfessionalEarningsHistoryService {
  obtenerResumenPeriodo(input: ObtenerResumenPeriodoRequest): Promise<RespuestaResumenPeriodo>;
  listarHistorial(input: ListarHistorialRequest): Promise<RespuestaListarHistorial>;
  sembrarHistorialDemo(input: SembrarHistorialDemoRequest): Promise<void>;
}

let implementation: ProfessionalEarningsHistoryService =
  createMockProfessionalEarningsHistoryService();

export function getProfessionalEarningsHistoryService(): ProfessionalEarningsHistoryService {
  return implementation;
}

export function setProfessionalEarningsHistoryServiceForTesting(
  service: ProfessionalEarningsHistoryService
): void {
  implementation = service;
}
