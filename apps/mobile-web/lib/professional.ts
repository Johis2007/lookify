import { DIRECTUS_URL_EXPORT as DIRECTUS_URL } from './directus';
import { readJson } from './http';

// Crea el perfil cliente (solo para cuentas legado sin rol definido).
export async function createClientProfile(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  userId: string,
  displayName: string
): Promise<void> {
  const res = await authFetch('/items/client_profiles', {
    method: 'POST',
    body: JSON.stringify({ user: userId, display_name: displayName }),
  });
  if (!res.ok) throw new Error('No se pudo completar el registro.');
}

// Crea el perfil profesional del usuario actual (idempotente por UI).
// Rol exclusivo: si la cuenta ya es cliente (perfil cliente o reservas),
// no puede ser profesional al tiempo.
export async function ensureProfessionalProfile(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  userId: string,
  displayName: string
): Promise<{ created: boolean; message: string }> {
  const asClient = await authFetch(
    `/items/client_profiles?filter[user][_eq]=${userId}&fields=id&limit=1`
  );
  const asClientRows = asClient.ok ? (await readJson<{ data?: unknown[] }>(asClient))?.data : null;
  let isClient = Array.isArray(asClientRows) && asClientRows.length > 0;
  if (!isClient) {
    const bk = await authFetch(
      `/items/bookings?filter[client][_eq]=${userId}&fields=id&limit=1`
    );
    const bkRows = bk.ok ? (await readJson<{ data?: unknown[] }>(bk))?.data : null;
    isClient = Array.isArray(bkRows) && bkRows.length > 0;
  }
  if (isClient) {
    throw new Error('Esta cuenta es de cliente. Crea una cuenta profesional aparte para ofrecer servicios.');
  }
  const check = await authFetch(
    `/items/beauty_professionals?filter[user][_eq]=${userId}&fields=id&limit=1`
  );
  if (check.ok) {
    const data = (await readJson<{ data?: unknown[] }>(check))?.data;
    if (Array.isArray(data) && data.length > 0) {
      return { created: false, message: 'Ya tienes perfil profesional.' };
    }
  }
  const res = await authFetch('/items/beauty_professionals', {
    method: 'POST',
    body: JSON.stringify({ user: userId, display_name: displayName, is_online: false }),
  });
  if (!res.ok) {
    const err = await readJson<any>(res);
    throw new Error(
      err?.errors?.[0]?.message ?? 'Sin permiso para crear perfil (revisa roles en Directus).'
    );
  }
  return { created: true, message: 'Perfil profesional activado.' };
}

// Sube un avatar a Directus Files y lo vincula al perfil profesional.
export async function uploadProfessionalAvatar(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  userId: string,
  imageUri: string
): Promise<string> {
  const form = new FormData();
  // @ts-ignore - React Native FormData acepta {uri, name, type}
  form.append('file', { uri: imageUri, name: 'avatar.jpg', type: 'image/jpeg' });

  const upload = await authFetch('/files', { method: 'POST', body: form as any });
  if (!upload.ok) throw new Error('No se pudo subir la imagen.');
  const file = (await readJson<{ data?: any }>(upload))?.data;
  if (!file?.id) throw new Error('No se pudo subir la imagen.');

  // Vincula al perfil (si falla, se avisa: antes quedaba "éxito" sin vínculo).
  const prof = await authFetch(
    `/items/beauty_professionals?filter[user][_eq]=${userId}&fields=id&limit=1`
  );
  if (!prof.ok) throw new Error('No se pudo verificar tu perfil profesional.');
  const rows = (await readJson<{ data?: any[] }>(prof))?.data;
  if (!rows?.length) throw new Error('Activa tu perfil profesional primero.');
  const link = await authFetch(`/items/beauty_professionals/${rows[0].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ avatar: file.id }),
  });
  if (!link.ok) throw new Error('Imagen subida pero no vinculada (revisa permisos).');
  return `${DIRECTUS_URL}/assets/${file.id}?fit=cover&width=400`;
}
