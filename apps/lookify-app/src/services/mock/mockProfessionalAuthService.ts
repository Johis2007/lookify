import { SesionProfesional } from '../../types/professionalAuth';
import { ServiceError } from '../errors';
import { ProfessionalAuthService } from '../professionalAuthService';
import { MOCK_PROFESSIONAL_ACCOUNTS } from './mockProfessionalAccounts';
import {
  findRegisteredByEmail,
  getEstadoSolicitudForSolicitud,
  getOnboardingPasoForSolicitud,
  isProfesionalActivado,
} from './mockProfessionalRegistryStore';

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
        const onboardingPaso = getOnboardingPasoForSolicitud(registered.solicitudId);
        const estado =
          getEstadoSolicitudForSolicitud(registered.solicitudId) ?? registered.estadoSolicitud;
        const session: SesionProfesional = {
          profesionalId: registered.profesionalId,
          solicitudId: registered.solicitudId,
          email: registered.email,
          nombre: registered.nombre,
          estadoSolicitud: estado,
        };
        if (onboardingPaso !== undefined) {
          session.onboardingPaso = onboardingPaso;
        }
        session.profesionalActivado = isProfesionalActivado(registered.profesionalId);
        return session;
      }

      const account = MOCK_PROFESSIONAL_ACCOUNTS.find((a) => a.email === key);

      if (!account || account.password !== password) {
        throw new ServiceError('INVALID_CREDENTIALS');
      }

      const onboardingPaso = getOnboardingPasoForSolicitud(account.solicitudId);
      const estado =
        getEstadoSolicitudForSolicitud(account.solicitudId) ?? account.estadoSolicitud;
      const session: SesionProfesional = {
        profesionalId: account.profesionalId,
        solicitudId: account.solicitudId,
        email: account.email,
        nombre: account.nombre,
        estadoSolicitud: estado,
      };
      if (onboardingPaso !== undefined) {
        session.onboardingPaso = onboardingPaso;
      } else if (account.onboardingPaso !== undefined) {
        session.onboardingPaso = account.onboardingPaso;
      }
      session.profesionalActivado = isProfesionalActivado(account.profesionalId);
      return session;
    },
  };
}
