// src/components/DateField.web.tsx
// Variante web: input type="date" nativo del navegador (calendario real +
// permite escribir). @react-native-community/datetimepicker no tiene
// implementación web (rompe con codegenNativeComponent), por eso Metro usa
// este archivo en web. Misma firma que DateField.tsx.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';
import { formatDateLocalISO } from '../utils/formatDateLocalISO';

type Props = {
  label?: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  error?: string;
  maximumDate?: Date;
  minimumDate?: Date;
};

function parseLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function DateField({ label = 'Fecha de nacimiento', value, onChange, error, maximumDate, minimumDate }: Props) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      {/* @ts-ignore - input solo existe en web */}
      <input
        type="date"
        aria-label={label}
        value={value ? formatDateLocalISO(value) : ''}
        max={maximumDate ? formatDateLocalISO(maximumDate) : undefined}
        min={minimumDate ? formatDateLocalISO(minimumDate) : undefined}
        onChange={(e: any) => {
          const v: string = e?.target?.value ?? '';
          onChange(v ? parseLocalDate(v) : null);
        }}
        style={styles.input}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  fieldError: {
    fontSize: 12,
    color: colors.error,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    fontSize: 14,
    color: colors.textPrimary,
    width: '100%',
    outlineStyle: 'none',
  } as any,
});
