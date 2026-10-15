import { CommonActions, NavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from './AppNavigator';
import type { ProfessionalStackParamList } from './ProfessionalStackNavigator';

type ProfessionalStackNavigation = NativeStackNavigationProp<ProfessionalStackParamList>;

type ResetRouteArgs<RouteName extends keyof ProfessionalStackParamList> =
  undefined extends ProfessionalStackParamList[RouteName]
    ? [params?: ProfessionalStackParamList[RouteName]]
    : [params: ProfessionalStackParamList[RouteName]];

/**
 * Resetea el root a una sola ruta ProfessionalApp con el stack pro en la pantalla indicada.
 * Paridad con el flujo previo en root plano (sin Login/AccountType debajo).
 */
export function resetProfessionalSession<RouteName extends keyof ProfessionalStackParamList>(
  navigation: Pick<ProfessionalStackNavigation, 'getParent'>,
  routeName: RouteName,
  ...args: ResetRouteArgs<RouteName>
): void {
  const params = args[0];
  const root = navigation.getParent<NavigationProp<RootStackParamList>>();
  if (!root) return;

  const nestedRoute =
    params === undefined
      ? { name: routeName }
      : { name: routeName, params };

  root.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'ProfessionalApp',
          state: {
            index: 0,
            routes: [nestedRoute],
          },
        },
      ],
    })
  );
}
