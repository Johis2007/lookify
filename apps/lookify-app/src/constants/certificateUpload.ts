export const CERTIFICADO_MAX_BYTES = 5 * 1024 * 1024;

export const CERTIFICADO_MAX_POR_SERVICIO = 3;

export const CERTIFICADO_MIME_PERMITIDOS = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

export type CertificadoMimePermitido = (typeof CERTIFICADO_MIME_PERMITIDOS)[number];

export const CERTIFICADO_IMAGE_PICKER_QUALITY = 0.7;
