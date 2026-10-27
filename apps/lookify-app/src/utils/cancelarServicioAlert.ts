import { Alert } from 'react-native';

interface PromptCancelarServicioOptions {
  alertVisibleRef: { current: boolean };
  onContinuar: () => void;
  onConfirmCancel: () => void;
}

/** Confirmación neutra al cancelar en EN_CAMINO (pantalla 8). Sin montos ni promesas de costo. */
export function promptCancelarServicio({
  alertVisibleRef,
  onContinuar,
  onConfirmCancel,
}: PromptCancelarServicioOptions): void {
  if (alertVisibleRef.current) return;

  alertVisibleRef.current = true;

  Alert.alert(
    'Cancelar servicio',
    '¿Seguro que quieres cancelar el servicio?',
    [
      {
        text: 'No, continuar',
        style: 'cancel',
        onPress: () => {
          alertVisibleRef.current = false;
          onContinuar();
        },
      },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: () => {
          alertVisibleRef.current = false;
          onConfirmCancel();
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

/** Mock hasta que exista backend / push al profesional. */
export function mockNotificarProfesionalCancelacion(professionalId: string): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[mock] Profesional ${professionalId} notificado: el cliente canceló el servicio.`);
  }
}
