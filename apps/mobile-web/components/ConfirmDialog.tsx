import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Lookify } from '@/constants/Lookify';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Modal de confirmación: bloquea la pantalla hasta que el usuario responde.
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.cancelBtn]} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, destructive ? styles.dangerBtn : styles.confirmBtn]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Hook: controla el Modal desde cualquier pantalla.
// Ejemplo: const confirm = useConfirm(); ... confirm.show("¿Cancelar reserva?") ... <ConfirmDialog {...confirm.dialogProps} />
export function useConfirm() {
  const [state, setState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    destructive?: boolean;
    resolve?: (v: boolean) => void;
  }>({ visible: false, title: '' });

  const hide = useCallback((result: boolean) => {
    setState((s) => {
      s.resolve?.(result);
      return { ...s, visible: false, resolve: undefined };
    });
  }, []);

  const show = useCallback(
    (title: string, message?: string, opts?: { destructive?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setState({ visible: true, title, message, destructive: opts?.destructive, resolve });
      }),
    []
  );

  const dialogProps: ConfirmDialogProps = {
    visible: state.visible,
    title: state.title,
    message: state.message,
    destructive: state.destructive,
    onConfirm: () => hide(true),
    onCancel: () => hide(false),
  };

  return { show, dialogProps };
}

// Alerta nativa: iOS UIAlertController / Android AlertDialog.
// Úsala para confirmaciones rápidas sin diseño custom.
export function confirmNative(
  title: string,
  message: string,
  confirmLabel = 'Confirmar',
  opts?: { destructive?: boolean; cancelLabel?: string }
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: opts?.cancelLabel ?? 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: opts?.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43,27,23,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: Lookify.radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: Lookify.colors.line,
    gap: 8,
  },
  title: { fontSize: 17, fontWeight: '900', color: Lookify.colors.ink, textAlign: 'center' },
  message: { fontSize: 14, color: Lookify.colors.muted, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, borderRadius: 12, padding: 13, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: Lookify.colors.line },
  confirmBtn: { backgroundColor: Lookify.colors.primary },
  dangerBtn: { backgroundColor: Lookify.colors.danger },
  cancelText: { fontWeight: '800', color: Lookify.colors.ink },
  confirmText: { fontWeight: '800', color: '#fff' },
});
