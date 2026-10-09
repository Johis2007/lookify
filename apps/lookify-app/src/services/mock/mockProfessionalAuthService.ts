import { SesionProfesional } from '../../types/professionalAuth';
import { ServiceError } from '../errors';
import { ProfessionalAuthService } from '../professionalAuthService';
import { MOCK_PROFESSIONAL_ACCOUNTS } from './mockProfessionalAccounts';
import { findRegisteredByEmail } from './mockProfessionalRegistryStore';

const MOCK_PRO_AUTH_LATENCY_MS = 600;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockProfessionalAuthService(): ProfessionalAuthService {
  return {
    async iniciarSesion(email: string, password: string): Promise<SesionProfesional> {
      await delay(MOCK_PRO_AUTH_LATENCY_MS);

      const key = normalizeEmail(email);
      const registered = findRegisteredByEmail(key);
      if (registered) {
        if (registered.password !== password) {
          throw new ServiceError('INVALID_CREDENTIALS');
        }
        const session: SesionProfesional = {
          profesionalId: registered.profesionalId,
          email: registered.email,
          nombre: registered.nombre,
          estadoSolicitud: registered.estadoSolicitud,
        };
        if (registered.onboardingPaso !== undefined) {
          session.onboardingPaso = registered.onboardingPaso;
        }
        return session;
      }

      const account = MOCK_PROFESSIONAL_ACCOUNTS.find((a) => a.email === key);

      if (!account || account.password !== password) {
        throw new ServiceError('INVALID_CREDENTIALS');
      }

      const session: SesionProfesional = {
        profesionalId: account.profesionalId,
        email: account.email,
        nombre: account.nombre,
        estadoSolicitud: account.estadoSolicitud,
      };
      if (account.onboardingPaso !== undefined) {
        session.onboardingPaso = account.onboardingPaso;
      }
      return session;
    },
  };
}
