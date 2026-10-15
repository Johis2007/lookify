import { ResenaProfesional } from '../../types/professionalReview';
import { DisponibilidadProfesional, FotoPerfilPanel } from '../../types/professionalDashboard';

const disponibilidadByProfesionalId = new Map<string, DisponibilidadProfesional>();

const fotoByProfesionalId = new Map<string, FotoPerfilPanel>();

interface ResenasSeed {
  calificacionPromedio: number;
  totalResenas: number;
  ultimas: ResenaProfesional[];
}

const resenasSeedByProfesionalId = new Map<string, ResenasSeed>();

const RESUMEN_DIA_MOCK = {
  serviciosRealizados: 2,
  ingresosCop: 73000,
  datosMock: true as const,
};

const RESENAS_APROBADO: ResenasSeed = {
  calificacionPromedio: 4.7,
  totalResenas: 18,
  ultimas: [
    {
      autor: 'María G.',
      texto: 'Muy profesional, llegó puntual y el resultado excelente.',
      estrellas: 5,
    },
    {
      autor: 'Carlos R.',
      texto: 'Buen servicio, volvería a contratar.',
      estrellas: 4,
    },
    {
      autor: 'Laura P.',
      texto: 'Recomendada, trato amable y cuidado en los detalles.',
      estrellas: 5,
    },
  ],
};

const RESENAS_APROBADO_NUEVO: ResenasSeed = {
  calificacionPromedio: 4.5,
  totalResenas: 6,
  ultimas: [
    {
      autor: 'Andrés M.',
      texto: 'Primera vez con Lookify y quedé satisfecho.',
      estrellas: 5,
    },
    {
      autor: 'Diana S.',
      texto: 'Corte impecable, gracias.',
      estrellas: 4,
    },
  ],
};

export function seedDashboardDemoData(): void {
  if (!resenasSeedByProfesionalId.has('pro-demo-aprobado')) {
    resenasSeedByProfesionalId.set('pro-demo-aprobado', RESENAS_APROBADO);
  }
  if (!resenasSeedByProfesionalId.has('pro-demo-aprobado-nuevo')) {
    resenasSeedByProfesionalId.set('pro-demo-aprobado-nuevo', RESENAS_APROBADO_NUEVO);
  }
}

seedDashboardDemoData();

export function getDisponibilidad(profesionalId: string): DisponibilidadProfesional {
  return disponibilidadByProfesionalId.get(profesionalId) ?? 'OCUPADO';
}

export function setDisponibilidad(
  profesionalId: string,
  disponibilidad: DisponibilidadProfesional
): void {
  disponibilidadByProfesionalId.set(profesionalId, disponibilidad);
}

export function getFotoPerfil(profesionalId: string): FotoPerfilPanel | null {
  const foto = fotoByProfesionalId.get(profesionalId);
  return foto ? { ...foto } : null;
}

export function setFotoPerfil(profesionalId: string, foto: FotoPerfilPanel): void {
  fotoByProfesionalId.set(profesionalId, { ...foto });
}

export function getResenasSeed(profesionalId: string): ResenasSeed | undefined {
  const seed = resenasSeedByProfesionalId.get(profesionalId);
  if (!seed) return undefined;
  return {
    calificacionPromedio: seed.calificacionPromedio,
    totalResenas: seed.totalResenas,
    ultimas: seed.ultimas.map((r) => ({ ...r })),
  };
}

export function getResumenDiaMock() {
  return { ...RESUMEN_DIA_MOCK };
}
