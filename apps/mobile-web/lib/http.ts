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
