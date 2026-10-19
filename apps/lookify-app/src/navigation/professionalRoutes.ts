import {
  ProfessionalSessionRouteParams,
  SesionProfesional,
  sesionToRouteParams,
} from '../types/professionalAuth';

import type { ProfessionalStackParamList } from './ProfessionalStackNavigator';

export type ProfessionalPostLoginRouteName = Exclude<
  keyof ProfessionalStackParamList,
  | 'ProfessionalLogin'
  | 'RegisterProfessional'
  | 'ProfessionalTermsRead'
  | 'ProfessionalPrivacyRead'
>;

export type ProfessionalPostLoginRoute = {
  name: ProfessionalPostLoginRouteName;
  params: ProfessionalSessionRouteParams;
};

export function resolvePostLoginRoute(session: SesionProfesional): ProfessionalPostLoginRoute {
  const params = sesionToRouteParams(session);

  switch (session.estadoSolicitud) {
    case 'APROBADO':
      if (session.profesionalActivado) {
        return { name: 'ProfessionalDashboardPlaceholder', params };
      }
      return { name: 'ProfessionalVerificationPlaceholder', params };
    case 'EN_REVISION':
    case 'RECHAZADO':
      return { name: 'ProfessionalVerificationPlaceholder', params };
    case 'DOCUMENTOS_PENDIENTES': {
      if (session.onboardingPaso === 'CERTIFICADOS') {
        return { name: 'ProfessionalCertificateUploadPlaceholder', params };
      }
      return { name: 'ProfessionalServiceSelection', params };
    }
    default: {
      const _exhaustive: never = session.estadoSolicitud;
      return _exhaustive;
    }
  }
}
