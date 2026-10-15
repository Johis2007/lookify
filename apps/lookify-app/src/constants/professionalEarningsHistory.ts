import { PeriodoHistorialIngresos } from '../types/professionalEarningsHistory';

export const HISTORIAL_PAGE_SIZE = 20;

export const PERIODOS_HISTORIAL: { id: PeriodoHistorialIngresos; etiqueta: string }[] = [
  { id: 'HOY', etiqueta: 'Hoy' },
  { id: 'SEMANA', etiqueta: 'Semana' },
  { id: 'MES', etiqueta: 'Mes' },
];
