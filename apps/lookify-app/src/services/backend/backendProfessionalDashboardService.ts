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
import { api, assetUrl, uploadFile } from '../../lib/backend/directus';
import { bffApi } from '../../lib/backend/bff';
import {
  clearBackendSession,
  loadBackendSession,
  resolveProfessionalId,
} from '../../lib/backend/session';
import { DProfessional } from '../../lib/backend/mapping';
import { disconnectRealtime, emitProOffline, ensureProOnline } from '../../lib/backend/realtime';
import { resumenDiaBackend } from './backendProfessionalEarningsHistoryService';
import { validarArchivoFotoPerfil } from '../../utils/profilePhotoFile';
import { FotoPerfilMimePermitido } from '../../constants/professionalProfilePhoto';

async function servicioActivo(token: string, _professionalId?: number): Promise<boolean> {
  const rows = await bffApi<unknown[]>('GET', '/api/bookings/pro/mine?status=accepted,in_progress', token);
  return rows.length > 0;
}

async function assertHabilitado(token: string, professionalId: number): Promise<DProfessional> {
  const pro = await api<DProfessional>(
    'GET',
    `/items/beauty_professionals/${professionalId}?fields=id,display_name,is_online,rating_avg,avatar,verification_status`,
    token,
    undefined,
    'SOLICITUD_NO_ENCONTRADA',
  );
  if (pro.verification_status !== 'verified') throw new ServiceError('PROFESIONAL_NO_HABILITADO');
  return pro;
}

export function createBackendProfessionalDashboardService(): ProfessionalDashboardService {
  return {
    async obtenerPanelPrincipal(input: ObtenerPanelPrincipalRequest): Promise<PanelPrincipalResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId, input.solicitudId);
      const pro = await assertHabilitado(session.token, professionalId);

      const [resenas, servicios] = await Promise.all([
        bffApi<{
          reviews: { rating: number; comment: string | null; author: string }[];
          total: number;
        }>('GET', '/api/professionals/me/reviews', session.token).catch(() => ({
          reviews: [],
          total: 0,
        })),
        api<{ service: { id: number; name: string; duration_min: number; price_base: number } }[]>(
          'GET',
          `/items/professional_services?filter[professional_id][_eq]=${professionalId}` +
            `&fields=service.id,service.name,service.duration_min,service.price_base&limit=100`,
          session.token,
        ).catch(() => []),
      ]);

      const totalResenas = resenas.total;
      const ultimasResenas: ResenaProfesional[] = resenas.reviews.slice(0, 3).map((r) => ({
        autor: r.author,
        texto: r.comment ?? '',
        estrellas: r.rating,
      }));
      const resumenDia = await resumenDiaBackend(session.token, professionalId);

      return {
        nombre: pro.display_name,
        calificacionPromedio: totalResenas > 0 ? (pro.rating_avg ?? null) : null,
        totalResenas,
        disponibilidad: pro.is_online ? 'DISPONIBLE' : 'OCUPADO',
        resumenDia: { ...resumenDia },
        ultimasResenas,
        serviciosOfrecidos: servicios
          .filter((s) => s.service)
          .map((s) => ({
            servicioId: String(s.service.id),
            nombre: s.service.name,
            duracionMin: s.service.duration_min,
            precioBaseCop: s.service.price_base,
          })),
        fotoPerfil: pro.avatar
          ? { uri: assetUrl(pro.avatar) ?? '', mimeType: 'image/jpeg' as FotoPerfilMimePermitido }
          : null,
      };
    },

    async cambiarDisponibilidad(input: CambiarDisponibilidadRequest): Promise<CambiarDisponibilidadResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId, input.solicitudId);
      if (input.disponibilidad === 'DISPONIBLE') {
        await assertHabilitado(session.token, professionalId);
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
      const fileId = await uploadFile(session.token, input.archivo.uri, `perfil-${professionalId}.jpg`, mimeType);
      await bffApi('PATCH', '/api/professionals/me', session.token, { avatar: fileId });
      // Directus no tiene revisión de foto (ver docs/adaptacion-backend.md).
      return { fotoPerfil: { uri: assetUrl(fileId) ?? input.archivo.uri, mimeType } };
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
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const pro = await api<DProfessional>(
        'GET',
        `/items/beauty_professionals/${professionalId}?fields=is_online`,
        session.token,
      );
      return { disponibilidad: pro.is_online ? 'DISPONIBLE' : 'OCUPADO' };
    },
  };
}
