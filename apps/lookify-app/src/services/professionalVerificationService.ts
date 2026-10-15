import {
  EstadoVerificacionResponse,
  IniciarCorreccionCertificadosRequest,
  IniciarCorreccionCertificadosResponse,
  ObtenerAvisoCorreccionRequest,
  ObtenerAvisoCorreccionResponse,
  ObtenerEstadoVerificacionRequest,
  ReenviarCodigoActivacionRequest,
  ReenviarCodigoActivacionResponse,
  SimularDecisionAdministradorRequest,
  ValidarCodigoActivacionRequest,
  ValidarCodigoActivacionResponse,
} from '../types/professionalVerification';
import { createMockProfessionalVerificationService } from './mock/mockProfessionalVerificationService';

export interface ProfessionalVerificationService {
  obtenerEstadoVerificacion(
    input: ObtenerEstadoVerificacionRequest
  ): Promise<EstadoVerificacionResponse>;
  actualizarEstadoVerificacion(
    input: ObtenerEstadoVerificacionRequest
  ): Promise<EstadoVerificacionResponse>;
  iniciarCorreccionCertificados(
    input: IniciarCorreccionCertificadosRequest
  ): Promise<IniciarCorreccionCertificadosResponse>;
  reenviarCodigoActivacion(
    input: ReenviarCodigoActivacionRequest
  ): Promise<ReenviarCodigoActivacionResponse>;
  validarCodigoActivacion(
    input: ValidarCodigoActivacionRequest
  ): Promise<ValidarCodigoActivacionResponse>;
  obtenerAvisoCorreccion(
    input: ObtenerAvisoCorreccionRequest
  ): Promise<ObtenerAvisoCorreccionResponse>;
  simularDecisionAdministrador(input: SimularDecisionAdministradorRequest): Promise<EstadoVerificacionResponse>;
  expirarCodigoActivacionDemo(input: ObtenerEstadoVerificacionRequest): Promise<EstadoVerificacionResponse>;
}

let implementation: ProfessionalVerificationService =
  createMockProfessionalVerificationService();

export function getProfessionalVerificationService(): ProfessionalVerificationService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP (ver initBackend). */
export function setProfessionalVerificationServiceForTesting(
  service: ProfessionalVerificationService,
): void {
  implementation = service;
}
