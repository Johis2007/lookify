// Barra superior con flecha atrás y título opcional centrado.
// No aplica safe area: la pantalla ya usa SafeAreaView.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme/colors';

const BACK_ICON: keyof typeof MaterialCommunityIcons.glyphMap = 'arrow-left';

type Variant = 'light' | 'dark';

interface BackHeaderProps {
  title?: string;
  onBack?: () => void;
  variant?: Variant;
  rightSlot?: React.ReactNode;
}

export default function BackHeader({
  title,
  onBack,
  variant = 'light',
  rightSlot,
}: BackHeaderProps) {
  const navigation = useNavigation();

  const handleBack = onBack ?? (() => navigation.goBack());
  const showBack = onBack != null || navigation.canGoBack();

  const iconColor = variant === 'dark' ? colors.textOnNavy : colors.navy;
  const titleColor = variant === 'dark' ? colors.textOnNavy : colors.navy;

  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {showBack ? (
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={styles.backButton}
          >
            <MaterialCommunityIcons name={BACK_ICON} size={24} color={iconColor} />
          </Pressable>
        ) : null}
      </View>

      {title ? (
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.titleSpacer} />
      )}

      <View style={styles.side}>{rightSlot ?? null}</View>
    </View>
  );
}

const SIDE_WIDTH = 44;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: SIDE_WIDTH,
    width: '100%',
  },
  side: {
    width: SIDE_WIDTH,
    minHeight: SIDE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: SIDE_WIDTH,
    height: SIDE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.title.fontSize,
    fontWeight: typography.title.fontWeight,
  },
  titleSpacer: {
    flex: 1,
  },
});
