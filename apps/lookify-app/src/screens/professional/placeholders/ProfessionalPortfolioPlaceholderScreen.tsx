// App Profesional — pantalla 7 provisional: Mi portafolio (sin construir).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import BackHeader from '../../../components/BackHeader';
import { colors, radius, spacing, typography } from '../../../theme/colors';
import { ProfessionalStackParamList } from '../../../navigation/ProfessionalStackNavigator';

type Props = NativeStackScreenProps<ProfessionalStackParamList, 'ProfessionalPortfolioPlaceholder'>;

export default function ProfessionalPortfolioPlaceholderScreen(_props: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <BackHeader title="Mi portafolio" />
      <View style={styles.content}>
        <Text style={styles.badge}>sin construir</Text>
        <Text style={styles.title}>Mi portafolio</Text>
        <Text style={styles.hint}>Próximamente podrás gestionar fotos de tu trabajo aquí.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.beige,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  badge: {
    ...typography.caption,
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
