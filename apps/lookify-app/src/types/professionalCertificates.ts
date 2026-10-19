import { CertificadoMimePermitido } from '../constants/certificateUpload';
import { EstadoSolicitudProfesional } from './professionalAuth';

export interface CertificadoArchivoDescriptor {
  uri: string;
  mimeType: CertificadoMimePermitido;
  fileName: string;
  sizeBytes: number;
}

export interface CertificadoProfesional {
  id: string;
  solicitudId: string;
  nombreTipo: string;
  entidadEmisora: string;
  fechaEmision?: string;
  servicioIds: string[];
  archivo: CertificadoArchivoDescriptor;
}

export interface CertificadoFormPayload {
  nombreTipo: string;
  entidadEmisora: string;
  fechaEmision?: string;
  servicioIds: string[];
  archivo: CertificadoArchivoDescriptor;
}

export interface ListarCertificadosRequest {
  solicitudId: string;
}

export interface ObtenerServiciosDeSolicitudRequest {
  solicitudId: string;
}

export interface ObtenerServiciosDeSolicitudResponse {
  servicioIds: string[];
}

export interface AgregarCertificadoRequest {
  solicitudId: string;
  certificado: CertificadoFormPayload;
}

export interface ActualizarCertificadoRequest {
  solicitudId: string;
  certificadoId: string;
  certificado: CertificadoFormPayload;
}

export interface EliminarCertificadoRequest {
  solicitudId: string;
  certificadoId: string;
}

export interface EnviarSolicitudVerificacionRequest {
  solicitudId: string;
}

export interface EnviarSolicitudVerificacionResponse {
  solicitudId: string;
  estadoSolicitud: Extract<EstadoSolicitudProfesional, 'EN_REVISION'>;
  profesionalId: string;
  nombre: string;
  email: string;
  onboardingPaso?: 'CERTIFICADOS';
}
