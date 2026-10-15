import {
  ActualizarFotoPerfilRequest,
  ActualizarFotoPerfilResponse,
  CambiarDisponibilidadRequest,
  CambiarDisponibilidadResponse,
  ConsultarDisponibilidadRequest,
  ConsultarDisponibilidadResponse,
  ObtenerPanelPrincipalRequest,
  PanelPrincipalResponse,
  RegistrarCierreSesionRequest,
} from '../types/professionalDashboard';
import { createMockProfessionalDashboardService } from './mock/mockProfessionalDashboardService';

export interface ProfessionalDashboardService {
  obtenerPanelPrincipal(input: ObtenerPanelPrincipalRequest): Promise<PanelPrincipalResponse>;
  cambiarDisponibilidad(
    input: CambiarDisponibilidadRequest
  ): Promise<CambiarDisponibilidadResponse>;
  actualizarFotoPerfil(input: ActualizarFotoPerfilRequest): Promise<ActualizarFotoPerfilResponse>;
  registrarCierreSesion(input: RegistrarCierreSesionRequest): Promise<void>;
  consultarDisponibilidad(
    input: ConsultarDisponibilidadRequest
  ): Promise<ConsultarDisponibilidadResponse>;
}

let implementation: ProfessionalDashboardService = createMockProfessionalDashboardService();

export function getProfessionalDashboardService(): ProfessionalDashboardService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP en el futuro. */
export function setProfessionalDashboardServiceForTesting(
  service: ProfessionalDashboardService
): void {
  implementation = service;
}
