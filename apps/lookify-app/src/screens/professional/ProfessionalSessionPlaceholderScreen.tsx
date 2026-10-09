import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../../components/Button';
import { colors, radius, spacing, typography } from '../../theme/colors';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { ProfessionalSessionRouteParams } from '../../types/professionalAuth';

type PlaceholderRouteNames =
  | 'ProfessionalDashboardPlaceholder'
  | 'ProfessionalVerificationPlaceholder'
  | 'ProfessionalServiceSelectionPlaceholder'
  | 'ProfessionalCertificateUploadPlaceholder';

function SessionDetails({ params }: { params: ProfessionalSessionRouteParams }) {
  return (
    <View style={styles.details}>
      <Text style={styles.detailLine}>
        <Text style={styles.detailLabel}>profesionalId: </Text>
        {params.profesionalId}
      </Text>
      <Text style={styles.detailLine}>
        <Text style={styles.detailLabel}>solicitudId: </Text>
        {params.solicitudId ?? '—'}
      </Text>
      <Text style={styles.detailLine}>
        <Text style={styles.detailLabel}>nombre: </Text>
        {params.nombre}
      </Text>
      <Text style={styles.detailLine}>
        <Text style={styles.detailLabel}>estadoSolicitud: </Text>
        {params.estadoSolicitud}
      </Text>
      {params.onboardingPaso ? (
        <Text style={styles.detailLine}>
          <Text style={styles.detailLabel}>onboardingPaso: </Text>
          {params.onboardingPaso}
        </Text>
      ) : null}
    </View>
  );
}

export function createProfessionalPlaceholderScreen(screenTitle: string) {
  return function ProfessionalPlaceholderScreen({
    navigation,
    route,
  }: NativeStackScreenProps<RootStackParamList, PlaceholderRouteNames>) {
    const params = route.params;

    const handleLogout = () => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'ProfessionalLogin' }],
      });
    };

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.badge}>sin construir</Text>
          <Text style={styles.title}>{screenTitle}</Text>
          <SessionDetails params={params} />
          <Button
            label="Cerrar sesión (temporal)"
            variant="outline"
            onPress={handleLogout}
            style={styles.logoutButton}
          />
        </View>
      </SafeAreaView>
    );
  };
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
    marginBottom: spacing.lg,
  },
  details: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  detailLine: {
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  detailLabel: {
    fontWeight: '600',
    color: colors.textSecondary,
  },
  logoutButton: {
    marginTop: spacing.md,
  },
});
