// Pantalla 7: perfil del profesional y precio desglosado antes de aceptar.
//  - Modo demo: profesional y precio del catálogo de ejemplo.
//  - Modo backend (4B): ficha pública real (professionalPublic) y precio que
//    calculó el servidor.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { estimarMinutosLlegada, MOCK_CLIENT_LOCATION } from '../constants/geo';
import { redondearDistanciaKm } from '../utils/geo';
import { calcularDesglose, formatCOP } from '../utils/pricing';
import { promptCancelarSolicitud } from '../utils/cancelarSolicitudAlert';
import { isBackendEnabled } from '../services/backend/initBackend';
import { getBookingService } from '../services/bookingService';

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

type ServicioVista = { id: string; nombre: string; precio: number };

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

  const modoReal = isBackendEnabled() && Boolean(params.profesional);

  const allowExitRef = useRef(false);
  const alertOpenRef = useRef(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const distanciaKm = useMemo(
    () => redondearDistanciaKm(distanciaParam),
    [distanciaParam]
  );

  // Profesional: mock (demo) o ficha pública real (backend).
  const professional = useMemo(() => {
    if (modoReal && params.profesional) {
      return {
        id: params.profesional.id,
        nombre: params.profesional.nombre,
        calificacion: params.profesional.calificacion ?? 0,
        totalResenas: null as number | null,
        verificado: true,
        portafolio: [] as string[],
        resenaDestacada: null as { autor: string; texto: string; estrellas: number } | null,
      };
    }
    const p = MOCK_PROFESSIONALS.find((m) => m.id === professionalId);
    if (!p) return null;
    return {
      id: p.id,
      nombre: p.nombre,
      calificacion: p.calificacion,
      totalResenas: p.totalResenas as number | null,
      verificado: p.verificado,
      portafolio: p.portafolio,
      resenaDestacada: p.resenaDestacada,
    };
  }, [modoReal, params.profesional, professionalId]);

  // Servicio: catálogo de ejemplo (demo) o el nombre/precio del servidor.
  const servicio: ServicioVista | null = useMemo(() => {
    if (modoReal) {
      return {
        id: servicioId,
        nombre: params.servicioNombre ?? 'Servicio reservado',
        precio: params.precioServidor ?? 0,
      };
    }
    const s = SERVICIOS_POR_CATEGORIA[categoriaId]?.find((m) => m.id === servicioId);
    return s ? { id: s.id, nombre: s.nombre, precio: s.precio } : null;
  }, [modoReal, categoriaId, servicioId, params.servicioNombre, params.precioServidor]);

  const datosValidos = Boolean(professional && servicio);

  const desglose = useMemo(() => {
    if (!professional || !servicio) return null;
    if (modoReal) {
      // El precio del servidor es la base; el domicilio se confirma al final.
      const precio = params.precioServidor ?? servicio.precio;
      return { precioServicio: precio, precioDomicilio: 0, precioTotal: precio };
    }
    const mock = MOCK_PROFESSIONALS.find((m) => m.id === professional.id);
    return calcularDesglose(servicio.precio, mock?.ajustePrecio ?? 1, distanciaKm);
  }, [professional, servicio, distanciaKm, modoReal, params.precioServidor]);

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
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
      ...(params.profesional ? { profesional: params.profesional } : {}),
      ...(params.servicioNombre ? { servicioNombre: params.servicioNombre } : {}),
    });
  };

  // Demo: se busca otro profesional en la misma búsqueda.
  // Backend: se cancela la reserva actual y se abre una nueva búsqueda.
  const handleBuscarOtro = useCallback(async () => {
    if (!modoReal) {
      allowExitRef.current = true;
      navigation.replace('Matching', {
        categoriaId,
        categoriaNombre,
        servicioId,
        radioKm,
        rejectionCount: rejectionCount + 1,
        rejectedIds: [...rejectedIds, professionalId],
        ...(params.bookingId ? { bookingId: params.bookingId } : {}),
      });
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      if (params.bookingId) {
        await getBookingService().cancelarReserva(params.bookingId).catch(() => undefined);
      }
      const reserva = await getBookingService().crearReserva({
        serviceId: servicioId,
        addressText: 'Dirección a confirmar',
        lat: MOCK_CLIENT_LOCATION.latitude,
        lng: MOCK_CLIENT_LOCATION.longitude,
      });
      allowExitRef.current = true;
      navigation.replace('Matching', {
        categoriaId,
        categoriaNombre,
        servicioId,
        radioKm: 3,
        rejectionCount: 0,
        rejectedIds: [],
        bookingId: reserva.bookingId,
      });
    } catch {
      setError('No pudimos abrir una nueva búsqueda. Intenta de nuevo.');
    } finally {
      setTrabajando(false);
    }
  }, [modoReal, categoriaId, categoriaNombre, servicioId, radioKm, rejectionCount, rejectedIds, professionalId, params.bookingId, navigation]);

  if (!datosValidos || !desglose || !professional || !servicio) {
    return null;
  }

  const categoriaLabel =
    CATEGORIAS.find((c) => c.id === categoriaId)?.nombre ?? categoriaNombre;

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
                  {professional.calificacion > 0
                    ? `${professional.calificacion.toFixed(1)}${
                        professional.totalResenas !== null
                          ? ` · ${professional.totalResenas} reseñas`
                          : ''
                      }`
                    : 'Nuevo en Lookify'}
                </Text>
              </View>
              <Text style={styles.meta}>
                {distanciaKm.toFixed(1)} km · ~{minutosLlegada} min de llegada
              </Text>
              {professional.verificado ? (
                <View style={styles.verifiedRow}>
                  <MaterialCommunityIcons
                    name="shield-check-outline"
                    size={14}
                    color={colors.honey}
                  />
                  <Text style={styles.verifiedText}>Profesional verificado</Text>
                </View>
              ) : null}
            </View>
          </View>

          {professional.portafolio.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Portafolio</Text>
              <View style={styles.portfolioGrid}>
                {professional.portafolio.map((item) => (
                  <View key={item} style={styles.portfolioCell}>
                    <MaterialCommunityIcons name="image-outline" size={28} color={colors.textMuted} />
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {professional.resenaDestacada ? (
            <>
              <Text style={styles.sectionTitle}>Reseña destacada</Text>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewAuthor}>{professional.resenaDestacada.autor}</Text>
                <Stars rating={professional.resenaDestacada.estrellas} />
                <Text style={styles.reviewBody}>{professional.resenaDestacada.texto}</Text>
              </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Precio</Text>
          <View style={styles.priceBlock}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Servicio ({servicio.nombre})</Text>
              <Text style={styles.priceValue}>{formatCOP(desglose.precioServicio)}</Text>
            </View>
            {!modoReal ? (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Domicilio ({distanciaKm.toFixed(1)} km)</Text>
                <Text style={styles.priceValue}>{formatCOP(desglose.precioDomicilio)}</Text>
              </View>
            ) : null}
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>Total</Text>
              <Text style={styles.priceTotalValue}>{formatCOP(desglose.precioTotal)}</Text>
            </View>
            {modoReal ? (
              <Text style={styles.priceNote}>
                Precio calculado por el servidor. El domicilio se confirma al terminar el servicio.
              </Text>
            ) : null}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            label={modoReal ? 'Ver seguimiento' : 'Aceptar profesional'}
            onPress={handleAceptar}
            variant="accent"
            disabled={trabajando}
          />

          <Button
            label="Buscar otro profesional"
            onPress={handleBuscarOtro}
            variant="outline"
            disabled={trabajando}
          />

          {rejectionCount === 2 && !modoReal ? (
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
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  verifiedText: {
    fontSize: 12,
    color: colors.textSecondary,
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
  priceNote: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  thirdRejectHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});
