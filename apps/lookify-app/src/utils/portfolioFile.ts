import {
  PORTAFOLIO_FOTO_MAX_BYTES,
  PORTAFOLIO_FOTO_MIME_PERMITIDOS,
  PortafolioFotoMimePermitido,
  PORTAFOLIO_VIDEO_MAX_BYTES,
  PORTAFOLIO_VIDEO_MAX_DURACION_SEG,
  PORTAFOLIO_VIDEO_MIME_PERMITIDOS,
  PortafolioVideoMimePermitido,
} from '../constants/professionalPortfolio';
import { resolverSizeBytes } from './certificateFile';

export function esMimePortafolioFotoPermitido(mime: string): mime is PortafolioFotoMimePermitido {
  return (PORTAFOLIO_FOTO_MIME_PERMITIDOS as readonly string[]).includes(mime);
}

export function esMimePortafolioVideoPermitido(mime: string): mime is PortafolioVideoMimePermitido {
  return (PORTAFOLIO_VIDEO_MIME_PERMITIDOS as readonly string[]).includes(mime);
}

export function normalizarDuracionSegDesdePicker(durationMs?: number | null): number | undefined {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return undefined;
  }
  return durationMs / 1000;
}

export async function validarArchivoPortafolioFoto(
  uri: string,
  mimeType: string,
  sizeFromPicker?: number
): Promise<'ok' | 'invalido' | 'muy_grande'> {
  if (!esMimePortafolioFotoPermitido(mimeType)) {
    return 'invalido';
  }
  const sizeBytes = await resolverSizeBytes(uri, sizeFromPicker);
  if (sizeBytes == null || sizeBytes <= 0) {
    return 'invalido';
  }
  if (sizeBytes > PORTAFOLIO_FOTO_MAX_BYTES) {
    return 'muy_grande';
  }
  return 'ok';
}

export async function validarArchivoPortafolioVideo(
  uri: string,
  mimeType: string,
  duracionSeg: number | undefined,
  sizeFromPicker?: number
): Promise<'ok' | 'invalido' | 'muy_grande' | 'duracion_excedida'> {
  if (!esMimePortafolioVideoPermitido(mimeType)) {
    return 'invalido';
  }
  const sizeBytes = await resolverSizeBytes(uri, sizeFromPicker);
  if (sizeBytes == null || sizeBytes <= 0) {
    return 'invalido';
  }
  if (sizeBytes > PORTAFOLIO_VIDEO_MAX_BYTES) {
    return 'muy_grande';
  }
  if (duracionSeg == null || !Number.isFinite(duracionSeg) || duracionSeg <= 0) {
    return 'invalido';
  }
  if (duracionSeg > PORTAFOLIO_VIDEO_MAX_DURACION_SEG) {
    return 'duracion_excedida';
  }
  return 'ok';
}
