export const FOTO_PERFIL_MAX_BYTES = 5 * 1024 * 1024;

export const FOTO_PERFIL_MIME_PERMITIDOS = ['image/jpeg', 'image/png'] as const;

export type FotoPerfilMimePermitido = (typeof FOTO_PERFIL_MIME_PERMITIDOS)[number];

export const FOTO_PERFIL_IMAGE_PICKER_QUALITY = 0.7;
