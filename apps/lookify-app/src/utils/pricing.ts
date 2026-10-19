export const TARIFA_DOMICILIO_BASE = 4000;
export const TARIFA_POR_KM = 1200;
export const TOPE_DOMICILIO = 7000;
export const AJUSTE_MIN = 0.8;
export const AJUSTE_MAX = 1.2;
export const COMISION_LOOKIFY = 0.15;

export interface DesglosePrecio {
  precioServicio: number;
  precioDomicilio: number;
  precioTotal: number;
}

export function redondearCentena(valor: number): number {
  return Math.round(valor / 100) * 100;
}

function clampAjuste(ajuste: number): number {
  return Math.min(AJUSTE_MAX, Math.max(AJUSTE_MIN, ajuste));
}

export function calcularPrecioServicio(precioBase: number, ajuste: number): number {
  return redondearCentena(precioBase * clampAjuste(ajuste));
}

export function calcularDomicilio(distanciaKm: number): number {
  const bruto = TARIFA_DOMICILIO_BASE + TARIFA_POR_KM * distanciaKm;
  return redondearCentena(Math.min(bruto, TOPE_DOMICILIO));
}

export function calcularDesglose(
  precioBase: number,
  ajuste: number,
  distanciaKm: number
): DesglosePrecio {
  const precioServicio = calcularPrecioServicio(precioBase, ajuste);
  const precioDomicilio = calcularDomicilio(distanciaKm);
  return {
    precioServicio,
    precioDomicilio,
    precioTotal: precioServicio + precioDomicilio,
  };
}

export function formatCOP(valor: number): string {
  return `$${valor.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
