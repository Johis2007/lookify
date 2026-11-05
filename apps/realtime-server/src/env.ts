// Carga de entorno del realtime-server.
//
// Debe importarse ANTES que cualquier módulo que lea `process.env` al evaluarse
// (por ejemplo `api/directusAdmin.ts`, que exige DIRECTUS_TOKEN al importarse).
// Los imports de ESM se evalúan antes que el cuerpo del módulo, así que cargar
// el .env dentro de index.ts llegaba tarde: este módulo se importa primero y
// garantiza que las variables ya estén definidas.
//
// Orden: primero apps/realtime-server/.env (si existe) y, como fallback, el
// .env de la raíz del monorepo. dotenv no sobreescribe lo ya definido.
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // .../src o .../dist
const localEnv = resolve(here, '..', '.env');
const rootEnv = resolve(here, '..', '..', '..', '.env');

for (const candidate of [localEnv, rootEnv]) {
  if (existsSync(candidate)) loadEnv({ path: candidate });
}
