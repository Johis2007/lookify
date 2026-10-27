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
