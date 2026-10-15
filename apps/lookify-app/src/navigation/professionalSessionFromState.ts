import { NavigationState, PartialState } from '@react-navigation/native';
import { ProfessionalSessionRouteParams } from '../types/professionalAuth';

type NavState = NavigationState | PartialState<NavigationState>;

function getActiveRoute(state: NavState): { name: string; params?: object } | null {
  if (!state.routes || state.routes.length === 0) {
    return null;
  }
  const index = state.index ?? state.routes.length - 1;
  const route = state.routes[index];
  if (!route) {
    return null;
  }
  if (route.state) {
    return getActiveRoute(route.state as NavState);
  }
  return { name: route.name, params: route.params as object | undefined };
}

export function extractProfessionalSessionParams(
  state: NavState | undefined
): ProfessionalSessionRouteParams | null {
  if (!state) {
    return null;
  }
  const route = getActiveRoute(state);
  if (!route?.params) {
    return null;
  }
  const p = route.params as ProfessionalSessionRouteParams;
  if (!p.profesionalId || !p.email || !p.nombre || !p.estadoSolicitud) {
    return null;
  }
  return p;
}

export function getActiveProfessionalRouteName(state: NavState | undefined): string | null {
  if (!state) {
    return null;
  }
  return getActiveRoute(state)?.name ?? null;
}

export function extractIncomingRequestIdFromState(state: NavState | undefined): string | null {
  if (!state) {
    return null;
  }
  const route = getActiveRoute(state);
  if (route?.name !== 'ProfessionalIncomingRequest' || !route.params) {
    return null;
  }
  const p = route.params as { solicitudEntranteId?: string };
  return p.solicitudEntranteId ?? null;
}
