import { CategoriaId } from '../data/mockProfessionals';
import { createMockCatalogService } from './mock/mockCatalogService';

export interface CatalogoServicio {
  id: string;
  nombre: string;
  duracionMin: number;
  precio: number;
}

export interface CatalogoCategoria {
  categoriaId: CategoriaId;
  categoriaNombre: string;
  servicios: CatalogoServicio[];
}

export interface CatalogService {
  listarServiciosPorCategoria(): Promise<CatalogoCategoria[]>;
}

let implementation: CatalogService = createMockCatalogService();

export function getCatalogService(): CatalogService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP (ver initBackend). */
export function setCatalogServiceForTesting(service: CatalogService): void {
  implementation = service;
}
