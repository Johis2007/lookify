import { ProfessionalSessionRouteParams } from './professionalAuth';

export type SolicitudEntranteEstado =
  | 'PENDIENTE_PRO'
  | 'ESPERANDO_CLIENTE'
  | 'CERRADA_EXPIRADA'
  | 'CERRADA_RECHAZADA_PRO'
  | 'CERRADA_RECHAZADA_CLIENTE'
  | 'CERRADA_YA_ASIGNADA'
  | 'LISTA_PARA_SERVICIO';

export type ResultadoRespuestaPro =
  | 'ACEPTADA'
  | 'RECHAZADA'
  | 'EXPIRADA'
  | 'YA_ASIGNADA';

export type DesgloseSolicitudEntrante = {
  precioBaseCop: number;
  precioDomicilioCop: number;
  precioTotalCop: number;
};

export type SolicitudEntrante = {
  id: string;
  profesionalId: string;
  servicioId: string;
  servicioNombre: string;
  duracionMin: number;
  distanciaKmAprox: number;
  desglose: DesgloseSolicitudEntrante;
  clientePrimerNombre: string;
  clienteCalificacionPromedio: number | null;
  clienteTotalResenas: number;
  expiraEn: number;
  estado: SolicitudEntranteEstado;
};

export type SolicitudEntranteEvento = {
  tipo: 'NUEVA' | 'ACTUALIZADA';
  solicitud: SolicitudEntrante;
};

export type ObtenerSolicitudActivaRequest = {
  profesionalId: string;
};

export type ObtenerSolicitudEntranteRequest = {
  profesionalId: string;
  solicitudEntranteId: string;
};

export type SuscribirseSolicitudesEntrantesRequest = {
  profesionalId: string;
};

export type AceptarSolicitudEntranteRequest = {
  profesionalId: string;
  solicitudEntranteId: string;
};

export type RechazarSolicitudEntranteRequest = {
  profesionalId: string;
  solicitudEntranteId: string;
};

export type ProcesarExpiracionSolicitudRequest = {
  profesionalId: string;
  solicitudEntranteId: string;
};

export type RespuestaAccionSolicitudEntrante = {
  resultado: ResultadoRespuestaPro;
  solicitud: SolicitudEntrante | null;
};

export type SimularSolicitudEntranteRequest = {
  profesionalId: string;
  solicitudId: string;
};

export type SimularClienteSolicitudRequest = {
  profesionalId: string;
  solicitudEntranteId: string;
};

export type AlCerrarSesionIncomingRequest = {
  profesionalId: string;
};

export type ProfessionalIncomingRequestRouteParams = ProfessionalSessionRouteParams & {
  solicitudEntranteId: string;
};

export type { ProfessionalServiceInProgressRouteParams } from './professionalServiceInProgress';
