import {
  GuardarServiciosRequest,
  GuardarServiciosResponse,
  RegistrarProfesionalRequest,
  RegistrarProfesionalResponse,
} from '../../types/professionalRegistration';
import { esServicioIdValido } from './catalogServicioIds';
import {
  setOnboardingPasoForSolicitud,
  setServiciosForSolicitud,
  solicitudExiste,
} from './mockProfessionalRegistryStore';
import { ServiceError } from '../errors';
import { ProfessionalRegistrationService } from '../professionalRegistrationService';
import { isEmailRegistered } from '../../data/mockUsers';
import { MOCK_PROFESSIONAL_ACCOUNTS } from './mockProfessionalAccounts';
import {
  findRegisteredByEmail,
  isDocumentRegistered,
  registerProfessionalRecord,
} from './mockProfessionalRegistryStore';

const MOCK_REGISTRATION_LATENCY_MS = 650;
const MOCK_GUARDAR_SERVICIOS_LATENCY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailTaken(email: string): boolean {
  const key = normalizeEmail(email);
  if (isEmailRegistered(key)) return true;
  if (findRegisteredByEmail(key)) return true;
  if (MOCK_PROFESSIONAL_ACCOUNTS.some((a) => a.email === key)) return true;
  return false;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMockProfessionalRegistrationService(): ProfessionalRegistrationService {
  return {
    async registrarProfesional(
      datos: RegistrarProfesionalRequest
    ): Promise<RegistrarProfesionalResponse> {
      await delay(MOCK_REGISTRATION_LATENCY_MS);

      const email = normalizeEmail(datos.email);
      if (emailTaken(email)) {
        throw new ServiceError('EMAIL_DUPLICATE');
      }
      if (isDocumentRegistered(datos.tipoDocumento, datos.numeroDocumento)) {
        throw new ServiceError('DOCUMENTO_DUPLICADO');
      }

      const profesionalId = generateId('pro');
      const solicitudId = generateId('sol');

      registerProfessionalRecord({
        profesionalId,
        solicitudId,
        email,
        password: datos.password,
        nombre: datos.nombre.trim(),
        tipoDocumento: datos.tipoDocumento,
        numeroDocumento: datos.numeroDocumento.trim(),
        estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
        onboardingPaso: 'SERVICIOS',
        verificado: false,
        estadoOperativo: 'OCUPADO',
      });

      return {
        profesionalId,
        solicitudId,
        nombre: datos.nombre.trim(),
        email,
        estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
        onboardingPaso: 'SERVICIOS',
      };
    },

    async guardarServicios(input: GuardarServiciosRequest): Promise<GuardarServiciosResponse> {
      await delay(MOCK_GUARDAR_SERVICIOS_LATENCY_MS);

      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      if (input.servicioIds.length === 0) {
        throw new ServiceError('VALIDATION');
      }
      const unique = [...new Set(input.servicioIds)];
      if (unique.some((id) => !esServicioIdValido(id))) {
        throw new ServiceError('SERVICIO_INVALIDO');
      }

      setServiciosForSolicitud(input.solicitudId, unique);
      setOnboardingPasoForSolicitud(input.solicitudId, 'CERTIFICADOS');

      return {
        solicitudId: input.solicitudId,
        servicioIds: unique,
        onboardingPaso: 'CERTIFICADOS',
      };
    },
  };
}
