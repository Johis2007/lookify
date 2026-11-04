import { bffApi } from '../../lib/backend/bff';
import { deleteFile, fileHeaders, fileUrl, uploadFile } from '../../lib/backend/directus';
import { loadBackendSession } from '../../lib/backend/session';
import {
  PORTAFOLIO_DESCRIPCION_MAX_CHARS,
  PORTAFOLIO_MAX_FOTOS,
  PORTAFOLIO_MAX_VIDEOS,
  PORTAFOLIO_UMBRAL_FOTOS_AVISO,
} from '../../constants/professionalPortfolio';
import {
  ActualizarPortfolioItemRequest,
  AgregarFotoRequest,
  AgregarVideoRequest,
  DefinirPortadaRequest,
  EliminarPortfolioItemRequest,
  ListarServiciosAsociablesRequest,
  MoverPortfolioItemRequest,
  ObtenerPortafolioRequest,
  PortfolioItem,
  PortfolioResponse,
  ReemplazarArchivoPortfolioRequest,
  ServicioAsociable,
} from '../../types/professionalPortfolio';
import {
  validarArchivoPortafolioFoto,
  validarArchivoPortafolioVideo,
} from '../../utils/portfolioFile';
import { ServiceError } from '../errors';
import { ProfessionalPortfolioService } from '../professionalPortfolioService';

type PortfolioItemDto = {
  id: number;
  kind: 'photo' | 'video';
  file: string;
  caption: string | null;
  serviceId: number | null;
  sortOrder: number;
  durationSec: number | null;
  mime: string | null;
  size: number | null;
};

type ServiceDto = {
  serviceId: number;
  name: string;
};

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/mp4') return 'mp4';
  return 'jpg';
}

function fileNameFromUri(uri: string, mime: string): string {
  const raw = uri.split('?')[0]?.split('/').pop();
  if (raw) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return `portfolio.${extensionFor(mime)}`;
}

