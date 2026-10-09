import {
  RegistrarProfesionalRequest,
  RegistrarProfesionalResponse,
} from '../types/professionalRegistration';
import { createMockProfessionalRegistrationService } from './mock/mockProfessionalRegistrationService';

export interface ProfessionalRegistrationService {
  registrarProfesional(datos: RegistrarProfesionalRequest): Promise<RegistrarProfesionalResponse>;
}

let implementation: ProfessionalRegistrationService = createMockProfessionalRegistrationService();

export function getProfessionalRegistrationService(): ProfessionalRegistrationService {
  return implementation;
}
