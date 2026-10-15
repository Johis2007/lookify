export const PORTAFOLIO_MAX_FOTOS = 10;

export const PORTAFOLIO_MAX_VIDEOS = 4;

/** Aviso informativo mientras totalFotos sea menor a este valor. */
export const PORTAFOLIO_UMBRAL_FOTOS_AVISO = 3;

export const PORTAFOLIO_FOTO_MAX_BYTES = 5 * 1024 * 1024;

export const PORTAFOLIO_FOTO_MIME_PERMITIDOS = ['image/jpeg', 'image/png'] as const;

export type PortafolioFotoMimePermitido = (typeof PORTAFOLIO_FOTO_MIME_PERMITIDOS)[number];

export const PORTAFOLIO_FOTO_IMAGE_PICKER_QUALITY = 0.7;

export const PORTAFOLIO_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const PORTAFOLIO_VIDEO_MAX_DURACION_SEG = 30;

export const PORTAFOLIO_VIDEO_MIME_PERMITIDOS = ['video/mp4', 'video/quicktime'] as const;

export type PortafolioVideoMimePermitido = (typeof PORTAFOLIO_VIDEO_MIME_PERMITIDOS)[number];

export const PORTAFOLIO_DESCRIPCION_MAX_CHARS = 100;

export const PORTAFOLIO_AVISO_INFORMATIVO =
  'Los clientes confían más en profesionales con trabajos a la vista. Sube fotos para destacar.';
