// src/services/backend/initBackend.ts
// Activa las implementaciones contra el backend real (Directus +
// realtime-server). Llamar una vez al arrancar si BACKEND.enabled.
// Por defecto todo sigue en mocks: cero cambios de comportamiento.

import { BACKEND } from '../../lib/backend/config';
import { setProfessionalAuthServiceForTesting } from '../professionalAuthService';
import { setProfessionalRegistrationServiceForTesting } from '../professionalRegistrationService';
import { setProfessionalDashboardServiceForTesting } from '../professionalDashboardService';
import { setProfessionalEarningsHistoryServiceForTesting } from '../professionalEarningsHistoryService';
import { setProfessionalIncomingRequestServiceForTesting } from '../professionalIncomingRequestService';
import { setProfessionalServiceInProgressServiceForTesting } from '../professionalServiceInProgressService';
import { setProfessionalVerificationServiceForTesting } from '../professionalVerificationService';
import { setProfessionalCertificateServiceForTesting } from '../professionalCertificateService';
import { setCatalogServiceForTesting } from '../catalogService';
import { createBackendCatalogService } from './backendCatalogService';
import { setActiveSolicitudProvider } from '../incomingActive';
import { createBackendProfessionalAuthService } from './backendProfessionalAuthService';
import { createBackendProfessionalRegistrationService } from './backendProfessionalRegistrationService';
import { createBackendProfessionalDashboardService } from './backendProfessionalDashboardService';
import { createBackendProfessionalEarningsHistoryService } from './backendProfessionalEarningsHistoryService';
import {
  createBackendProfessionalIncomingRequestService,
  getActiveSolicitudBackend,
} from './backendProfessionalIncomingRequestService';
import { createBackendProfessionalServiceInProgressService } from './backendProfessionalServiceInProgressService';
import { createBackendProfessionalVerificationService } from './backendProfessionalVerificationService';
import { createBackendProfessionalCertificateService } from './backendProfessionalCertificateService';

let initialized = false;

export function isBackendEnabled(): boolean {
  return BACKEND.enabled;
}

/**
 * Conecta todos los servicios del flujo profesional al backend real.
 * Idempotente. Portfolio queda en mock (sin tabla en Directus: ver
 * docs/adaptacion-backend.md).
 */
export function initBackend(): void {
  if (initialized || !BACKEND.enabled) return;
  initialized = true;
  setProfessionalAuthServiceForTesting(createBackendProfessionalAuthService());
  setProfessionalRegistrationServiceForTesting(createBackendProfessionalRegistrationService());
  setProfessionalDashboardServiceForTesting(createBackendProfessionalDashboardService());
  setProfessionalEarningsHistoryServiceForTesting(createBackendProfessionalEarningsHistoryService());
  setProfessionalIncomingRequestServiceForTesting(createBackendProfessionalIncomingRequestService());
  setProfessionalServiceInProgressServiceForTesting(createBackendProfessionalServiceInProgressService());
  setProfessionalVerificationServiceForTesting(createBackendProfessionalVerificationService());
  setProfessionalCertificateServiceForTesting(createBackendProfessionalCertificateService());
  setActiveSolicitudProvider(getActiveSolicitudBackend);
  setCatalogServiceForTesting(createBackendCatalogService());
}
