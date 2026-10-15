import { SERVICIOS_POR_CATEGORIA } from '../../data/mockServices';
import { CategoriaId } from '../../data/mockProfessionals';

const VALID_IDS = new Set<string>(
  (Object.keys(SERVICIOS_POR_CATEGORIA) as CategoriaId[]).flatMap((cat) =>
    SERVICIOS_POR_CATEGORIA[cat].map((s) => s.id)
  )
);

export function esServicioIdValido(id: string): boolean {
  return VALID_IDS.has(id);
}

export function todosLosServicioIds(): string[] {
  return [...VALID_IDS];
}
