// SOLO MOCK / DEMO. Contraseñas en texto plano; se elimina al conectar auth real.

import {
  EstadoSolicitudProfesional,
  OnboardingPaso,
} from '../../types/professionalAuth';

export interface MockProfessionalAccount {
  email: string;
  password: string;
  profesionalId: string;
  solicitudId: string;
  nombre: string;
  estadoSolicitud: EstadoSolicitudProfesional;
  onboardingPaso?: OnboardingPaso;
}

export const MOCK_PROFESSIONAL_ACCOUNTS: MockProfessionalAccount[] = [
  {
    email: 'pro.aprobado@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-aprobado',
    solicitudId: 'sol-demo-aprobado',
    nombre: 'Profesional Aprobado (demo)',
    estadoSolicitud: 'APROBADO',
  },
  {
    email: 'pro.aprobado-nuevo@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-aprobado-nuevo',
    solicitudId: 'sol-demo-aprobado-nuevo',
    nombre: 'Profesional Aprobado sin activar (demo)',
    estadoSolicitud: 'APROBADO',
  },
  {
    email: 'pro.revision@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-revision',
    solicitudId: 'sol-demo-revision',
    nombre: 'Profesional En revisión (demo)',
    estadoSolicitud: 'EN_REVISION',
  },
  {
    email: 'pro.rechazado@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-rechazado',
    solicitudId: 'sol-demo-rechazado',
    nombre: 'Profesional Rechazado (demo)',
    estadoSolicitud: 'RECHAZADO',
  },
  {
    email: 'pro.docs-servicios@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-docs-servicios',
    solicitudId: 'sol-demo-docs-servicios',
    nombre: 'Profesional Docs servicios (demo)',
    estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
    onboardingPaso: 'SERVICIOS',
  },
  {
    email: 'pro.docs-certificados@lookify.test',
    password: 'Lookify123',
    profesionalId: 'pro-demo-docs-certificados',
    solicitudId: 'sol-demo-docs-certificados',
    nombre: 'Profesional Docs certificados (demo)',
    estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
    onboardingPaso: 'CERTIFICADOS',
  },
];
