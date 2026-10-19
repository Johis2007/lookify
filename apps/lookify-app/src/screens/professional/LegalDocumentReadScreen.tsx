import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackHeader from '../../components/BackHeader';
import { colors, radius, spacing, typography } from '../../theme/colors';
import { LegalSection } from '../../constants/legal/termsProfessionalContent';

interface LegalDocumentReadScreenProps {
  title: string;
  version: string;
  vigenciaLabel: string;
  sections: LegalSection[];
  showContactPendingDev?: boolean;
}

export default function LegalDocumentReadScreen({
  title,
  version,
  vigenciaLabel,
  sections,
  showContactPendingDev = false,
}: LegalDocumentReadScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader variant="dark" />
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {__DEV__ ? (
          <Text style={styles.devBanner}>BORRADOR sujeto a revisión legal</Text>
        ) : null}
        {__DEV__ && showContactPendingDev ? (
          <Text style={styles.devBanner}>
            Datos de contacto del responsable: PENDIENTES (relleno). Ver PROGRESS.md.
          </Text>
        ) : null}
        <Text style={styles.meta}>
          Versión {version} · Vigencia desde {vigenciaLabel}
        </Text>
        {sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph, index) => (
              <Text key={`${section.id}-${index}`} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    marginTop: spacing.sm,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  devBanner: {
    ...typography.caption,
    color: colors.error,
    backgroundColor: colors.beige,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  meta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: spacing.sm,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
});
