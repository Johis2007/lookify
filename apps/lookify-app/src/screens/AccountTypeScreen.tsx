// src/screens/AccountTypeScreen.tsx
// Pantalla 2: el usuario elige si se registra como Cliente o Profesional.
// Según la elección, navega a un formulario de registro distinto —
// el de Profesional es más largo (categorías, certificaciones, portafolio).

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import BackHeader from '../components/BackHeader';

type AccountType = 'client' | 'professional';

interface AccountTypeScreenProps {
  navigation: {
    navigate: (screen: string) => void;
  };
}

export default function AccountTypeScreen({ navigation }: AccountTypeScreenProps) {
  const [selected, setSelected] = useState<AccountType>('client');

  const handleContinue = () => {
    if (selected === 'client') {
      navigation.navigate('RegisterClient');
    } else {
      navigation.navigate('ProfessionalLogin');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <BackHeader variant="dark" />
          <Image source={require('../../assets/logo-lookify.png')} style={styles.logo} />
          <Text style={styles.brand}>Lookify</Text>
          <Text style={styles.tagline}>Belleza a un toque de distancia</Text>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>¿Cómo quieres usar Lookify?</Text>
        </View>

        <View style={styles.body}>
          <ScrollView
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.mainGroup}>
              <OptionCard
                icon="person"
                title="Soy cliente"
                description="Quiero solicitar servicios a domicilio"
                selected={selected === 'client'}
                onPress={() => setSelected('client')}
              />
              <OptionCard
                icon="scissors"
                title="Soy profesional"
                description="Quiero ofrecer mis servicios"
                selected={selected === 'professional'}
                onPress={() => setSelected('professional')}
              />
              <Button label="Continuar" onPress={handleContinue} style={styles.submitButton} />
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>
                ¿Ya tienes cuenta? <Text style={styles.loginLinkAccent}>Ingresar</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

// --- Sub-componente de tarjeta seleccionable ---
// Nota: "icon" es solo texto de marcador por ahora. Cuando instales
// @expo/vector-icons, reemplaza el círculo de abajo por el ícono real.
interface OptionCardProps {
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}

function OptionCard({ icon, title, description, selected, onPress }: OptionCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.iconCircle}>
        <Text style={styles.iconPlaceholder}>{icon === 'person' ? '👤' : '✂️'}</Text>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  screen: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  logo: {
    width: 76,
    height: 76,
    marginBottom: spacing.sm,
    resizeMode: 'contain',
  },
  brand: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.honeyLight,
  },
  tagline: {
    fontSize: 13,
    color: colors.honey,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textOnNavyMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  bodyContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  mainGroup: {
    paddingTop: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.lg,
    marginBottom: 0,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardSelected: {
    borderColor: colors.navy,
    borderWidth: 2,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.beige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    fontSize: 20,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    ...typography.heading,
  },
  cardDescription: {
    ...typography.caption,
    marginTop: 2,
  },
  loginLink: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    paddingTop: spacing.md,
  },
  loginLinkAccent: {
    color: colors.honey,
    fontWeight: '600',
  },
});
