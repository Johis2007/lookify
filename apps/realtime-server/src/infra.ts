// Helper de infraestructura para pruebas de integración.
//
// Los tests que necesitan Postgres/Directus se declaran con `maybe`. Sin
// infraestructura disponible se OMITEN por defecto (desarrollo local sin
// Docker). Pero en CI (o con RT_REQUIRE_INFRA=1) deben FALLAR en vez de
// omitirse en silencio: un suite en verde con todo saltado no es verde.
import test from 'node:test';

export const DATABASE_URL = process.env.DATABASE_URL;
export const SECRET = process.env.DIRECTUS_SECRET;

export const INFRA_AVAILABLE = Boolean(DATABASE_URL && SECRET);

/** Exigir infraestructura: falla en vez de omitir cuando está activo. */
export const REQUIRE_INFRA =
  process.env.CI === 'true' || process.env.RT_REQUIRE_INFRA === '1';

const MISSING = [
  !DATABASE_URL ? 'DATABASE_URL' : null,
  !SECRET ? 'DIRECTUS_SECRET' : null,
].filter(Boolean) as string[];

const REQUIRE_MSG =
  `Infraestructura no disponible y ${REQUIRE_INFRA ? 'CI/RT_REQUIRE_INFRA exige' : 'se necesita'} ` +
  `ejecutar esta prueba: faltan ${MISSING.join(', ')}. ` +
  'Levanta Postgres/Directus (docker compose up -d postgres redis directus) o exporta las variables.';

/** `test` si hay infra; en modo estricto falla claro; si no, se omite. */
export const maybe = INFRA_AVAILABLE
  ? test
  : REQUIRE_INFRA
    ? ((_name: string, _fn?: unknown) =>
        test(_name, () => {
          throw new Error(REQUIRE_MSG);
        }))
    : test.skip;
