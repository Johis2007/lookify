// src/services/backend/backendProfessionalRegistrationService.ts
// Registro real: POST /users (público, como mobile-web) + login +
// beauty_professionals en pending. guardarServicios usa professional_services
// (borra y re-inserta). Sin códigos de activación en Directus.

import {
  ProfessionalRegistrationService,
} from '../professionalRegistrationService';
import {
  GuardarServiciosRequest,
  GuardarServiciosResponse,
  RegistrarProfesionalRequest,
  RegistrarProfesionalResponse,
} from '../../types/professionalRegistration';
import { ServiceError } from '../errors';
import { api, loginDirectus } from '../../lib/backend/directus';
import { bffApi } from '../../lib/backend/bff';
import {
  backendSolicitudId,
  loadBackendSession,
  saveBackendSession,
} from '../../lib/backend/session';
import { connectRealtime } from '../../lib/backend/realtime';

export function createBackendProfessionalRegistrationService(): ProfessionalRegistrationService {
  return {
    async registrarProfesional(datos: RegistrarProfesionalRequest): Promise<RegistrarProfesionalResponse> {
      // Registro por BFF (sin token). El servidor fija el rol App User; el
      // cliente nunca envía role/policies/token.
      await bffApi('POST', '/api/auth/register', null, {
        email: datos.email.trim(),
        password: datos.password,
        firstName: datos.nombre.trim(),
      });
      const { accessToken, refreshToken } = await loginDirectus(datos.email.trim(), datos.password);
      const me = await bffApi<{ id: string }>('GET', '/api/users/me', accessToken);
      // El perfil se crea por el BFF: deriva el user del token y fuerza
      // verification_status='pending' (no auto-verificación).
      const created = await bffApi<{ id: number }>('POST', '/api/professionals/me', accessToken, {
        displayName: datos.nombre.trim(),
        phone: datos.telefono,
      });
      const professionalId = Number(created?.id);
      if (!Number.isInteger(professionalId) || professionalId <= 0) {
        throw new ServiceError('UNKNOWN', 'No se pudo crear el perfil profesional.');
      }
      await saveBackendSession({
        token: accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        userId: me.id,
        professionalId,
        email: datos.email.trim(),
        nombre: datos.nombre.trim(),
      });
      connectRealtime(accessToken);
      return {
        profesionalId: String(professionalId),
        solicitudId: backendSolicitudId(professionalId),
        nombre: datos.nombre.trim(),
        email: datos.email.trim(),
        estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
        onboardingPaso: 'SERVICIOS',
      };
    },

    async guardarServicios(input: GuardarServiciosRequest): Promise<GuardarServiciosResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const ids = [...new Set(input.servicioIds.map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0))];
      if (ids.length === 0) throw new ServiceError('VALIDATION');
      // Valida que existan en el catálogo.
      const existentes = await api<{ id: number }[]>(
        'GET',
        `/items/beauty_services?filter[id][_in]=${ids.join(',')}&fields=id&limit=${ids.length}`,
        session.token,
      );
      if (existentes.length !== ids.length) throw new ServiceError('SERVICIO_INVALIDO');
      // El BFF reemplaza el vínculo de forma transaccional y deriva el pro del token.
      await bffApi('PUT', '/api/professionals/me/services', session.token, {
        serviceIds: ids,
      });
      return {
        solicitudId: input.solicitudId,
        servicioIds: ids.map(String),
        onboardingPaso: 'CERTIFICADOS',
      };
    },
  };
}
