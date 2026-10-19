// src/components/Button.tsx
// Botón reutilizable. variant="primary" = azul oscuro (acción principal de la pantalla).
// variant="accent" = miel (usar con moderación, solo para la acción MÁS importante,
// ej. "Solicitar ahora"). variant="outline" = borde, para acciones secundarias/cancelar.

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, radius, typography, spacing } from '../theme/colors';

type Variant = 'primary' | 'accent' | 'outline';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const isOutline = variant === 'outline';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        variant === 'primary' && { backgroundColor: colors.navy },
        variant === 'accent' && { backgroundColor: colors.honey },
        isOutline && {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.border,
        },
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.navy : colors.white} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: isOutline ? colors.navy : variant === 'accent' ? colors.navy : colors.white },
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.button,
  },
  disabled: {
    opacity: 0.5,
  },
});
