export const MAX_COMENTARIO_CHARS = 250;

export type MetodoPagoMock = 'efectivo' | 'tarjeta' | 'nequi';

export const METODOS_PAGO: { id: MetodoPagoMock; label: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: 'cash' },
  { id: 'tarjeta', label: 'Tarjeta', icon: 'credit-card-outline' },
  { id: 'nequi', label: 'Nequi', icon: 'cellphone' },
];
