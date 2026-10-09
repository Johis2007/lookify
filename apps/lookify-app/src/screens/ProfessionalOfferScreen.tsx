// Pantalla 7: perfil del profesional y precio desglosado antes de aceptar.

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import { CATEGORIAS, MOCK_PROFESSIONALS } from '../data/mockProfessionals';
import { SERVICIOS_POR_CATEGORIA } from '../data/mockServices';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { estimarMinutosLlegada } from '../constants/geo';
import { redondearDistanciaKm } from '../utils/geo';
import { calcularDesglose, formatCOP } from '../utils/pricing';
import { promptCancelarSolicitud } from '../utils/cancelarSolicitudAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfessionalOffer'>;

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }, (_, i) => (
        <MaterialCommunityIcons
          key={i}
          name={i < full ? 'star' : 'star-outline'}
          size={16}
          color={colors.honey}
        />
      ))}
    </View>
  );
}

export default function ProfessionalOfferScreen({ navigation, route }: Props) {
  const params = route.params;
  const {
    categoriaId,
    categoriaNombre,
    servicioId,
    radioKm,
    rejectionCount,
    rejectedIds,
    professionalId,
    distanciaKm: distanciaParam,
  } = params;

  const allowExitRef = useRef(false);
  const alertOpenRef = useRef(false);

  const distanciaKm = useMemo(
    () => redondearDistanciaKm(distanciaParam),
    [distanciaParam]
  );

  const professional = MOCK_PROFESSIONALS.find((p) => p.id === professionalId);
  const servicio = SERVICIOS_POR_CATEGORIA[categoriaId]?.find((s) => s.id === servicioId);

  const datosValidos = Boolean(professional && servicio);

  const desglose = useMemo(() => {
    if (!professional || !servicio) return null;
    return calcularDesglose(servicio.precio, professional.ajustePrecio, distanciaKm);
  }, [professional, servicio, distanciaKm]);

  const minutosLlegada = estimarMinutosLlegada(distanciaKm);

  const resetToHome = useCallback(() => {
    allowExitRef.current = true;
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [navigation]);

  useEffect(() => {
    if (datosValidos) return;
    allowExitRef.current = true;
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [datosValidos, navigation]);

  const showCancelAlert = useCallback(() => {
    promptCancelarSolicitud({
      alertVisibleRef: alertOpenRef,
      onSeguirBuscando: () => {},
      onConfirmCancel: resetToHome,
    });
  }, [resetToHome]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current) return;
      e.preventDefault();
      showCancelAlert();
    });
    return unsubscribe;
  }, [navigation, showCancelAlert]);

  const handleAceptar = () => {
    if (!desglose || !professional || !servicio) return;
    allowExitRef.current = true;
    navigation.replace('Tracking', {
      professionalId,
      servicioId,
      categoriaId,
      distanciaKm,
      precioServicio: desglose.precioServicio,
      precioDomicilio: desglose.precioDomicilio,
      precioTotal: desglose.precioTotal,
    });
  };

  const handleBuscarOtro = () => {
    allowExitRef.current = true;
    navigation.replace('Matching', {
      categoriaId,
      categoriaNombre,
      servicioId,
      radioKm,
      rejectionCount: rejectionCount + 1,
      rejectedIds: [...rejectedIds, professionalId],
    });
  };

  if (!datosValidos || !desglose || !professional || !servicio) {
    return null;
  }

  const categoriaLabel =
    CATEGORIAS.find((c) => c.id === professional.categoria)?.nombre ?? categoriaNombre;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetAccent} />

          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{iniciales(professional.nombre)}</Text>
            </View>
            <View style={styles.profileText}>
              <Text style={styles.name}>{professional.nombre}</Text>
              <Text style={styles.category}>{categoriaLabel}</Text>
              <View style={styles.ratingRow}>
                <Stars rating={professional.calificacion} />
                <Text style={styles.ratingValue}>
                  {professional.calificacion.toFixed(1)} · {professional.totalResenas} reseñas
                </Text>
              </View>
              <Text style={styles.meta}>
                {distanciaKm.toFixed(1)} km · ~{minutosLlegada} min de llegada
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Portafolio</Text>
          <View style={styles.portfolioGrid}>
            {professional.portafolio.map((item) => (
              <View key={item} style={styles.portfolioCell}>
                <MaterialCommunityIcons name="image-outline" size={28} color={colors.textMuted} />
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Reseña destacada</Text>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewAuthor}>{professional.resenaDestacada.autor}</Text>
            <Stars rating={professional.resenaDestacada.estrellas} />
            <Text style={styles.reviewBody}>{professional.resenaDestacada.texto}</Text>
          </View>

          <Text style={styles.sectionTitle}>Precio</Text>
          <View style={styles.priceBlock}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Servicio ({servicio.nombre})</Text>
              <Text style={styles.priceValue}>{formatCOP(desglose.precioServicio)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Domicilio ({distanciaKm.toFixed(1)} km)</Text>
              <Text style={styles.priceValue}>{formatCOP(desglose.precioDomicilio)}</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>Total</Text>
              <Text style={styles.priceTotalValue}>{formatCOP(desglose.precioTotal)}</Text>
            </View>
          </View>

          <Button label="Aceptar profesional" onPress={handleAceptar} variant="accent" />

          <Button label="Buscar otro profesional" onPress={handleBuscarOtro} variant="outline" />

          {rejectionCount === 2 ? (
            <Text style={styles.thirdRejectHint}>
              Este sería tu tercer rechazo; después podrás ampliar el radio o cancelar
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.beige,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  sheetAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: colors.honey,
  },
  profileRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 18,
  },
  profileText: {
    flex: 1,
  },
  name: {
    ...typography.heading,
    fontSize: 18,
  },
  category: {
    ...typography.caption,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingValue: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    ...typography.heading,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  portfolioCell: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: colors.beige,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCard: {
    backgroundColor: colors.beige,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  reviewAuthor: {
    fontWeight: '600',
    fontSize: 13,
    color: colors.textPrimary,
  },
  reviewBody: {
    ...typography.body,
    marginTop: spacing.xs,
  },
  priceBlock: {
    backgroundColor: colors.beige,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  priceLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    paddingRight: spacing.sm,
  },
  priceValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  priceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  priceTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  priceTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  thirdRejectHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});
