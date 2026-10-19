import { CertificadoProfesional } from '../types/professionalCertificates';
import { CERTIFICADO_MAX_POR_SERVICIO } from '../constants/certificateUpload';

export function contarCertificadosPorServicio(
  certificados: CertificadoProfesional[],
  servicioIdsElegidos: string[],
  excluirCertificadoId?: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of servicioIdsElegidos) {
    counts[id] = 0;
  }
  for (const cert of certificados) {
    if (excluirCertificadoId && cert.id === excluirCertificadoId) continue;
    for (const sid of cert.servicioIds) {
      if (counts[sid] !== undefined) {
        counts[sid] += 1;
      }
    }
  }
  return counts;
}

export function serviciosSinCubrir(
  counts: Record<string, number>
): string[] {
  return Object.entries(counts)
    .filter(([, n]) => n === 0)
    .map(([id]) => id);
}

export function coberturaCompleta(counts: Record<string, number>): boolean {
  return Object.values(counts).every((n) => n >= 1 && n <= CERTIFICADO_MAX_POR_SERVICIO);
}

export function puedeAsignarServicio(
  servicioId: string,
  certificados: CertificadoProfesional[],
  servicioIdsElegidos: string[],
  excluirCertificadoId?: string,
  yaSeleccionadoEnFormulario?: boolean
): boolean {
  if (!servicioIdsElegidos.includes(servicioId)) return false;
  if (yaSeleccionadoEnFormulario) return true;
  const counts = contarCertificadosPorServicio(
    certificados,
    servicioIdsElegidos,
    excluirCertificadoId
  );
  return (counts[servicioId] ?? 0) < CERTIFICADO_MAX_POR_SERVICIO;
}
