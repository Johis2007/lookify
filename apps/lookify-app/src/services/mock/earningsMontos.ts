const COMISION_PORCENTAJE = 15;

/** Solo mock del servicio de historial; la pantalla no importa este módulo. */
export function calcularMontosFinalizadoHistorial(
  precioBaseCop: number,
  precioDomicilioCop: number
): { precioTotalCop: number; comisionCop: number; netoCop: number } {
  const precioTotalCop = precioBaseCop + precioDomicilioCop;
  const comisionCop = Math.round((precioBaseCop * COMISION_PORCENTAJE) / 100);
  const netoCop = precioTotalCop - comisionCop;
  return { precioTotalCop, comisionCop, netoCop };
}

export function metodoPagoDeterministicoDesdeId(id: string): 'EFECTIVO' | 'DIGITAL' {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) {
    sum += id.charCodeAt(i);
  }
  return sum % 2 === 0 ? 'EFECTIVO' : 'DIGITAL';
}
