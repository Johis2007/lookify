// Lectura JSON que nunca lanza: Directus responde a veces 204/ok sin cuerpo
// (ej. POST sin permiso de lectura) y res.json() explotaría con
// "Unexpected end of input" como promesa no capturada en Android.
export async function readJson<T = any>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Atajo para listas Directus `{data: [...]}`: nunca lanza, nunca devuelve
// null (arreglo vacío si no hay cuerpo, no es ok o no es arreglo). Reemplaza
// los `await res.json()` crudos, que revientan con 204/ok sin cuerpo.
export async function readItems<T = any>(res: Response): Promise<T[]> {
  if (!res.ok) return [];
  const data = (await readJson<{ data?: unknown }>(res))?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}
