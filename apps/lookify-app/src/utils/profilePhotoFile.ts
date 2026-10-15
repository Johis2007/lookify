import {
  FOTO_PERFIL_MAX_BYTES,
  FOTO_PERFIL_MIME_PERMITIDOS,
  FotoPerfilMimePermitido,
} from '../constants/professionalProfilePhoto';
import { resolverSizeBytes, validarTamanoCertificado } from './certificateFile';

export function esMimeFotoPerfilPermitido(mime: string): mime is FotoPerfilMimePermitido {
  return (FOTO_PERFIL_MIME_PERMITIDOS as readonly string[]).includes(mime);
}

export async function validarArchivoFotoPerfil(
  uri: string,
  mimeType: string,
  sizeFromPicker?: number
): Promise<'ok' | 'invalido' | 'muy_grande'> {
  if (!esMimeFotoPerfilPermitido(mimeType)) {
    return 'invalido';
  }
  const sizeBytes = await resolverSizeBytes(uri, sizeFromPicker);
  const tam = validarTamanoCertificado(sizeBytes);
  if (tam === 'muy_grande') {
    return 'muy_grande';
  }
  if (tam === 'invalido') {
    return 'invalido';
  }
  if (sizeBytes != null && sizeBytes > FOTO_PERFIL_MAX_BYTES) {
    return 'muy_grande';
  }
  return 'ok';
}
