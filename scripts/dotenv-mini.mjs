// Cargador mínimo de .env (sin dependencias): lee el .env de la raíz del
// repo y exporta las variables que aún no estén definidas en process.env.
// Uso: import { loadRootEnv } from './dotenv-mini.mjs'; loadRootEnv(import.meta.url);
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadRootEnv(callerUrl, filename = '.env') {
  // caller en scripts/ o directus/ -> la raíz está un nivel arriba.
  const callerDir = dirname(fileURLToPath(callerUrl));
  const candidates = [join(callerDir, '..', filename), join(callerDir, filename)];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    return path;
  }
  return null;
}
