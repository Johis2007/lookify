import { Alert } from 'react-native';

interface PromptCancelarSolicitudOptions {
  alertVisibleRef: { current: boolean };
  onBeforeShow?: () => void;
  onSeguirBuscando: () => void;
  onConfirmCancel: () => void;
}

/** Alerta compartida: cancelar la solicitud en curso (Matching / Oferta). */
export function promptCancelarSolicitud({
  alertVisibleRef,
  onBeforeShow,
  onSeguirBuscando,
  onConfirmCancel,
}: PromptCancelarSolicitudOptions): void {
  if (alertVisibleRef.current) return;

  onBeforeShow?.();
  alertVisibleRef.current = true;

  Alert.alert(
    'Cancelar solicitud',
    '¿Seguro que quieres cancelar la búsqueda?',
    [
      {
        text: 'Seguir buscando',
        style: 'cancel',
        onPress: () => {
          alertVisibleRef.current = false;
          onSeguirBuscando();
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
