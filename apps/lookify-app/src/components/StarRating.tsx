import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '../theme/colors';

interface StarRatingProps {
  value: number;
  onChange: (stars: number) => void;
  maxStars?: number;
}

export default function StarRating({ value, onChange, maxStars = 5 }: StarRatingProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: maxStars }, (_, i) => {
        const starValue = i + 1;
        const filled = starValue <= value;
        return (
          <Pressable
            key={starValue}
            onPress={() => onChange(starValue)}
            style={styles.starHit}
            accessibilityRole="button"
            accessibilityLabel={`Calificar con ${starValue} ${starValue === 1 ? 'estrella' : 'estrellas'}`}
            accessibilityState={{ selected: filled }}
          >
            <MaterialCommunityIcons
              name={filled ? 'star' : 'star-outline'}
              size={36}
              color={colors.honey}
            />
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
