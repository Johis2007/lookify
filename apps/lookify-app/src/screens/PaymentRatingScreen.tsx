// Pantalla 10: pago simulado y calificación (cierre del flujo cliente).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import TextField from '../components/TextField';
import StarRating from '../components/StarRating';
import PaymentMethodSelector from '../components/PaymentMethodSelector';
import { MOCK_PROFESSIONALS } from '../data/mockProfessionals';
import { SERVICIOS_POR_CATEGORIA } from '../data/mockServices';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { formatCOP } from '../utils/pricing';
import { MAX_COMENTARIO_CHARS, type MetodoPagoMock } from '../constants/paymentRating';
import { alertCalificacionPendiente } from '../utils/alertCalificacionPendiente';
import { mockEnviarCalificacion } from '../utils/mockEnviarCalificacion';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentRating'>;

function paramsPrecioValidos(
  precioServicio: number,
  precioDomicilio: number,
  precioTotal: number
): boolean {
  return precioServicio + precioDomicilio === precioTotal;
}

export default function PaymentRatingScreen({ navigation, route }: Props) {
  const params = route.params;
  const {
    professionalId,
    servicioId,
    categoriaId,
    distanciaKm,
    precioServicio,
    precioDomicilio,
    precioTotal,
  } = params;

  const professional = MOCK_PROFESSIONALS.find((p) => p.id === professionalId);
  const servicio = SERVICIOS_POR_CATEGORIA[categoriaId]?.find((s) => s.id === servicioId);

  const datosValidos = useMemo(
    () =>
      Boolean(professional && servicio) &&
      paramsPrecioValidos(precioServicio, precioDomicilio, precioTotal),
    [professional, servicio, precioServicio, precioDomicilio, precioTotal]
  );

  const allowExitRef = useRef(false);
  const alertOpenRef = useRef(false);

  const [metodoPago, setMetodoPago] = useState<MetodoPagoMock>('efectivo');
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');

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

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current) return;
      e.preventDefault();
      alertCalificacionPendiente(alertOpenRef);
    });
    return unsubscribe;
  }, [navigation]);

  const handleEnviar = () => {
    if (estrellas < 1 || !professional || !servicio) return;

    mockEnviarCalificacion({
      professionalId,
      servicioId,
      estrellas,
      comentario: comentario.trim(),
      metodoPago,
    });

    resetToHome();
  };

  if (!datosValidos || !professional || !servicio) {
    return null;
  }

  const comentarioLen = comentario.length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetAccent} />

          <MaterialCommunityIcons
            name="check-circle"
            size={56}
            color={colors.honey}
            style={styles.checkIcon}
          />
          <Text style={styles.successTitle}>Servicio finalizado</Text>
          <Text style={styles.successSubtitle}>
            {servicio.nombre} · {professional.nombre}
          </Text>

          <Text style={styles.sectionTitle}>Resumen de pago</Text>
          <View style={styles.priceBlock}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Servicio ({servicio.nombre})</Text>
              <Text style={styles.priceValue}>{formatCOP(precioServicio)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Domicilio ({distanciaKm.toFixed(1)} km)</Text>
              <Text style={styles.priceValue}>{formatCOP(precioDomicilio)}</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>Total</Text>
              <Text style={styles.priceTotalValue}>{formatCOP(precioTotal)}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Método de pago</Text>
          <PaymentMethodSelector value={metodoPago} onChange={setMetodoPago} />
          <Text style={styles.pagoSimuladoHint}>Pago simulado en esta versión</Text>

          <Text style={styles.sectionTitle}>¿Cómo fue tu experiencia?</Text>
          <StarRating value={estrellas} onChange={setEstrellas} />

          <View style={styles.commentBlock}>
            <TextField
              label="Comentario (opcional)"
              value={comentario}
              onChangeText={setComentario}
              maxLength={MAX_COMENTARIO_CHARS}
              multiline
              numberOfLines={4}
              style={styles.commentInput}
              placeholder="Cuéntanos cómo te fue…"
            />
            <Text style={styles.charCount}>
              {comentarioLen}/{MAX_COMENTARIO_CHARS}
            </Text>
          </View>

          <Button
            label="Enviar calificación"
            onPress={handleEnviar}
            variant="accent"
            disabled={estrellas < 1}
          />
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
  checkIcon: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  successTitle: {
    ...typography.heading,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  successSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading,
    fontSize: 16,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  priceBlock: {
    backgroundColor: colors.beige,
    borderRadius: radius.md,
    padding: spacing.md,
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
  pagoSimuladoHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  commentBlock: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  commentInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
});
