import { EstadoSolicitudProfesional } from './professionalAuth';

export interface ResumenVerificacionEnvio {
  cantidadCertificados: number;
  cantidadServicios: number;
  servicioIds: string[];
}

export interface RechazoVerificacion {
  motivo: string;
  serviciosAfectadosIds: string[];
}

export interface EstadoActivacionUi {
  codigoExpirado: boolean;
  bloqueadoHastaMs: number | null;
  reenvioDisponibleEnMs: number | null;
  reenviosRestantes: number;
  sinSalidaActivacion: boolean;
}

export interface ObtenerEstadoVerificacionRequest {
  solicitudId: string;
}

export interface EstadoVerificacionResponse {
  solicitudId: string;
  profesionalId: string;
  nombre: string;
  estadoSolicitud: EstadoSolicitudProfesional;
  profesionalActivado: boolean;
  emailEnmascarado: string;
  resumen?: ResumenVerificacionEnvio;
  rechazo?: RechazoVerificacion;
  activacion?: EstadoActivacionUi;
  /** Solo mock + __DEV__: código en claro para prueba USB (nunca en producción). */
  codigoActivacionDemo?: string;
}

export interface IniciarCorreccionCertificadosRequest {
  solicitudId: string;
}

export interface IniciarCorreccionCertificadosResponse {
  profesionalId: string;
  solicitudId: string;
  nombre: string;
  email: string;
  estadoSolicitud: 'DOCUMENTOS_PENDIENTES';
  onboardingPaso: 'CERTIFICADOS';
  servicioIds: string[];
}

export interface ReenviarCodigoActivacionRequest {
  solicitudId: string;
}

export interface ReenviarCodigoActivacionResponse {
  emailEnmascarado: string;
  reenvioDisponibleEnMs: number | null;
  reenviosRestantes: number;
  /** Solo mock + __DEV__: código en claro para prueba USB (nunca en producción). No forma parte del contrato backend. */
  codigoActivacionDemo?: string;
}

export interface ValidarCodigoActivacionRequest {
  solicitudId: string;
  codigo: string;
}

export interface ValidarCodigoActivacionResponse {
  profesionalId: string;
  solicitudId: string;
  nombre: string;
  email: string;
  estadoSolicitud: 'APROBADO';
  profesionalActivado: true;
}

export interface ObtenerAvisoCorreccionRequest {
  solicitudId: string;
}

export interface ObtenerAvisoCorreccionResponse {
  motivoRechazo: string | null;
}

export type DecisionAdminSimulada = 'APROBAR' | 'RECHAZAR';

export interface SimularDecisionAdministradorRequest {
  solicitudId: string;
  decision: DecisionAdminSimulada;
  motivoRechazo?: string;
  serviciosAfectadosIds?: string[];
}
