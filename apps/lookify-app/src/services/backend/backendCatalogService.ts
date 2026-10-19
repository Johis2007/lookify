// src/services/backend/backendCatalogService.ts
// Catálogo real: service_categories + beauty_services (solo activas) de
// Directus. Los ids se exponen como string (id numérico).

import { CatalogService, CatalogoCategoria } from '../catalogService';
import { CategoriaId } from '../../data/mockProfessionals';
import { api } from '../../lib/backend/directus';
import { loadBackendSession } from '../../lib/backend/session';
import { DCategory, DService } from '../../lib/backend/mapping';

const CATEGORIAS_VALIDAS: CategoriaId[] = ['peluqueria', 'barberia', 'maquillaje', 'unas'];

export function createBackendCatalogService(): CatalogService {
  return {
    async listarServiciosPorCategoria(): Promise<CatalogoCategoria[]> {
      const session = await loadBackendSession();
      const token = session?.token ?? null;
      const [cats, services] = await Promise.all([
        api<DCategory[]>('GET', '/items/service_categories?fields=id,name,slug&limit=100', token),
        api<DService[]>(
          'GET',
          '/items/beauty_services?filter[is_active][_eq]=true&fields=id,name,category,price_base,duration_min&limit=200',
          token,
        ),
      ]);
      const porSlug = new Map(cats.map((c) => [c.slug, c]));
      const out: CatalogoCategoria[] = [];
      for (const catId of CATEGORIAS_VALIDAS) {
        const cat = porSlug.get(catId);
        if (!cat) continue;
        const servicios = services
          .filter((s) => s.category === catId || s.category === cat.name)
          .map((s) => ({
            id: String(s.id),
            nombre: s.name,
            duracionMin: s.duration_min,
            precio: s.price_base,
          }));
        out.push({ categoriaId: catId, categoriaNombre: cat.name, servicios });
      }
      return out;
    },
  };
}