function toPortfolioItem(dto: PortfolioItemDto, token: string): PortfolioItem {
  return {
    id: String(dto.id),
    tipo: dto.kind === 'photo' ? 'FOTO' : 'VIDEO',
    orden: dto.sortOrder,
    ...(dto.caption ? { descripcion: dto.caption } : {}),
    ...(dto.serviceId !== null ? { servicioId: String(dto.serviceId) } : {}),
    uri: fileUrl(dto.file) as string,
    headers: fileHeaders(token),
    fileId: dto.file,
    mimeType: dto.mime ?? (dto.kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
    ...(dto.size !== null ? { sizeBytes: dto.size } : {}),
    ...(dto.durationSec !== null ? { duracionSeg: dto.durationSec } : {}),
    esPortada: dto.kind === 'photo' && dto.sortOrder === 0,
  };
}

function buildResponse(items: PortfolioItemDto[], token: string): PortfolioResponse {
  const mapped = items.map((item) => toPortfolioItem(item, token));
  const fotos = mapped
    .filter((item) => item.tipo === 'FOTO')
    .sort((a, b) => a.orden - b.orden);
  const videos = mapped
    .filter((item) => item.tipo === 'VIDEO')
    .sort((a, b) => a.orden - b.orden);
  return {
    fotos,
    videos,
    limites: {
      maxFotos: PORTAFOLIO_MAX_FOTOS,
      maxVideos: PORTAFOLIO_MAX_VIDEOS,
      umbralFotosAviso: PORTAFOLIO_UMBRAL_FOTOS_AVISO,
      maxDescripcionChars: PORTAFOLIO_DESCRIPCION_MAX_CHARS,
    },
    totalFotos: fotos.length,
    totalVideos: videos.length,
  };
}

function assertPortfolioError(value: string): never {
  if (value === 'ARCHIVO_INVALIDO') throw new ServiceError('ARCHIVO_INVALIDO');
  if (value === 'ARCHIVO_MUY_GRANDE') throw new ServiceError('ARCHIVO_MUY_GRANDE');
  if (value === 'VIDEO_DURACION_EXCEDIDA') throw new ServiceError('VIDEO_DURACION_EXCEDIDA');
  throw new ServiceError('VALIDATION');
}

export function createBackendProfessionalPortfolioService(): ProfessionalPortfolioService {
  const tokenSesion = async (): Promise<string> => {
    const session = await loadBackendSession();
    if (!session?.token) throw new ServiceError('INVALID_CREDENTIALS');
    return session.token;
  };

  const listarDto = async (token: string): Promise<PortfolioItemDto[]> =>
    bffApi<PortfolioItemDto[]>('GET', '/api/professionals/me/portfolio', token);

  const buscarDto = async (token: string, itemId: string): Promise<PortfolioItemDto> => {
    const items = await listarDto(token);
    const found = items.find((item) => String(item.id) === itemId);
    if (!found) throw new ServiceError('ITEM_PORTAFOLIO_NO_ENCONTRADO');
    return found;
  };

  const subir = async (
    token: string,
    archivo: { uri: string; mimeType: string },
  ): Promise<string> =>
    uploadFile(
      token,
      archivo.uri,
      fileNameFromUri(archivo.uri, archivo.mimeType),
      archivo.mimeType,
      'portfolio',
    );

  return {
    async obtenerPortafolio(_input: ObtenerPortafolioRequest): Promise<PortfolioResponse> {
      const token = await tokenSesion();
      return buildResponse(await listarDto(token), token);
    },

    async listarServiciosAsociables(
      _input: ListarServiciosAsociablesRequest,
    ): Promise<ServicioAsociable[]> {
      const token = await tokenSesion();
      const rows = await bffApi<ServiceDto[]>('GET', '/api/professionals/me/services', token);
      return rows.map((row) => ({
        servicioId: String(row.serviceId),
        nombre: row.name,
      }));
    },

    async agregarFoto(input: AgregarFotoRequest): Promise<PortfolioItem> {
      const token = await tokenSesion();
      const valid = await validarArchivoPortafolioFoto(
        input.archivo.uri,
        input.archivo.mimeType,
        input.archivo.sizeBytes,
      );
      if (valid !== 'ok') assertPortfolioError(valid === 'muy_grande' ? 'ARCHIVO_MUY_GRANDE' : 'ARCHIVO_INVALIDO');
      const file = await subir(token, input.archivo);
      const dto = await bffApi<PortfolioItemDto>(
        'POST',
        '/api/professionals/me/portfolio',
        token,
        { file, kind: 'photo' },
      );
      return toPortfolioItem(dto, token);
    },

    async agregarVideo(input: AgregarVideoRequest): Promise<PortfolioItem> {
      const token = await tokenSesion();
      const valid = await validarArchivoPortafolioVideo(
        input.archivo.uri,
        input.archivo.mimeType,
        input.archivo.duracionSeg,
        input.archivo.sizeBytes,
      );
      if (valid !== 'ok') {
        if (valid === 'muy_grande') assertPortfolioError('ARCHIVO_MUY_GRANDE');
        if (valid === 'duracion_excedida') assertPortfolioError('VIDEO_DURACION_EXCEDIDA');
        assertPortfolioError('ARCHIVO_INVALIDO');
      }
      const file = await subir(token, input.archivo);
      const dto = await bffApi<PortfolioItemDto>(
        'POST',
        '/api/professionals/me/portfolio',
        token,
        {
          file,
          kind: 'video',
          ...(input.archivo.duracionSeg !== undefined
            ? { durationSec: input.archivo.duracionSeg }
            : {}),
        },
      );
      return toPortfolioItem(dto, token);
    },

    async actualizarItem(input: ActualizarPortfolioItemRequest): Promise<PortfolioItem> {
      const token = await tokenSesion();
      const body: Record<string, unknown> = {};
      if (input.descripcion !== undefined) body.caption = input.descripcion;
      if (input.servicioId !== undefined) {
        if (input.servicioId === null) {
          body.serviceId = null;
        } else {
          const serviceId = Number(input.servicioId);
          if (!Number.isInteger(serviceId) || serviceId <= 0) throw new ServiceError('VALIDATION');
          body.serviceId = serviceId;
        }
      }
      if (Object.keys(body).length === 0) throw new ServiceError('VALIDATION');
      const dto = await bffApi<PortfolioItemDto>(
        'PATCH',
        `/api/professionals/me/portfolio/${encodeURIComponent(input.itemId)}`,
        token,
        body,
      );
      return toPortfolioItem(dto, token);
    },

    async eliminarItem(input: EliminarPortfolioItemRequest): Promise<void> {
      const token = await tokenSesion();
      const found = await buscarDto(token, input.itemId);
      await bffApi(
        'DELETE',
        `/api/professionals/me/portfolio/${encodeURIComponent(input.itemId)}`,
        token,
      );
      await deleteFile(token, found.file);
    },

    async reemplazarArchivo(
      input: ReemplazarArchivoPortfolioRequest,
    ): Promise<PortfolioItem> {
      const token = await tokenSesion();
      const found = await buscarDto(token, input.itemId);
      if (found.kind === 'photo') {
        const valid = await validarArchivoPortafolioFoto(
          input.archivo.uri,
          input.archivo.mimeType,
          input.archivo.sizeBytes,
        );
        if (valid !== 'ok') {
          assertPortfolioError(valid === 'muy_grande' ? 'ARCHIVO_MUY_GRANDE' : 'ARCHIVO_INVALIDO');
        }
      } else {
        const valid = await validarArchivoPortafolioVideo(
          input.archivo.uri,
          input.archivo.mimeType,
          input.archivo.duracionSeg,
          input.archivo.sizeBytes,
        );
        if (valid !== 'ok') {
          if (valid === 'muy_grande') assertPortfolioError('ARCHIVO_MUY_GRANDE');
          if (valid === 'duracion_excedida') assertPortfolioError('VIDEO_DURACION_EXCEDIDA');
          assertPortfolioError('ARCHIVO_INVALIDO');
        }
      }
      const file = await subir(token, input.archivo);
      const dto = await bffApi<PortfolioItemDto>(
        'PUT',
        `/api/professionals/me/portfolio/${encodeURIComponent(input.itemId)}/file`,
        token,
        {
          file,
          ...(found.kind === 'video' && input.archivo.duracionSeg !== undefined
            ? { durationSec: input.archivo.duracionSeg }
            : {}),
        },
      );
      await deleteFile(token, found.file);
      return toPortfolioItem(dto, token);
    },

    async moverItem(input: MoverPortfolioItemRequest): Promise<PortfolioResponse> {
      const token = await tokenSesion();
      const items = await bffApi<PortfolioItemDto[]>(
        'POST',
        `/api/professionals/me/portfolio/${encodeURIComponent(input.itemId)}/move`,
        token,
        { direction: input.direccion === 'ARRIBA' ? 'up' : 'down' },
      );
      return buildResponse(items, token);
    },

    async definirPortada(input: DefinirPortadaRequest): Promise<PortfolioResponse> {
      const token = await tokenSesion();
      const items = await bffApi<PortfolioItemDto[]>(
        'POST',
        `/api/professionals/me/portfolio/${encodeURIComponent(input.itemId)}/cover`,
        token,
      );
      return buildResponse(items, token);
    },
  };
}
