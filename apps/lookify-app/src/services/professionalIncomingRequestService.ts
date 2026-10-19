import {
  AceptarSolicitudEntranteRequest,
  AlCerrarSesionIncomingRequest,
  ObtenerSolicitudActivaRequest,
  ObtenerSolicitudEntranteRequest,
  ProcesarExpiracionSolicitudRequest,
  RechazarSolicitudEntranteRequest,
  RespuestaAccionSolicitudEntrante,
  SimularClienteSolicitudRequest,
  SimularSolicitudEntranteRequest,
  SolicitudEntrante,
  SolicitudEntranteEvento,
  SuscribirseSolicitudesEntrantesRequest,
} from '../types/professionalIncomingRequest';
import { createMockProfessionalIncomingRequestService } from './mock/mockProfessionalIncomingRequestService';

export interface ProfessionalIncomingRequestService {
  obtenerSolicitudActiva(input: ObtenerSolicitudActivaRequest): Promise<SolicitudEntrante | null>;
  obtenerSolicitud(input: ObtenerSolicitudEntranteRequest): Promise<SolicitudEntrante | null>;
  suscribirseASolicitudesEntrantes(
    input: SuscribirseSolicitudesEntrantesRequest,
    callback: (evento: SolicitudEntranteEvento) => void
  ): () => void;
  aceptarSolicitud(input: AceptarSolicitudEntranteRequest): Promise<RespuestaAccionSolicitudEntrante>;
  rechazarSolicitud(input: RechazarSolicitudEntranteRequest): Promise<RespuestaAccionSolicitudEntrante>;
  procesarExpiracion(input: ProcesarExpiracionSolicitudRequest): Promise<RespuestaAccionSolicitudEntrante>;
  simularSolicitudEntrante(input: SimularSolicitudEntranteRequest): Promise<SolicitudEntrante>;
  simularClienteAcepta(input: SimularClienteSolicitudRequest): Promise<void>;
  simularClienteRechaza(input: SimularClienteSolicitudRequest): Promise<void>;
  simularExpiracionSolicitud(input: SimularClienteSolicitudRequest): Promise<void>;
  alCerrarSesion(input: AlCerrarSesionIncomingRequest): Promise<void>;
}

let implementation: ProfessionalIncomingRequestService =
  createMockProfessionalIncomingRequestService();

export function getProfessionalIncomingRequestService(): ProfessionalIncomingRequestService {
  return implementation;
}

export function setProfessionalIncomingRequestServiceForTesting(
  service: ProfessionalIncomingRequestService
): void {
  implementation = service;
}
