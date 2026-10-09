// SOLO MOCK / DEMO. Contraseñas en texto plano; se elimina al conectar auth real.

import {
  EstadoSolicitudProfesional,
  OnboardingPaso,
} from '../../types/professionalAuth';

export interface MockProfessionalAccount {
  email: string;
  password: string;
  profesionalId: string;
  nombre: string;
  estadoSolicitud: EstadoSolicitudProfesional;
  onboardingPaso?: OnboardingPaso;
}

export const MOCK_PROFESSIONAL_ACCOUNTS: MockProfessionalAccount[] = [
  {
    email: 'pro.aprobado@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-aprobado',
    nombre: 'Profesional Aprobado (demo)',
    estadoSolicitud: 'APROBADO',
  },
  {
    email: 'pro.revision@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-revision',
    nombre: 'Profesional En revisión (demo)',
    estadoSolicitud: 'EN_REVISION',
  },
  {
    email: 'pro.rechazado@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-rechazado',
    nombre: 'Profesional Rechazado (demo)',
    estadoSolicitud: 'RECHAZADO',
  },
  {
    email: 'pro.docs-servicios@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-docs-servicios',
    nombre: 'Profesional Docs servicios (demo)',
    estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
    onboardingPaso: 'SERVICIOS',
  },
  {
    email: 'pro.docs-certificados@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-docs-certificados',
    nombre: 'Profesional Docs certificados (demo)',
    estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
    onboardingPaso: 'CERTIFICADOS',
  },
];
