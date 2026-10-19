export function primerNombre(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  return partes[0] ?? 'Cliente';
}
