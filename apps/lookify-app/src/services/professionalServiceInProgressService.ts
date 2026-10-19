import {
  CancelarServicioPorProfesionalRequest,
  ExpirarBloqueoPinDemoRequest,
  FinalizarServicioEnCursoRequest,
  MarcarLlegadaRequest,
  ObtenerPinDemoRequest,
  ObtenerServicioActivoRequest,
  RespuestaPinDemo,
  RespuestaServicioActivo,
  RespuestaServicioEnCurso,
  RespuestaValidarPin,
  ValidarPinServicioRequest,
} from '../types/professionalServiceInProgress';
import { createMockProfessionalServiceInProgressService } from './mock/mockProfessionalServiceInProgressService';

export interface ProfessionalServiceInProgressService {
  obtenerServicioActivo(input: ObtenerServicioActivoRequest): Promise<RespuestaServicioActivo>;
  marcarLlegada(input: MarcarLlegadaRequest): Promise<RespuestaServicioEnCurso>;
  validarPin(input: ValidarPinServicioRequest): Promise<RespuestaValidarPin>;
  cancelarPorProfesional(
    input: CancelarServicioPorProfesionalRequest
  ): Promise<RespuestaServicioEnCurso>;
  finalizarServicio(input: FinalizarServicioEnCursoRequest): Promise<RespuestaServicioEnCurso>;
  obtenerPinDemo(input: ObtenerPinDemoRequest): Promise<RespuestaPinDemo>;
  expirarBloqueoPinDemo(input: ExpirarBloqueoPinDemoRequest): Promise<RespuestaServicioEnCurso>;
}

let implementation: ProfessionalServiceInProgressService =
  createMockProfessionalServiceInProgressService();

export function getProfessionalServiceInProgressService(): ProfessionalServiceInProgressService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP en el futuro. */
export function setProfessionalServiceInProgressServiceForTesting(
  service: ProfessionalServiceInProgressService
): void {
  implementation = service;
}
