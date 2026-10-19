import { SesionProfesional } from '../types/professionalAuth';
import { createMockProfessionalAuthService } from './mock/mockProfessionalAuthService';

export interface ProfessionalAuthService {
  iniciarSesion(email: string, password: string): Promise<SesionProfesional>;
}

let implementation: ProfessionalAuthService = createMockProfessionalAuthService();

export function getProfessionalAuthService(): ProfessionalAuthService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP en el futuro. */
export function setProfessionalAuthServiceForTesting(service: ProfessionalAuthService): void {
  implementation = service;
}
