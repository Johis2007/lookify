import {
  PORTAFOLIO_DESCRIPCION_MAX_CHARS,
  PORTAFOLIO_MAX_FOTOS,
  PORTAFOLIO_MAX_VIDEOS,
  PORTAFOLIO_UMBRAL_FOTOS_AVISO,
} from '../constants/professionalPortfolio';

export type PortfolioMediaTipo = 'FOTO' | 'VIDEO';

export type PortfolioArchivoEntrada = {
  uri: string;
  mimeType: string;
  sizeBytes?: number;
  /** Duración en segundos; obligatoria para videos cuando el picker la provee. */
  duracionSeg?: number;
};

export type PortfolioItem = {
  id: string;
  tipo: PortfolioMediaTipo;
  orden: number;
  descripcion?: string;
  servicioId?: string;
  uri: string;
  mimeType: string;
  sizeBytes?: number;
  duracionSeg?: number;
  /** Solo fotos: true cuando orden === 0 tras normalizar. */
  esPortada: boolean;
};

export type PortfolioLimites = {
  maxFotos: typeof PORTAFOLIO_MAX_FOTOS;
  maxVideos: typeof PORTAFOLIO_MAX_VIDEOS;
  umbralFotosAviso: typeof PORTAFOLIO_UMBRAL_FOTOS_AVISO;
  maxDescripcionChars: typeof PORTAFOLIO_DESCRIPCION_MAX_CHARS;
};

export type PortfolioResponse = {
  fotos: PortfolioItem[];
  videos: PortfolioItem[];
  limites: PortfolioLimites;
  totalFotos: number;
  totalVideos: number;
};

export type ServicioAsociable = {
  servicioId: string;
  nombre: string;
};

export type ObtenerPortafolioRequest = {
  profesionalId: string;
  solicitudId: string;
};

export type ListarServiciosAsociablesRequest = {
  profesionalId: string;
  solicitudId: string;
};

export type AgregarFotoRequest = {
  profesionalId: string;
  solicitudId: string;
  archivo: PortfolioArchivoEntrada;
};

export type AgregarVideoRequest = {
  profesionalId: string;
  solicitudId: string;
  archivo: PortfolioArchivoEntrada;
};

export type ActualizarPortfolioItemRequest = {
  profesionalId: string;
  solicitudId: string;
  itemId: string;
  descripcion?: string;
  /** null quita la asociación; omitir = no cambiar. */
  servicioId?: string | null;
};

export type EliminarPortfolioItemRequest = {
  profesionalId: string;
  solicitudId: string;
  itemId: string;
};

export type ReemplazarArchivoPortfolioRequest = {
  profesionalId: string;
  solicitudId: string;
  itemId: string;
  archivo: PortfolioArchivoEntrada;
};

export type MoverPortfolioItemDireccion = 'ARRIBA' | 'ABAJO';

export type MoverPortfolioItemRequest = {
  profesionalId: string;
  solicitudId: string;
  itemId: string;
  direccion: MoverPortfolioItemDireccion;
};

export type DefinirPortadaRequest = {
  profesionalId: string;
  solicitudId: string;
  itemId: string;
};
