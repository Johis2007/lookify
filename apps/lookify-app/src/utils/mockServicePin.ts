function esPinTrivial(pin: string): boolean {
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return true;

  if (/^(\d)\1{3}$/.test(pin)) return true;

  const d = pin.split('').map(Number);
  const ascendente = d[1] === d[0] + 1 && d[2] === d[1] + 1 && d[3] === d[2] + 1;
  const descendente = d[1] === d[0] - 1 && d[2] === d[1] - 1 && d[3] === d[2] - 1;
  return ascendente || descendente;
}

/** PIN mock de 4 dígitos (producción: lo genera el backend al aceptar el servicio). */
export function generarPinServicioMock(): string {
  for (let intento = 0; intento < 50; intento += 1) {
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    if (!esPinTrivial(pin)) return pin;
  }
  return '2580';
}

export function pinAccessibilityLabel(pin: string): string {
  return `Código para iniciar: ${pin.split('').join(' ')}`;
}
