import { Alert } from 'react-native';

/** Atrás bloqueado tras INICIADO: informar sin ofrecer cancelación ni costos. */
export function alertServicioEnCurso(alertVisibleRef: { current: boolean }): void {
  if (alertVisibleRef.current) return;

  alertVisibleRef.current = true;

  Alert.alert(
    'Servicio en curso',
    'El servicio ya está en curso',
    [
      {
        text: 'Entendido',
        onPress: () => {
          alertVisibleRef.current = false;
        },
      },
    ],
    {
      cancelable: true,
      onDismiss: () => {
        alertVisibleRef.current = false;
      },
    }
  );
}
