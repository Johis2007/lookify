// src/data/mockProfessionals.ts
// Datos de ejemplo (mock) para Inicio y matching.
// TODO: eliminar cuando exista GET /profesionales/cercanos

import { MOCK_CLIENT_LOCATION } from '../constants/geo';
import { distanciaKm, puntoAKm } from '../utils/geo';

export type EstadoProfesional = 'DISPONIBLE' | 'OCUPADO';

export interface MockResenaDestacada {
  autor: string;
  texto: string;
  estrellas: number;
}

export interface MockProfessional {
  id: string;
  nombre: string;
  categoria: CategoriaId;
  calificacion: number;
  totalResenas: number;
  latitude: number;
  longitude: number;
  estado: EstadoProfesional;
  verificado: boolean;
  ajustePrecio: number;
  resenaDestacada: MockResenaDestacada;
  portafolio: string[];
}

export const CATEGORIAS = [
  { id: 'peluqueria', nombre: 'Peluquería' },
  { id: 'barberia', nombre: 'Barbería' },
  { id: 'maquillaje', nombre: 'Maquillaje' },
  { id: 'unas', nombre: 'Uñas' },
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]['id'];

const RESENA_DEFAULT: MockResenaDestacada = {
  autor: 'Cliente verificado',
  texto: 'Excelente servicio, muy puntual y profesional.',
  estrellas: 5,
};

const PORTAFOLIO_DEFAULT = ['trabajo-1', 'trabajo-2', 'trabajo-3'];

interface ProfSpec {
  categoria: CategoriaId;
  nombre: string;
  km: number;
  bearing: number;
  estado: EstadoProfesional;
  verificado: boolean;
  ajustePrecio: number;
  calificacion: number;
  totalResenas: number;
  suffix: string;
}

function buildProfessional(spec: ProfSpec): MockProfessional {
  const { latitude, longitude } = puntoAKm(
    MOCK_CLIENT_LOCATION.latitude,
    MOCK_CLIENT_LOCATION.longitude,
    spec.km,
    spec.bearing
  );
  const kmReal = distanciaKm(
    MOCK_CLIENT_LOCATION.latitude,
    MOCK_CLIENT_LOCATION.longitude,
    latitude,
    longitude
  );
  const kmLabel = kmReal.toFixed(1);

  return {
    id: `${spec.categoria}-${kmLabel}km-${spec.suffix}`,
    nombre: spec.nombre,
    categoria: spec.categoria,
    calificacion: spec.calificacion,
    totalResenas: spec.totalResenas,
    latitude,
    longitude,
    estado: spec.estado,
    verificado: spec.verificado,
    ajustePrecio: spec.ajustePrecio,
    resenaDestacada: RESENA_DEFAULT,
    portafolio: PORTAFOLIO_DEFAULT,
  };
}

function specsForCategory(
  categoria: CategoriaId,
  label: string
): ProfSpec[] {
  const within3Disp: ProfSpec[] = [
    { km: 0.9, bearing: 10, suffix: 'd01' },
    { km: 1.4, bearing: 55, suffix: 'd02' },
    { km: 1.9, bearing: 130, suffix: 'd03' },
    { km: 2.5, bearing: 200, suffix: 'd04' },
    { km: 2.95, bearing: 290, suffix: 'd05' },
  ].map((p, i) => ({
    categoria,
    nombre: `${label} disponible ${i + 1}`,
    km: p.km,
    bearing: p.bearing,
    suffix: p.suffix,
    estado: 'DISPONIBLE' as const,
    verificado: true,
    ajustePrecio: 0.9 + i * 0.05,
    calificacion: 4.5 + (i % 3) * 0.1,
    totalResenas: 40 + i * 12,
  }));

  const excludedWithin3: ProfSpec[] = [
    {
      categoria,
      nombre: `${label} ocupado prueba`,
      km: 1.6,
      bearing: 170,
      suffix: 'ocup',
      estado: 'OCUPADO',
      verificado: true,
      ajustePrecio: 1.0,
      calificacion: 4.6,
      totalResenas: 30,
    },
    {
      categoria,
      nombre: `${label} sin verificar prueba`,
      km: 2.2,
      bearing: 240,
      suffix: 'nover',
      estado: 'DISPONIBLE',
      verificado: false,
      ajustePrecio: 1.0,
      calificacion: 4.2,
      totalResenas: 5,
    },
  ];

  const between3And6: ProfSpec[] = [
    { km: 3.6, bearing: 35, suffix: 'm01' },
    { km: 4.8, bearing: 150, suffix: 'm02' },
    { km: 5.4, bearing: 265, suffix: 'm03' },
  ].map((p, i) => ({
    categoria,
    nombre: `${label} lejano ${i + 1}`,
    km: p.km,
    bearing: p.bearing,
    suffix: p.suffix,
    estado: 'DISPONIBLE' as const,
    verificado: true,
    ajustePrecio: 1.0,
    calificacion: 4.7,
    totalResenas: 55 + i * 8,
  }));

  return [...within3Disp, ...excludedWithin3, ...between3And6];
}

const MOCK_SPECS: ProfSpec[] = [
  ...specsForCategory('peluqueria', 'Peluquería'),
  ...specsForCategory('barberia', 'Barbería'),
  ...specsForCategory('maquillaje', 'Maquillaje'),
  ...specsForCategory('unas', 'Uñas'),
];

export const MOCK_PROFESSIONALS: MockProfessional[] = MOCK_SPECS.map(buildProfessional);

export function filtrarCandidatosMatching(
  categoriaId: CategoriaId,
  radioKm: number,
  rejectedIds: string[]
): { professional: MockProfessional; distanciaKm: number }[] {
  return MOCK_PROFESSIONALS.filter(
    (p) =>
      p.categoria === categoriaId &&
      p.verificado === true &&
      p.estado === 'DISPONIBLE' &&
      !rejectedIds.includes(p.id)
  )
    .map((p) => ({
      professional: p,
      distanciaKm: distanciaKm(
        MOCK_CLIENT_LOCATION.latitude,
        MOCK_CLIENT_LOCATION.longitude,
        p.latitude,
        p.longitude
      ),
    }))
    .filter((item) => item.distanciaKm <= radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}
