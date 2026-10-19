import {
  GuardarServiciosRequest,
  GuardarServiciosResponse,
  RegistrarProfesionalRequest,
  RegistrarProfesionalResponse,
} from '../types/professionalRegistration';
import { createMockProfessionalRegistrationService } from './mock/mockProfessionalRegistrationService';

export interface ProfessionalRegistrationService {
  registrarProfesional(datos: RegistrarProfesionalRequest): Promise<RegistrarProfesionalResponse>;
  guardarServicios(input: GuardarServiciosRequest): Promise<GuardarServiciosResponse>;
}

let implementation: ProfessionalRegistrationService = createMockProfessionalRegistrationService();

export function getProfessionalRegistrationService(): ProfessionalRegistrationService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP (ver initBackend). */
export function setProfessionalRegistrationServiceForTesting(
  service: ProfessionalRegistrationService,
): void {
  implementation = service;
}
