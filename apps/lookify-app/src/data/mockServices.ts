// src/data/mockServices.ts
// Catálogo de servicios específicos por categoría (datos de ejemplo).
// TODO: eliminar este archivo cuando conectemos GET /categorias/:id/servicios

import { CategoriaId } from './mockProfessionals';

export interface MockService {
  id: string;
  nombre: string;
  duracionMin: number;
  // Precio del servicio. El domicilio se cobra aparte y se suma en el resumen
  // de pago, nunca se guarda un único valor total aquí.
  precio: number;
}

// Record<CategoriaId, ...> obliga a definir servicios para toda categoría
// nueva que se agregue al catálogo del admin.
export const SERVICIOS_POR_CATEGORIA: Record<CategoriaId, MockService[]> = {
  peluqueria: [
    { id: 'pel-1', nombre: 'Corte de dama', duracionMin: 45, precio: 35000 },
    { id: 'pel-2', nombre: 'Cepillado', duracionMin: 40, precio: 28000 },
    { id: 'pel-3', nombre: 'Tinte y color', duracionMin: 120, precio: 85000 },
    { id: 'pel-4', nombre: 'Peinado para evento', duracionMin: 60, precio: 60000 },
  ],
  barberia: [
    { id: 'bar-1', nombre: 'Corte clásico', duracionMin: 30, precio: 25000 },
    { id: 'bar-2', nombre: 'Corte y barba', duracionMin: 45, precio: 38000 },
    { id: 'bar-3', nombre: 'Perfilado de barba', duracionMin: 20, precio: 15000 },
    { id: 'bar-4', nombre: 'Corte infantil', duracionMin: 30, precio: 20000 },
  ],
  maquillaje: [
    { id: 'maq-1', nombre: 'Básico', duracionMin: 45, precio: 45000 },
    { id: 'maq-2', nombre: 'Especial', duracionMin: 60, precio: 75000 },
    { id: 'maq-3', nombre: 'Premium', duracionMin: 90, precio: 110000 },
  ],
  unas: [
    { id: 'una-1', nombre: 'Básico', duracionMin: 45, precio: 20000 },
    { id: 'una-2', nombre: 'Especial', duracionMin: 60, precio: 35000 },
    { id: 'una-3', nombre: 'Premium', duracionMin: 90, precio: 50000 },
  ],
};

// Formato colombiano: 25000 -> "$25.000"
export function formatPrecio(valor: number): string {
  return `$${valor.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
