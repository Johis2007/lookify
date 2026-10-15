import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/colors';
import { METODOS_PAGO, type MetodoPagoMock } from '../constants/paymentRating';

interface PaymentMethodSelectorProps {
  value: MetodoPagoMock;
  onChange: (method: MetodoPagoMock) => void;
}

export default function PaymentMethodSelector({ value, onChange }: PaymentMethodSelectorProps) {
  return (
    <View style={styles.list}>
      {METODOS_PAGO.map((metodo) => {
        const selected = value === metodo.id;
        return (
          <Pressable
            key={metodo.id}
            onPress={() => onChange(metodo.id)}
            style={[styles.option, selected && styles.optionSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={metodo.label}
          >
            <MaterialCommunityIcons
              name={metodo.icon as keyof typeof MaterialCommunityIcons.glyphMap}
              size={22}
              color={selected ? colors.navy : colors.textSecondary}
            />
            <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
              {metodo.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  optionSelected: {
    borderColor: colors.honey,
    backgroundColor: colors.beige,
  },
  optionLabel: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  optionLabelSelected: {
    color: colors.navy,
    fontWeight: '600',
  },
});
