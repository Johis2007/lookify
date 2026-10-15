import {
  AgregarCertificadoRequest,
  ActualizarCertificadoRequest,
  EliminarCertificadoRequest,
  EnviarSolicitudVerificacionRequest,
  EnviarSolicitudVerificacionResponse,
  CertificadoProfesional,
  ListarCertificadosRequest,
  ObtenerServiciosDeSolicitudRequest,
  ObtenerServiciosDeSolicitudResponse,
} from '../types/professionalCertificates';
import { createMockProfessionalCertificateService } from './mock/mockProfessionalCertificateService';

export interface ProfessionalCertificateService {
  obtenerServiciosDeSolicitud(
    input: ObtenerServiciosDeSolicitudRequest
  ): Promise<ObtenerServiciosDeSolicitudResponse>;
  listarCertificados(input: ListarCertificadosRequest): Promise<CertificadoProfesional[]>;
  agregarCertificado(input: AgregarCertificadoRequest): Promise<CertificadoProfesional>;
  actualizarCertificado(input: ActualizarCertificadoRequest): Promise<CertificadoProfesional>;
  eliminarCertificado(input: EliminarCertificadoRequest): Promise<void>;
  enviarSolicitudVerificacion(
    input: EnviarSolicitudVerificacionRequest
  ): Promise<EnviarSolicitudVerificacionResponse>;
}

let implementation: ProfessionalCertificateService = createMockProfessionalCertificateService();

export function getProfessionalCertificateService(): ProfessionalCertificateService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP (ver initBackend). */
export function setProfessionalCertificateServiceForTesting(
  service: ProfessionalCertificateService,
): void {
  implementation = service;
}
