// src/services/backend/backendProfessionalAuthService.ts
// Login real contra Directus: /auth/login + beauty_professionals por usuario.
// Estado: verified→APROBADO (activado, sin códigos en Directus),
// pending→EN_REVISION/DOCUMENTOS_PENDIENTES, rejected→RECHAZADO.

import { ProfessionalAuthService } from '../professionalAuthService';
import { SesionProfesional } from '../../types/professionalAuth';
import { ServiceError } from '../errors';
import { api, loginDirectus } from '../../lib/backend/directus';
import {
  backendSolicitudId,
  saveBackendSession,
} from '../../lib/backend/session';
import { DProfessional } from '../../lib/backend/mapping';
import { connectRealtime } from '../../lib/backend/realtime';

async function estadoDesdePro(
  token: string,
  pro: DProfessional,
): Promise<{ estado: SesionProfesional['estadoSolicitud']; onboarding?: SesionProfesional['onboardingPaso'] }> {
  if (pro.verification_status === 'verified') return { estado: 'APROBADO' };
  if (pro.verification_status === 'rejected') return { estado: 'RECHAZADO' };
  const docs = await api<unknown[]>(
    'GET',
    `/items/professional_documents?filter[professional][_eq]=${pro.id}&fields=id&limit=1`,
    token,
  );
  if (docs.length > 0) return { estado: 'EN_REVISION' };
  const servicios = await api<unknown[]>(
    'GET',
    `/items/professional_services?filter[professional_id][_eq]=${pro.id}&fields=id&limit=1`,
    token,
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
      const { accessToken } = await loginDirectus(cleanEmail, password);
      const me = await api<{ id: string; first_name?: string; last_name?: string; email?: string }>(
        'GET',
        '/users/me?fields=id,first_name,last_name,email',
        accessToken,
      );
      const pros = await api<DProfessional[]>(
        'GET',
        `/items/beauty_professionals?filter[user][_eq]=${me.id}&fields=id,display_name,verification_status&limit=1`,
        accessToken,
      );
      const pro = pros[0];
      if (!pro) throw new ServiceError('VALIDATION', 'Esta cuenta no es de profesional.');
      const nombre = pro.display_name || [me.first_name, me.last_name].filter(Boolean).join(' ') || cleanEmail;
      const { estado, onboarding } = await estadoDesdePro(accessToken, pro);
      await saveBackendSession({
        token: accessToken,
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
    },
  };
}
