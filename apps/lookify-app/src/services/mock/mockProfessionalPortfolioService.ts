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
import { getCatalogService } from '../catalogService';
import {
  getProfesionalBasicoBySolicitudId,
  getServiciosForSolicitud,
  isProfesionalActivado,
  solicitudExiste,
  getEstadoSolicitudForSolicitud,
} from './mockProfessionalRegistryStore';
import {
  actualizarItemInterno,
  agregarItemInterno,
  definirPortadaInterno,
  eliminarItemInterno,
  encontrarItem,
  listarItemsPublicos,
  moverItemInterno,
  reemplazarArchivoInterno,
} from './mockProfessionalPortfolioStore';

const MOCK_LATENCY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limitesResponse() {
  return {
    maxFotos: PORTAFOLIO_MAX_FOTOS,
    maxVideos: PORTAFOLIO_MAX_VIDEOS,
    umbralFotosAviso: PORTAFOLIO_UMBRAL_FOTOS_AVISO,
    maxDescripcionChars: PORTAFOLIO_DESCRIPCION_MAX_CHARS,
  } as const;
}

function assertSesion(profesionalId: string, solicitudId: string): void {
  if (!profesionalId || !solicitudId) {
    throw new ServiceError('VALIDATION');
  }
  if (!solicitudExiste(solicitudId)) {
    throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
  }
  const basico = getProfesionalBasicoBySolicitudId(solicitudId);
  if (!basico || basico.profesionalId !== profesionalId) {
    throw new ServiceError('VALIDATION');
  }
}

function assertProfesionalHabilitado(profesionalId: string, solicitudId: string): void {
  const estado = getEstadoSolicitudForSolicitud(solicitudId);
  if (estado !== 'APROBADO' || !isProfesionalActivado(profesionalId)) {
    throw new ServiceError('PROFESIONAL_NO_HABILITADO');
  }
}

async function serviciosAsociablesIds(solicitudId: string): Promise<Set<string>> {
  const ids = getServiciosForSolicitud(solicitudId) ?? [];
  return new Set(ids);
}

async function resolverServiciosAsociables(
  solicitudId: string
): Promise<ServicioAsociable[]> {
  const ids = getServiciosForSolicitud(solicitudId) ?? [];
  if (ids.length === 0) {
    return [];
  }
  const catalogo = await getCatalogService().listarServiciosPorCategoria();
  const out: ServicioAsociable[] = [];
  for (const servicioId of ids) {
    for (const cat of catalogo) {
      const s = cat.servicios.find((x) => x.id === servicioId);
      if (s) {
        out.push({ servicioId: s.id, nombre: s.nombre });
        break;
      }
    }
  }
  return out;
}

function validarDescripcion(descripcion: string | undefined): string | undefined {
  if (descripcion === undefined) {
    return undefined;
  }
  const trimmed = descripcion.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.length > PORTAFOLIO_DESCRIPCION_MAX_CHARS) {
    throw new ServiceError('VALIDATION');
  }
  return trimmed;
}

async function assertServicioIdValido(
  solicitudId: string,
  servicioId: string | null | undefined
): Promise<void> {
  if (servicioId === undefined) {
    return;
  }
  if (servicioId === null) {
    return;
  }
  const permitidos = await serviciosAsociablesIds(solicitudId);
  if (!permitidos.has(servicioId)) {
    throw new ServiceError('VALIDATION');
  }
}

function buildResponse(profesionalId: string): PortfolioResponse {
  const fotos = listarItemsPublicos(profesionalId, 'FOTO');
  const videos = listarItemsPublicos(profesionalId, 'VIDEO');
  return {
    fotos,
    videos,
    limites: limitesResponse(),
    totalFotos: fotos.length,
    totalVideos: videos.length,
  };
}

