import { CATEGORIAS } from '../../data/mockProfessionals';
import { SERVICIOS_POR_CATEGORIA } from '../../data/mockServices';
import { CatalogService } from '../catalogService';
import { ServiceError } from '../errors';

const MOCK_CATALOG_LATENCY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockCatalogService(): CatalogService {
  return {
    async listarServiciosPorCategoria() {
      await delay(MOCK_CATALOG_LATENCY_MS);
      try {
        return CATEGORIAS.map((cat) => ({
          categoriaId: cat.id,
          categoriaNombre: cat.nombre,
          servicios: SERVICIOS_POR_CATEGORIA[cat.id].map((s) => ({
            id: s.id,
            nombre: s.nombre,
            duracionMin: s.duracionMin,
            precio: s.precio,
          })),
        }));
      } catch {
        throw new ServiceError('NETWORK');
      }
    },
  };
}
