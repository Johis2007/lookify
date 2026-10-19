// src/services/backend/backendProfessionalVerificationService.ts
// Verificación real: verification_status de beauty_professionals.
// Directus NO tiene códigos de activación: un profesional verified queda
// activado al iniciar sesión (login devuelve profesionalActivado=true), por
// lo que la UI de código no aparece. reenviar/validar solo resuelven para
// verified; si no, responden como si no hubiera código vigente.

import {
  ProfessionalVerificationService,
} from '../professionalVerificationService';
import {
  EstadoVerificacionResponse,
  IniciarCorreccionCertificadosRequest,
  IniciarCorreccionCertificadosResponse,
  ObtenerAvisoCorreccionRequest,
  ObtenerAvisoCorreccionResponse,
  ObtenerEstadoVerificacionRequest,
  ReenviarCodigoActivacionRequest,
  ReenviarCodigoActivacionResponse,
  SimularDecisionAdministradorRequest,
  ValidarCodigoActivacionRequest,
  ValidarCodigoActivacionResponse,
} from '../../types/professionalVerification';
import { ServiceError } from '../errors';
import { api } from '../../lib/backend/directus';
import {
  backendSolicitudId,
  loadBackendSession,
  resolveProfessionalId,
} from '../../lib/backend/session';
import { maskEmail } from '../../utils/maskEmail';

type ProRow = {
  id: number;
  display_name: string;
  verification_status?: 'pending' | 'verified' | 'rejected' | null;
  verification_note?: string | null;
};

async function leerPro(token: string, professionalId: number): Promise<ProRow> {
  return api<ProRow>(
    'GET',
    `/items/beauty_professionals/${professionalId}?fields=id,display_name,verification_status,verification_note`,
    token,
    'SOLICITUD_NO_ENCONTRADA',
  );
}

async function resumenEnvio(token: string, professionalId: number): Promise<{ cantidadCertificados: number; cantidadServicios: number; servicioIds: string[] }> {
  const [docs, servicios] = await Promise.all([
    api<unknown[]>(
      'GET',
      `/items/professional_documents?filter[professional][_eq]=${professionalId}&fields=id&limit=100`,
      token,
    ).catch(() => []),
    api<{ service_id: number }[]>(
      'GET',
      `/items/professional_services?filter[professional_id][_eq]=${professionalId}&fields=service_id&limit=200`,
      token,
    ).catch(() => []),
  ]);
  const servicioIds = [...new Set(servicios.map((s) => String(s.service_id)))];
  return { cantidadCertificados: docs.length, cantidadServicios: servicioIds.length, servicioIds };
}

export function createBackendProfessionalVerificationService(): ProfessionalVerificationService {
  async function estado(solicitudId: string): Promise<EstadoVerificacionResponse> {
    const session = await loadBackendSession();
    if (!session) throw new ServiceError('INVALID_CREDENTIALS');
    const professionalId = await resolveProfessionalId(undefined, solicitudId);
    const pro = await leerPro(session.token, professionalId);
    const sid = backendSolicitudId(professionalId);
    const base = {
      solicitudId: sid,
      profesionalId: String(professionalId),
      nombre: pro.display_name,
      emailEnmascarado: maskEmail(session.email),
    };
    if (pro.verification_status === 'verified') {
      return {
        ...base,
        estadoSolicitud: 'APROBADO',
        profesionalActivado: true,
        activacion: {
          codigoExpirado: false,
          bloqueadoHastaMs: null,
          reenvioDisponibleEnMs: null,
          reenviosRestantes: 0,
          sinSalidaActivacion: false,
        },
      };
    }
    if (pro.verification_status === 'rejected') {
      return {
        ...base,
        estadoSolicitud: 'RECHAZADO',
        profesionalActivado: false,
        rechazo: { motivo: pro.verification_note ?? 'Documentación rechazada.', serviciosAfectadosIds: [] },
      };
    }
    const docs = await api<unknown[]>(
      'GET',
      `/items/professional_documents?filter[professional][_eq]=${professionalId}&fields=id&limit=1`,
      session.token,
    ).catch(() => []);
    return {
      ...base,
      estadoSolicitud: docs.length > 0 ? 'EN_REVISION' : 'DOCUMENTOS_PENDIENTES',
      profesionalActivado: false,
      resumen: await resumenEnvio(session.token, professionalId),
    };
  }

  return {
    async obtenerEstadoVerificacion(input: ObtenerEstadoVerificacionRequest): Promise<EstadoVerificacionResponse> {
      return estado(input.solicitudId);
    },

    async actualizarEstadoVerificacion(input: ObtenerEstadoVerificacionRequest): Promise<EstadoVerificacionResponse> {
      return estado(input.solicitudId);
    },

    async iniciarCorreccionCertificados(
      input: IniciarCorreccionCertificadosRequest,
    ): Promise<IniciarCorreccionCertificadosResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const pro = await leerPro(session.token, professionalId);
      if (pro.verification_status !== 'rejected') throw new ServiceError('VALIDATION');
      await api('PATCH', `/items/beauty_professionals/${professionalId}`, session.token, {
        verification_status: 'pending',
      });
      const servicios = await api<{ service_id: number }[]>(
        'GET',
        `/items/professional_services?filter[professional_id][_eq]=${professionalId}&fields=service_id&limit=200`,
        session.token,
      ).catch(() => []);
      return {
        profesionalId: String(professionalId),
        solicitudId: backendSolicitudId(professionalId),
        nombre: pro.display_name,
        email: session.email,
        estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
        onboardingPaso: 'CERTIFICADOS',
        servicioIds: servicios.map((s) => String(s.service_id)),
      };
    },

    async reenviarCodigoActivacion(input: ReenviarCodigoActivacionRequest): Promise<ReenviarCodigoActivacionResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const pro = await leerPro(session.token, professionalId);
      if (pro.verification_status !== 'verified') throw new ServiceError('REENVIO_NO_DISPONIBLE');
      return { emailEnmascarado: maskEmail(session.email), reenvioDisponibleEnMs: null, reenviosRestantes: 0 };
    },

    async validarCodigoActivacion(input: ValidarCodigoActivacionRequest): Promise<ValidarCodigoActivacionResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const pro = await leerPro(session.token, professionalId);
      if (pro.verification_status !== 'verified' || !/^\d{6}$/.test(input.codigo)) {
        throw new ServiceError('CODIGO_INVALIDO');
      }
      return {
        profesionalId: String(professionalId),
        solicitudId: backendSolicitudId(professionalId),
        nombre: pro.display_name,
        email: session.email,
        estadoSolicitud: 'APROBADO',
        profesionalActivado: true,
      };
    },

    async obtenerAvisoCorreccion(input: ObtenerAvisoCorreccionRequest): Promise<ObtenerAvisoCorreccionResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const pro = await leerPro(session.token, professionalId);
      return { motivoRechazo: pro.verification_note ?? null };
    },

    async simularDecisionAdministrador(_input: SimularDecisionAdministradorRequest): Promise<EstadoVerificacionResponse> {
      // Solo demo en mocks: con token de profesional no se puede cambiar el
      // estado (lo hace el admin en Directus). Se mantiene el estado real.
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, _input.solicitudId);
      return estado(backendSolicitudId(professionalId));
    },

    async expirarCodigoActivacionDemo(input: ObtenerEstadoVerificacionRequest): Promise<EstadoVerificacionResponse> {
      return estado(input.solicitudId);
    },
  };
}
