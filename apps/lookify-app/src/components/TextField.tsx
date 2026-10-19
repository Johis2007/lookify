// Input de texto reutilizable con label arriba, siguiendo el sistema de diseño.

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/colors';

const ICON_EYE_HIDDEN: keyof typeof MaterialCommunityIcons.glyphMap = 'eye-outline';
const ICON_EYE_VISIBLE: keyof typeof MaterialCommunityIcons.glyphMap = 'eye-off-outline';

const TOGGLE_SIZE = 44;

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export default function TextField({
  label,
  error,
  style,
  secureTextEntry,
  onBlur,
  autoCapitalize,
  autoCorrect,
  ...inputProps
}: TextFieldProps) {
  const hasError = Boolean(error);
  const isPassword = secureTextEntry === true;
  const [visible, setVisible] = useState(false);
  const suppressBlurRef = useRef(false);

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false;
      return;
    }
    onBlur?.(event);
  };

  const markTogglePress = () => {
    suppressBlurRef.current = true;
  };

  const toggleVisibility = () => {
    setVisible((prev) => !prev);
  };

  const passwordInputProps = isPassword
    ? {
        secureTextEntry: !visible,
        autoCapitalize: autoCapitalize ?? ('none' as const),
        autoCorrect: autoCorrect ?? false,
      }
    : {
        secureTextEntry,
        autoCapitalize,
        autoCorrect,
      };

  const toggleIcon = visible ? ICON_EYE_VISIBLE : ICON_EYE_HIDDEN;
  const toggleA11yLabel = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {isPassword ? (
        <View style={[styles.inputRow, hasError && styles.inputRowError]}>
          <TextInput
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.inputWithToggle, style]}
            {...inputProps}
            {...passwordInputProps}
            onBlur={handleBlur}
          />
          <Pressable
            onTouchStart={markTogglePress}
            onPressIn={markTogglePress}
            onPress={toggleVisibility}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={toggleA11yLabel}
            style={styles.toggleButton}
          >
            <MaterialCommunityIcons name={toggleIcon} size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, hasError && styles.inputError, style]}
          onBlur={onBlur}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          {...inputProps}
        />
      )}
      {hasError ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.white,
  },
  inputError: {
    borderColor: colors.error,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  inputRowError: {
    borderColor: colors.error,
  },
  inputWithToggle: {
    flex: 1,
    borderWidth: 0,
    paddingRight: spacing.sm,
    backgroundColor: 'transparent',
  },
  toggleButton: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
