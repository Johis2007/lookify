// Tipos de autenticación y sesión del profesional (contrato frontend ↔ backend).

export type EstadoSolicitudProfesional =
  | 'DOCUMENTOS_PENDIENTES'
  | 'EN_REVISION'
  | 'APROBADO'
  | 'RECHAZADO';

export type OnboardingPaso = 'SERVICIOS' | 'CERTIFICADOS';

export interface SesionProfesional {
  profesionalId: string;
  email: string;
  nombre: string;
  estadoSolicitud: EstadoSolicitudProfesional;
  onboardingPaso?: OnboardingPaso;
}

/** Params tipados para placeholders post-login (sin contexto global en este turno). */
export type ProfessionalSessionRouteParams = {
  profesionalId: string;
  solicitudId?: string;
  nombre: string;
  email: string;
  estadoSolicitud: EstadoSolicitudProfesional;
  onboardingPaso?: OnboardingPaso;
};

export function sesionToRouteParams(session: SesionProfesional): ProfessionalSessionRouteParams {
  const params: ProfessionalSessionRouteParams = {
    profesionalId: session.profesionalId,
    nombre: session.nombre,
    email: session.email,
    estadoSolicitud: session.estadoSolicitud,
  };
  if (session.onboardingPaso !== undefined) {
    params.onboardingPaso = session.onboardingPaso;
  }
  return params;
}
