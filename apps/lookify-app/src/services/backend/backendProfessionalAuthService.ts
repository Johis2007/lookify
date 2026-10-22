// src/services/backend/backendProfessionalAuthService.ts
// Login real contra Directus: /auth/login + beauty_professionals por usuario.
// Estado: verified→APROBADO (activado, sin códigos en Directus),
// pending→EN_REVISION/DOCUMENTOS_PENDIENTES, rejected→RECHAZADO.

import { ProfessionalAuthService } from '../professionalAuthService';
import { SesionProfesional } from '../../types/professionalAuth';
import { ServiceError } from '../errors';
import { loginDirectus } from '../../lib/backend/directus';
import { bffApi } from '../../lib/backend/bff';
import {
  backendSolicitudId,
  loadBackendSession,
  saveBackendSession,
} from '../../lib/backend/session';
import { connectRealtime } from '../../lib/backend/realtime';
import { createMockProfessionalAuthService } from '../mock/mockProfessionalAuthService';

export type ProEstado = {
  id: number;
  displayName?: string | null;
  verificationStatus?: string | null;
};

export async function estadoDesdePro(
  token: string,
  pro: ProEstado,
): Promise<{ estado: SesionProfesional['estadoSolicitud']; onboarding?: SesionProfesional['onboardingPaso'] }> {
  if (pro.verificationStatus === 'verified') return { estado: 'APROBADO' };
  if (pro.verificationStatus === 'rejected') return { estado: 'RECHAZADO' };
  const docs = await bffApi<unknown[]>('GET', '/api/professionals/me/documents', token).catch(() => []);
  if (docs.length > 0) return { estado: 'EN_REVISION' };
  const servicios = await bffApi<unknown[]>('GET', '/api/professionals/me/services', token).catch(
    () => [],
  );
  return {
    estado: 'DOCUMENTOS_PENDIENTES',
    onboarding: servicios.length > 0 ? 'CERTIFICADOS' : 'SERVICIOS',
  };
}

export function createBackendProfessionalAuthService(): ProfessionalAuthService {
  return {
    async iniciarSesion(email: string, password: string): Promise<SesionProfesional> {
      const cleanEmail = email.trim();
      if (!cleanEmail || !password) throw new ServiceError('VALIDATION');
      try {
        const { accessToken, refreshToken } = await loginDirectus(cleanEmail, password);
        const me = await bffApi<{ id: string; firstName?: string | null; lastName?: string | null }>(
          'GET',
          '/api/users/me',
          accessToken,
        );
        const pro = await bffApi<ProEstado>(
          'GET',
          '/api/professionals/me',
          accessToken,
          undefined,
          'SOLICITUD_NO_ENCONTRADA',
        ).catch((e: unknown) => {
          if (e instanceof ServiceError && e.code === 'SOLICITUD_NO_ENCONTRADA') return null;
          throw e;
        });
        if (!pro) throw new ServiceError('VALIDATION', 'Esta cuenta no es de profesional.');
        const nombre =
          pro.displayName || [me.firstName, me.lastName].filter(Boolean).join(' ') || cleanEmail;
        const { estado, onboarding } = await estadoDesdePro(accessToken, pro);
        await saveBackendSession({
          token: accessToken,
          ...(refreshToken ? { refreshToken } : {}),
          userId: me.id,
          professionalId: pro.id,
          email: cleanEmail,
          nombre,
        });
        connectRealtime(accessToken);
        const sesion: SesionProfesional = {
          profesionalId: String(pro.id),
          solicitudId: backendSolicitudId(pro.id),
          email: cleanEmail,
          nombre,
          estadoSolicitud: estado,
          profesionalActivado: estado === 'APROBADO',
        };
        if (onboarding !== undefined) sesion.onboardingPaso = onboarding;
        return sesion;
      } catch (e) {
        if (!(e instanceof ServiceError) || e.code !== 'NETWORK') throw e;
        // Offline: 1) caché del mismo correo, 2) cuenta mock local.
        const cached = await loadBackendSession().catch(() => null);
        if (cached && cached.email.trim().toLowerCase() === cleanEmail.toLowerCase()) {
          return {
            profesionalId: String(cached.professionalId),
            solicitudId: backendSolicitudId(cached.professionalId),
            email: cleanEmail,
            nombre: cached.nombre,
            estadoSolicitud: 'APROBADO',
            profesionalActivado: true,
          };
        }
        try {
          return await createMockProfessionalAuthService().iniciarSesion(cleanEmail, password);
        } catch {
          throw new ServiceError('NETWORK', 'Sin conexión con el backend.');
        }
      }
    },
  };
}