export function createMockProfessionalPortfolioService(): ProfessionalPortfolioService {
  return {
    async obtenerPortafolio(input: ObtenerPortafolioRequest): Promise<PortfolioResponse> {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      return buildResponse(input.profesionalId);
    },

    async listarServiciosAsociables(
      input: ListarServiciosAsociablesRequest
    ): Promise<ServicioAsociable[]> {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      return resolverServiciosAsociables(input.solicitudId);
    },

    async agregarFoto(input: AgregarFotoRequest) {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      const fotos = listarItemsPublicos(input.profesionalId, 'FOTO');
      if (fotos.length >= PORTAFOLIO_MAX_FOTOS) {
        throw new ServiceError('LIMITE_FOTOS_PORTAFOLIO');
      }
      const val = await validarArchivoPortafolioFoto(
        input.archivo.uri,
        input.archivo.mimeType,
        input.archivo.sizeBytes
      );
      if (val === 'invalido') {
        throw new ServiceError('ARCHIVO_INVALIDO');
      }
      if (val === 'muy_grande') {
        throw new ServiceError('ARCHIVO_MUY_GRANDE');
      }
      return agregarItemInterno(input.profesionalId, 'FOTO', {
        uri: input.archivo.uri,
        mimeType: input.archivo.mimeType,
        sizeBytes: input.archivo.sizeBytes,
      });
    },

    async agregarVideo(input: AgregarVideoRequest) {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      const videos = listarItemsPublicos(input.profesionalId, 'VIDEO');
      if (videos.length >= PORTAFOLIO_MAX_VIDEOS) {
        throw new ServiceError('LIMITE_VIDEOS_PORTAFOLIO');
      }
      const val = await validarArchivoPortafolioVideo(
        input.archivo.uri,
        input.archivo.mimeType,
        input.archivo.duracionSeg,
        input.archivo.sizeBytes
      );
      if (val === 'invalido') {
        throw new ServiceError('ARCHIVO_INVALIDO');
      }
      if (val === 'muy_grande') {
        throw new ServiceError('ARCHIVO_MUY_GRANDE');
      }
      if (val === 'duracion_excedida') {
        throw new ServiceError('VIDEO_DURACION_EXCEDIDA');
      }
      return agregarItemInterno(input.profesionalId, 'VIDEO', {
        uri: input.archivo.uri,
        mimeType: input.archivo.mimeType,
        sizeBytes: input.archivo.sizeBytes,
        duracionSeg: input.archivo.duracionSeg,
      });
    },

    async actualizarItem(input: ActualizarPortfolioItemRequest) {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      if (!encontrarItem(input.profesionalId, input.itemId)) {
        throw new ServiceError('ITEM_PORTAFOLIO_NO_ENCONTRADO');
      }
      await assertServicioIdValido(input.solicitudId, input.servicioId);
      const descripcion =
        input.descripcion !== undefined ? validarDescripcion(input.descripcion) : undefined;
      return actualizarItemInterno(input.profesionalId, input.itemId, {
        descripcion,
        servicioId: input.servicioId,
      });
    },

    async eliminarItem(input: EliminarPortfolioItemRequest): Promise<void> {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      if (!encontrarItem(input.profesionalId, input.itemId)) {
        throw new ServiceError('ITEM_PORTAFOLIO_NO_ENCONTRADO');
      }
      eliminarItemInterno(input.profesionalId, input.itemId);
    },

    async reemplazarArchivo(input: ReemplazarArchivoPortfolioRequest) {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      const found = encontrarItem(input.profesionalId, input.itemId);
      if (!found) {
        throw new ServiceError('ITEM_PORTAFOLIO_NO_ENCONTRADO');
      }
      if (found.tipo === 'FOTO') {
        const val = await validarArchivoPortafolioFoto(
          input.archivo.uri,
          input.archivo.mimeType,
          input.archivo.sizeBytes
        );
        if (val === 'invalido') {
          throw new ServiceError('ARCHIVO_INVALIDO');
        }
        if (val === 'muy_grande') {
          throw new ServiceError('ARCHIVO_MUY_GRANDE');
        }
      } else {
        const val = await validarArchivoPortafolioVideo(
          input.archivo.uri,
          input.archivo.mimeType,
          input.archivo.duracionSeg,
          input.archivo.sizeBytes
        );
        if (val === 'invalido') {
          throw new ServiceError('ARCHIVO_INVALIDO');
        }
        if (val === 'muy_grande') {
          throw new ServiceError('ARCHIVO_MUY_GRANDE');
        }
        if (val === 'duracion_excedida') {
          throw new ServiceError('VIDEO_DURACION_EXCEDIDA');
        }
      }
      return reemplazarArchivoInterno(input.profesionalId, input.itemId, input.archivo);
    },

    async moverItem(input: MoverPortfolioItemRequest) {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      if (!encontrarItem(input.profesionalId, input.itemId)) {
        throw new ServiceError('ITEM_PORTAFOLIO_NO_ENCONTRADO');
      }
      moverItemInterno(input.profesionalId, input.itemId, input.direccion);
      return buildResponse(input.profesionalId);
    },

    async definirPortada(input: DefinirPortadaRequest) {
      await delay(MOCK_LATENCY_MS);
      assertSesion(input.profesionalId, input.solicitudId);
      assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
      const found = encontrarItem(input.profesionalId, input.itemId);
      if (!found) {
        throw new ServiceError('ITEM_PORTAFOLIO_NO_ENCONTRADO');
      }
      if (found.tipo !== 'FOTO') {
        throw new ServiceError('VALIDATION');
      }
      definirPortadaInterno(input.profesionalId, input.itemId);
      return buildResponse(input.profesionalId);
    },
  };
}
