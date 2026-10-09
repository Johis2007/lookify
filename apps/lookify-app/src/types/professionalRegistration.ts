import { TipoDocumentoId } from '../utils/validators';

export interface ConsentimientoLegal {
  version: string;
  /** Informativo en frontend; el backend registra sello e IP en producción. */
  aceptadoEn: string;
}

export interface RegistrarProfesionalRequest {
  nombre: string;
  tipoDocumento: TipoDocumentoId;
  numeroDocumento: string;
  nacionalidad: string;
  fechaNacimiento: string;
  telefono: string;
  email: string;
  password: string;
  consentimientoTerminos: ConsentimientoLegal;
  consentimientoPoliticaDatos: ConsentimientoLegal;
}

export interface RegistrarProfesionalResponse {
  profesionalId: string;
  solicitudId: string;
  nombre: string;
  email: string;
  estadoSolicitud: 'DOCUMENTOS_PENDIENTES';
  onboardingPaso: 'SERVICIOS';
}
