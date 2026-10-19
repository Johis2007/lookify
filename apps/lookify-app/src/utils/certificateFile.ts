import * as FileSystem from 'expo-file-system/legacy';
import {
  CERTIFICADO_MAX_BYTES,
  CERTIFICADO_MIME_PERMITIDOS,
  CertificadoMimePermitido,
} from '../constants/certificateUpload';

export function esMimeCertificadoPermitido(mime: string): mime is CertificadoMimePermitido {
  return (CERTIFICADO_MIME_PERMITIDOS as readonly string[]).includes(mime);
}

export async function resolverSizeBytes(uri: string, sizeFromPicker?: number): Promise<number | null> {
  if (sizeFromPicker != null && Number.isFinite(sizeFromPicker) && sizeFromPicker > 0) {
    return sizeFromPicker;
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info && typeof info.size === 'number' && info.size > 0) {
      return info.size;
    }
  } catch {
    return null;
  }
  return null;
}

export function validarTamanoCertificado(sizeBytes: number | null): 'ok' | 'invalido' | 'muy_grande' {
  if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return 'invalido';
  }
  if (sizeBytes > CERTIFICADO_MAX_BYTES) {
    return 'muy_grande';
  }
  return 'ok';
}
