// src/services/backend/backendProfessionalDashboardService.ts
// Panel real: beauty_professionals + reviews + bookings de hoy +
// professional_services. Foto a /files + avatar. Cierre: offline + socket.

import {
  ProfessionalDashboardService,
} from '../professionalDashboardService';
import {
  ActualizarFotoPerfilRequest,
  ActualizarFotoPerfilResponse,
  CambiarDisponibilidadRequest,
  CambiarDisponibilidadResponse,
  ConsultarDisponibilidadRequest,
  ConsultarDisponibilidadResponse,
  ObtenerPanelPrincipalRequest,
  PanelPrincipalResponse,
  RegistrarCierreSesionRequest,
} from '../../types/professionalDashboard';
import { ResenaProfesional } from '../../types/professionalReview';
import { ServiceError } from '../errors';
import { fileHeaders, fileUrl, uploadFile } from '../../lib/backend/directus';
import { bffApi } from '../../lib/backend/bff';
import {
  clearBackendSession,
  loadBackendSession,
  resolveProfessionalId,
} from '../../lib/backend/session';
import { disconnectRealtime, emitProOffline, ensureProOnline } from '../../lib/backend/realtime';
import { resumenDiaBackend } from './backendProfessionalEarningsHistoryService';
import { validarArchivoFotoPerfil } from '../../utils/profilePhotoFile';
import { FotoPerfilMimePermitido } from '../../constants/professionalProfilePhoto';

type ProPanel = {
  id: number;
  displayName: string | null;
  avatar: string | null;
  isOnline: boolean | null;
  ratingAvg: number | null;
  verificationStatus: string | null;
};

type ServicioPro = { serviceId: number; name: string; durationMin: number | null; priceBase: number | null };

async function servicioActivo(token: string, _professionalId?: number): Promise<boolean> {
  const rows = await bffApi<unknown[]>('GET', '/api/bookings/pro/mine?status=accepted,in_progress', token);
  return rows.length > 0;
}

async function assertHabilitado(token: string): Promise<ProPanel> {
  const pro = await bffApi<ProPanel>(
    'GET',
    '/api/professionals/me',
    token,
    undefined,
    'SOLICITUD_NO_ENCONTRADA',
  );
  if (pro.verificationStatus !== 'verified') throw new ServiceError('PROFESIONAL_NO_HABILITADO');
  return pro;
}

export function createBackendProfessionalDashboardService(): ProfessionalDashboardService {
  return {
    async obtenerPanelPrincipal(input: ObtenerPanelPrincipalRequest): Promise<PanelPrincipalResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId, input.solicitudId);
      const pro = await assertHabilitado(session.token);

      const [resenas, servicios] = await Promise.all([
        bffApi<{
          reviews: { rating: number; comment: string | null; author: string }[];
          total: number;
        }>('GET', '/api/professionals/me/reviews', session.token).catch(() => ({
          reviews: [],
          total: 0,
        })),
        bffApi<ServicioPro[]>('GET', '/api/professionals/me/services', session.token).catch(() => []),
      ]);

      const totalResenas = resenas.total;
      const ultimasResenas: ResenaProfesional[] = resenas.reviews.slice(0, 3).map((r) => ({
        autor: r.author,
        texto: r.comment ?? '',
        estrellas: r.rating,
      }));
      const resumenDia = await resumenDiaBackend(session.token, professionalId);

      return {
        nombre: pro.displayName ?? '',
        calificacionPromedio: totalResenas > 0 ? (pro.ratingAvg ?? null) : null,
        totalResenas,
        disponibilidad: pro.isOnline ? 'DISPONIBLE' : 'OCUPADO',
        resumenDia: { ...resumenDia },
        ultimasResenas,
        serviciosOfrecidos: servicios.map((s) => ({
          servicioId: String(s.serviceId),
          nombre: s.name,
          duracionMin: s.durationMin ?? 0,
          precioBaseCop: s.priceBase ?? 0,
        })),
        fotoPerfil: pro.avatar
          ? {
              uri: fileUrl(pro.avatar) ?? '',
              mimeType: 'image/jpeg' as FotoPerfilMimePermitido,
              headers: fileHeaders(session.token),
            }
          : null,
      };
    },

    async cambiarDisponibilidad(input: CambiarDisponibilidadRequest): Promise<CambiarDisponibilidadResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId, input.solicitudId);
      if (input.disponibilidad === 'DISPONIBLE') {
        await assertHabilitado(session.token);
        if (await servicioActivo(session.token, professionalId)) {
          throw new ServiceError('SERVICIO_EN_CURSO_ACTIVO');
        }
        await bffApi('PATCH', '/api/professionals/me', session.token, { isOnline: true });
        ensureProOnline();
      } else {
        await bffApi('PATCH', '/api/professionals/me', session.token, { isOnline: false });
        emitProOffline();
      }
      return { disponibilidad: input.disponibilidad };
    },

    async actualizarFotoPerfil(input: ActualizarFotoPerfilRequest): Promise<ActualizarFotoPerfilResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      if (!input.archivo?.uri) throw new ServiceError('VALIDATION');
      const tam = await validarArchivoFotoPerfil(input.archivo.uri, input.archivo.mimeType, input.archivo.sizeBytes);
      if (tam === 'muy_grande') throw new ServiceError('ARCHIVO_MUY_GRANDE');
      if (tam === 'invalido') throw new ServiceError('ARCHIVO_INVALIDO');
      const mimeType = input.archivo.mimeType as FotoPerfilMimePermitido;
      const fileId = await uploadFile(
        session.token,
        input.archivo.uri,
        `perfil-${professionalId}.jpg`,
        mimeType,
        'avatar',
      );
      await bffApi('PATCH', '/api/professionals/me', session.token, { avatar: fileId });
      // Directus no tiene revisión de foto (ver docs/adaptacion-backend.md).
      return {
        fotoPerfil: {
          uri: fileUrl(fileId) ?? input.archivo.uri,
          mimeType,
          headers: fileHeaders(session.token),
        },
      };
    },

    async registrarCierreSesion(input: RegistrarCierreSesionRequest): Promise<void> {
      const session = await loadBackendSession();
      if (!session) return;
      const professionalId = await resolveProfessionalId(input.profesionalId);
      if (await servicioActivo(session.token, professionalId)) {
        throw new ServiceError('SERVICIO_EN_CURSO_ACTIVO');
      }
      await bffApi('PATCH', '/api/professionals/me', session.token, { isOnline: false }).catch(() => undefined);
      disconnectRealtime();
      await clearBackendSession();
    },

    async consultarDisponibilidad(input: ConsultarDisponibilidadRequest): Promise<ConsultarDisponibilidadResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const pro = await bffApi<{ isOnline: boolean | null }>(
        'GET',
        '/api/professionals/me',
        session.token,
        undefined,
        'SOLICITUD_NO_ENCONTRADA',
      );
      return { disponibilidad: pro.isOnline ? 'DISPONIBLE' : 'OCUPADO' };
    },
  };
}
