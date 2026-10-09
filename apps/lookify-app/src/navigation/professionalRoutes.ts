import {
  ProfessionalSessionRouteParams,
  SesionProfesional,
  sesionToRouteParams,
} from '../types/professionalAuth';

export type ProfessionalPostLoginRouteName =
  | 'ProfessionalDashboardPlaceholder'
  | 'ProfessionalVerificationPlaceholder'
  | 'ProfessionalServiceSelectionPlaceholder'
  | 'ProfessionalCertificateUploadPlaceholder';

export type ProfessionalPostLoginRoute = {
  name: ProfessionalPostLoginRouteName;
  params: ProfessionalSessionRouteParams;
};

export function resolvePostLoginRoute(session: SesionProfesional): ProfessionalPostLoginRoute {
  const params = sesionToRouteParams(session);

  switch (session.estadoSolicitud) {
    case 'APROBADO':
      return { name: 'ProfessionalDashboardPlaceholder', params };
    case 'EN_REVISION':
    case 'RECHAZADO':
      return { name: 'ProfessionalVerificationPlaceholder', params };
    case 'DOCUMENTOS_PENDIENTES': {
      if (session.onboardingPaso === 'CERTIFICADOS') {
        return { name: 'ProfessionalCertificateUploadPlaceholder', params };
      }
      return { name: 'ProfessionalServiceSelectionPlaceholder', params };
    }
    default: {
      const _exhaustive: never = session.estadoSolicitud;
      return _exhaustive;
    }
  }
}
