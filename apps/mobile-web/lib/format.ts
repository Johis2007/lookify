// Formato moneda COP único en toda la app (antes duplicado en 6 pantallas).
export function cop(n: number): string {
  return `$${Math.round(n || 0).toLocaleString('es-CO')}`;
}
