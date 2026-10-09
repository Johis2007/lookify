// src/components/DateField.tsx
// Campo de fecha de nacimiento. En runtime Metro elige:
// - este archivo en iOS/Android (DateTimePicker nativo con onChange real)
// - DateField.web.tsx en web (input type="date": calendario + escritura).
// Importar siempre sin extensión:
//   import DateField from '../components/DateField';

import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { colors, radius, spacing, typography } from '../theme/colors';

type Props = {
  label?: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  error?: string;
  maximumDate?: Date;
  minimumDate?: Date;
};

export function formatFechaLarga(date: Date | null): string {
  if (!date) return 'Selecciona tu fecha de nacimiento';
  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function DateField({ label = 'Fecha de nacimiento', value, onChange, error, maximumDate, minimumDate }: Props) {
  const [open, setOpen] = useState(false);

  // API v9 de la librería: onValueChange(event, date) al elegir valor y
  // onDismiss() al cancelar. (El onChange genérico está deprecado.)
  const handleValueChange = (_event: DateTimePickerChangeEvent, selected: Date) => {
    onChange(selected);
    if (Platform.OS === 'android') setOpen(false);
  };

  const handleDismiss = () => setOpen(false);

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.dateButton, error ? styles.dateButtonError : null]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.dateButtonText, !value && styles.datePlaceholder]}>
          {formatFechaLarga(value)}
        </Text>
      </TouchableOpacity>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {open && (
        <DateTimePicker
          value={value ?? new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onValueChange={handleValueChange}
          onDismiss={handleDismiss}
        />
      )}
      {Platform.OS === 'ios' && open && (
        <TouchableOpacity style={styles.dateDone} onPress={() => setOpen(false)}>
          <Text style={styles.dateDoneText}>Listo</Text>
        </TouchableOpacity>
      )}
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
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
  },
  dateButtonError: {
    borderColor: colors.error,
    marginBottom: spacing.xs,
  },
  dateButtonText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  datePlaceholder: {
    color: colors.textMuted,
  },
  dateDone: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  dateDoneText: {
    color: colors.honey,
    fontWeight: '600',
    fontSize: 14,
  },
});
