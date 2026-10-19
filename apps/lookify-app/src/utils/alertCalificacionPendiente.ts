import { Alert } from 'react-native';

/** Bloquea salida accidental de pago/calificación (pantalla 10). Sin costos ni cancelación. */
export function alertCalificacionPendiente(alertVisibleRef: { current: boolean }): void {
  if (alertVisibleRef.current) return;

  alertVisibleRef.current = true;

  Alert.alert(
    'Califica tu experiencia',
    'Envía tu calificación para cerrar el servicio.',
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
