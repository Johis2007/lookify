import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '../theme/colors';

interface StarRatingProps {
  value: number;
  onChange?: (stars: number) => void;
  maxStars?: number;
  readOnly?: boolean;
  size?: number;
}

export default function StarRating({
  value,
  onChange,
  maxStars = 5,
  readOnly = false,
  size = 36,
}: StarRatingProps) {
  const displayValue = readOnly ? Math.floor(value) : value;

  return (
    <View style={styles.row}>
      {Array.from({ length: maxStars }, (_, i) => {
        const starValue = i + 1;
        const filled = starValue <= displayValue;
        const icon = (
          <MaterialCommunityIcons
            name={filled ? 'star' : 'star-outline'}
            size={size}
            color={colors.honey}
          />
        );
        if (readOnly) {
          return (
            <View key={starValue} style={styles.starHit} accessible accessibilityLabel={`${starValue} estrellas`}>
              {icon}
            </View>
          );
        }
        return (
          <Pressable
            key={starValue}
            onPress={() => onChange?.(starValue)}
            style={styles.starHit}
            accessibilityRole="button"
            accessibilityLabel={`Calificar con ${starValue} ${starValue === 1 ? 'estrella' : 'estrellas'}`}
            accessibilityState={{ selected: filled }}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  starHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
