import { DIRECTUS_URL_EXPORT as DIRECTUS_URL } from './directus';

// Crea el perfil profesional del usuario actual (idempotente por UI).
export async function ensureProfessionalProfile(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  userId: string,
  displayName: string
): Promise<{ created: boolean; message: string }> {
  const check = await authFetch(
    `/items/beauty_professionals?filter[user][_eq]=${userId}&fields=id&limit=1`
  );
  if (check.ok) {
    const { data } = await check.json();
    if (Array.isArray(data) && data.length > 0) {
      return { created: false, message: 'Ya tienes perfil profesional.' };
    }
  }
  const res = await authFetch('/items/beauty_professionals', {
    method: 'POST',
    body: JSON.stringify({ user: userId, display_name: displayName, is_online: false }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
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
  const { data: file } = await upload.json();

  // Vincula al perfil
  const prof = await authFetch(
    `/items/beauty_professionals?filter[user][_eq]=${userId}&fields=id&limit=1`
  );
  const { data: rows } = await prof.json();
  if (rows?.length) {
    await authFetch(`/items/beauty_professionals/${rows[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatar: file.id }),
    });
  }
  return `${DIRECTUS_URL}/assets/${file.id}?fit=cover&width=400`;
}
