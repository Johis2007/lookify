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
import { bffApi } from '../../lib/backend/bff';
import {
  backendSolicitudId,
  loadBackendSession,
  resolveProfessionalId,
} from '../../lib/backend/session';
import { maskEmail } from '../../utils/maskEmail';

type ProRow = {
  id: number;
  displayName: string;
  verificationStatus?: 'pending' | 'verified' | 'rejected' | null;
  verificationNote?: string | null;
};

async function leerPro(token: string): Promise<ProRow> {
  return bffApi<ProRow>(
    'GET',
    '/api/professionals/me',
    token,
    undefined,
    'SOLICITUD_NO_ENCONTRADA',
  );
}

async function resumenEnvio(token: string): Promise<{ cantidadCertificados: number; cantidadServicios: number; servicioIds: string[] }> {
  const [docs, servicios] = await Promise.all([
    bffApi<unknown[]>('GET', '/api/professionals/me/documents', token).catch(() => []),
    bffApi<{ serviceId: number }[]>('GET', '/api/professionals/me/services', token).catch(() => []),
  ]);
  const servicioIds = [...new Set(servicios.map((s) => String(s.serviceId)))];
  return { cantidadCertificados: docs.length, cantidadServicios: servicioIds.length, servicioIds };
}

export function createBackendProfessionalVerificationService(): ProfessionalVerificationService {
  async function estado(solicitudId: string): Promise<EstadoVerificacionResponse> {
    const session = await loadBackendSession();
    if (!session) throw new ServiceError('INVALID_CREDENTIALS');
    const professionalId = await resolveProfessionalId(undefined, solicitudId);
    const pro = await leerPro(session.token);
    const sid = backendSolicitudId(professionalId);
    const base = {
      solicitudId: sid,
      profesionalId: String(professionalId),
      nombre: pro.displayName,
      emailEnmascarado: maskEmail(session.email),
    };
    if (pro.verificationStatus === 'verified') {
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
    if (pro.verificationStatus === 'rejected') {
      return {
        ...base,
        estadoSolicitud: 'RECHAZADO',
        profesionalActivado: false,
        rechazo: { motivo: pro.verificationNote ?? 'Documentación rechazada.', serviciosAfectadosIds: [] },
      };
    }
    const docs = await bffApi<unknown[]>(
      'GET',
      '/api/professionals/me/documents',
      session.token,
    ).catch(() => []);
    return {
      ...base,
      estadoSolicitud: docs.length > 0 ? 'EN_REVISION' : 'DOCUMENTOS_PENDIENTES',
      profesionalActivado: false,
      resumen: await resumenEnvio(session.token),
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
      const pro = await leerPro(session.token);
      if (pro.verificationStatus !== 'rejected') throw new ServiceError('VALIDATION');
      await bffApi('PATCH', '/api/professionals/me', session.token, {
        verificationStatus: 'pending',
      });
      const servicios = await bffApi<{ serviceId: number }[]>(
        'GET',
        '/api/professionals/me/services',
        session.token,
      ).catch(() => []);
      return {
        profesionalId: String(professionalId),
        solicitudId: backendSolicitudId(professionalId),
        nombre: pro.displayName,
        email: session.email,
        estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
        onboardingPaso: 'CERTIFICADOS',
        servicioIds: servicios.map((s) => String(s.serviceId)),
      };
    },

    async reenviarCodigoActivacion(input: ReenviarCodigoActivacionRequest): Promise<ReenviarCodigoActivacionResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const pro = await leerPro(session.token);
      if (pro.verificationStatus !== 'verified') throw new ServiceError('REENVIO_NO_DISPONIBLE');
      return { emailEnmascarado: maskEmail(session.email), reenvioDisponibleEnMs: null, reenviosRestantes: 0 };
    },

    async validarCodigoActivacion(input: ValidarCodigoActivacionRequest): Promise<ValidarCodigoActivacionResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const pro = await leerPro(session.token);
      if (pro.verificationStatus !== 'verified' || !/^\d{6}$/.test(input.codigo)) {
        throw new ServiceError('CODIGO_INVALIDO');
      }
      return {
        profesionalId: String(professionalId),
        solicitudId: backendSolicitudId(professionalId),
        nombre: pro.displayName,
        email: session.email,
        estadoSolicitud: 'APROBADO',
        profesionalActivado: true,
      };
    },

    async obtenerAvisoCorreccion(input: ObtenerAvisoCorreccionRequest): Promise<ObtenerAvisoCorreccionResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const pro = await leerPro(session.token);
      return { motivoRechazo: pro.verificationNote ?? null };
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
