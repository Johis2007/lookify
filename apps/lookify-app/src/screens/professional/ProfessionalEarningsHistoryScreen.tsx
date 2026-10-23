// App Profesional — pantalla 10: Historial / ingresos (ruta: ProfessionalEarningsHistory).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '../../theme/colors';
import Button from '../../components/Button';
import BackHeader from '../../components/BackHeader';
import { ProfessionalStackParamList } from '../../navigation/ProfessionalStackNavigator';
import { resetProfessionalSession } from '../../navigation/professionalNavigation';
import { getProfessionalEarningsHistoryService } from '../../services/professionalEarningsHistoryService';
import { ServiceError } from '../../services/errors';
import {
  HistorialIngresosItem,
  PeriodoHistorialIngresos,
  ResumenPeriodoHistorial,
} from '../../types/professionalEarningsHistory';
import { PERIODOS_HISTORIAL } from '../../constants/professionalEarningsHistory';
import { MOTIVOS_CANCELACION_PROFESIONAL } from '../../constants/professionalServiceInProgress';
import { formatFechaHoraBogota } from '../../utils/bogotaTime';
import { formatCOP } from '../../utils/pricing';

type Props = NativeStackScreenProps<ProfessionalStackParamList, 'ProfessionalEarningsHistory'>;

function etiquetaMotivoCancelacion(
  codigo: HistorialIngresosItem['motivoCancelacion']
): string {
  if (!codigo) return 'Cancelado';
  const found = MOTIVOS_CANCELACION_PROFESIONAL.find((m) => m.codigo === codigo);
  return found?.etiqueta ?? 'Cancelado';
}

function mensajeErrorHistorial(error: unknown, contexto: 'carga' | 'pagina'): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'NETWORK':
        return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
      case 'PROFESIONAL_NO_HABILITADO':
      case 'VALIDATION':
        return 'No pudimos cargar tu historial. Vuelve a iniciar sesión.';
      case 'PERIODO_INVALIDO':
      case 'CURSOR_INVALIDO':
        return contexto === 'pagina'
          ? 'No pudimos cargar más servicios. Inténtalo de nuevo.'
          : 'No pudimos cargar tu historial. Inténtalo de nuevo.';
      default:
        return 'No pudimos cargar tu historial. Inténtalo de nuevo.';
    }
  }
  return 'No pudimos cargar tu historial. Inténtalo de nuevo.';
}

function ResumenCard({ resumen }: { resumen: ResumenPeriodoHistorial }) {
  return (
    <View style={styles.resumenCard}>
      {__DEV__ && resumen.contieneSemillaEnPeriodo ? (
        <Text style={styles.seedBadge} accessibilityLabel="Datos de ejemplo">
          Datos de ejemplo
        </Text>
      ) : null}
      <Text style={styles.resumenLine}>
        Finalizados:{' '}
        <Text style={styles.resumenValue}>{resumen.cantidadFinalizados}</Text>
      </Text>
      <Text style={styles.resumenLine}>
        Cancelados:{' '}
        <Text style={styles.resumenValue}>{resumen.cantidadCancelados}</Text>
      </Text>
      <View style={styles.resumenDivider} />
      <Text
        style={styles.resumenLine}
        accessibilityLabel={`Total cobrado ${formatCOP(resumen.totalCop)}`}
      >
        Total: <Text style={styles.resumenValue}>{formatCOP(resumen.totalCop)}</Text>
      </Text>
      <Text
        style={styles.resumenLine}
        accessibilityLabel={`Comisión Lookify ${formatCOP(resumen.comisionCop)}`}
      >
        Comisión Lookify:{' '}
        <Text style={styles.resumenValue}>{formatCOP(resumen.comisionCop)}</Text>
      </Text>
      <Text
        style={styles.resumenLine}
        accessibilityLabel={`Neto ${formatCOP(resumen.netoCop)}`}
      >
        Neto: <Text style={styles.resumenValueStrong}>{formatCOP(resumen.netoCop)}</Text>
      </Text>
      {resumen.comisionEfectivoCop > 0 ? (
        <Text
          style={styles.efectivoResumen}
          accessibilityLabel={`Comisión por servicios en efectivo ${formatCOP(resumen.comisionEfectivoCop)}`}
        >
          Comisión por servicios en efectivo: {formatCOP(resumen.comisionEfectivoCop)}
        </Text>
      ) : null}
    </View>
  );
}

function HistorialRow({ item }: { item: HistorialIngresosItem }) {
  const fecha = formatFechaHoraBogota(item.cerradoEnMs);
  const metodo =
    item.metodoPago === 'EFECTIVO' ? 'Efectivo' : 'Digital';

  if (item.estado === 'CANCELADO') {
    const motivo = etiquetaMotivoCancelacion(item.motivoCancelacion);
    return (
      <View style={styles.row} accessibilityRole="summary">
        <Text style={styles.rowTitle}>{item.servicioNombre}</Text>
        <Text style={styles.rowMeta}>
          {item.clientePrimerNombre} · {fecha}
        </Text>
        <Text style={styles.cancelBadge}>Cancelado</Text>
        <Text style={styles.rowMotivo}>{motivo}</Text>
        <Text style={styles.rowMuted}>{metodo}</Text>
        <Text
          style={styles.rowMuted}
          accessibilityLabel="Total cero pesos"
        >
          Total: {formatCOP(0)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.row} accessibilityRole="summary">
      <Text style={styles.rowTitle}>{item.servicioNombre}</Text>
      <Text style={styles.rowMeta}>
        {item.clientePrimerNombre} · {fecha}
      </Text>
      <Text style={styles.rowMuted}>{metodo}</Text>
      <Text accessibilityLabel={`Total ${formatCOP(item.precioTotalCop)}`}>
        Total: <Text style={styles.rowAmount}>{formatCOP(item.precioTotalCop)}</Text>
      </Text>
      <Text accessibilityLabel={`Comisión ${formatCOP(item.comisionCop)}`}>
        Comisión: {formatCOP(item.comisionCop)}
      </Text>
      <Text accessibilityLabel={`Neto ${formatCOP(item.netoCop)}`}>
        Neto: <Text style={styles.rowAmount}>{formatCOP(item.netoCop)}</Text>
      </Text>
      {item.metodoPago === 'EFECTIVO' && item.comisionCop > 0 ? (
        <Text style={styles.debesLookify}>
          Debes a Lookify: {formatCOP(item.comisionCop)}
        </Text>
      ) : null}
    </View>
  );
}

export default function ProfessionalEarningsHistoryScreen({ navigation, route }: Props) {
  const params = route.params;
  const profesionalId = params?.profesionalId;
  const solicitudId = params?.solicitudId;
  const queryGen = useRef(0);
  const loadingMoreGuard = useRef(false);
  const sembradoDev = useRef(false);

  const [periodo, setPeriodo] = useState<PeriodoHistorialIngresos>('HOY');
  const [resumen, setResumen] = useState<ResumenPeriodoHistorial | null>(null);
  const [items, setItems] = useState<HistorialIngresosItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageError, setPageError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const validarSesion = useCallback((): boolean => {
    if (!profesionalId || !solicitudId) {
      resetProfessionalSession(navigation, 'ProfessionalLogin');
      return false;
    }
    return true;
  }, [navigation, profesionalId, solicitudId]);

  const cargarPaginaInicial = useCallback(
    async (periodoActivo: PeriodoHistorialIngresos, modo: 'normal' | 'refresh') => {
      if (!validarSesion()) return;

      const gen = ++queryGen.current;
      loadingMoreGuard.current = false;
      if (modo === 'normal') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setLoadError(null);
      setPageError(false);

      try {
        if (__DEV__ && !sembradoDev.current) {
          sembradoDev.current = true;
          await getProfessionalEarningsHistoryService().sembrarHistorialDemo({
            profesionalId: params.profesionalId,
          });
        }

        const svc = getProfessionalEarningsHistoryService();
        const [resResumen, resLista] = await Promise.all([
          svc.obtenerResumenPeriodo({
            profesionalId: params.profesionalId,
            periodo: periodoActivo,
          }),
          svc.listarHistorial({
            profesionalId: params.profesionalId,
            periodo: periodoActivo,
          }),
        ]);

        if (gen !== queryGen.current) return;

        setResumen(resResumen.resumen);
        setItems(resLista.items);
        setNextCursor(resLista.nextCursor);
      } catch (error) {
        if (gen !== queryGen.current) return;
        if (error instanceof ServiceError && error.code === 'PROFESIONAL_NO_HABILITADO') {
          resetProfessionalSession(navigation, 'ProfessionalLogin');
          return;
        }
        setLoadError(mensajeErrorHistorial(error, 'carga'));
        setResumen(null);
        setItems([]);
        setNextCursor(null);
      } finally {
        if (gen === queryGen.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [navigation, params.profesionalId, validarSesion]
  );

  const cargarMas = useCallback(async () => {
    if (!validarSesion() || !nextCursor || loadingMoreGuard.current) return;

    loadingMoreGuard.current = true;
    setLoadingMore(true);
    setPageError(false);
    const gen = queryGen.current;
    const cursor = nextCursor;
    const periodoActivo = periodo;

    try {
      const res = await getProfessionalEarningsHistoryService().listarHistorial({
        profesionalId: params.profesionalId,
        periodo: periodoActivo,
        cursor,
      });
      if (gen !== queryGen.current) return;
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (error) {
      if (gen !== queryGen.current) return;
      if (error instanceof ServiceError && error.code === 'PROFESIONAL_NO_HABILITADO') {
        resetProfessionalSession(navigation, 'ProfessionalLogin');
        return;
      }
      setPageError(true);
    } finally {
      if (gen === queryGen.current) {
        loadingMoreGuard.current = false;
        setLoadingMore(false);
      }
    }
  }, [navigation, nextCursor, params.profesionalId, periodo, validarSesion]);

  const omitirRecargaEnPrimerFoco = useRef(true);

  useEffect(() => {
    const id = setTimeout(() => {
      void cargarPaginaInicial(periodo, 'normal');
    }, 0);
    return () => clearTimeout(id);
  }, [periodo, cargarPaginaInicial]);

  useFocusEffect(
    useCallback(() => {
      if (omitirRecargaEnPrimerFoco.current) {
        omitirRecargaEnPrimerFoco.current = false;
        return;
      }
      void cargarPaginaInicial(periodo, 'refresh');
    }, [cargarPaginaInicial, periodo])
  );

  useEffect(() => {
    const onBack = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [navigation]);

  const handlePeriodo = (nuevo: PeriodoHistorialIngresos) => {
    if (nuevo === periodo || loading) return;
    setPeriodo(nuevo);
  };

  const listEmpty =
    !loading && !loadError && items.length === 0 ? (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>No hay servicios en este periodo.</Text>
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.container}>
      <BackHeader title="Mis ingresos" onBack={() => navigation.goBack()} />
      <View style={styles.chipsRow}>
        {PERIODOS_HISTORIAL.map((p) => {
          const selected = periodo === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => handlePeriodo(p.id)}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Periodo ${p.etiqueta}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {p.etiqueta}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && !refreshing && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Button
            label="Reintentar"
            onPress={() => void cargarPaginaInicial(periodo, 'normal')}
            style={styles.retryBtn}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => <HistorialRow item={item} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={resumen ? <ResumenCard resumen={resumen} /> : null}
          ListEmptyComponent={listEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void cargarPaginaInicial(periodo, 'refresh')}
              tintColor={colors.navy}
            />
          }
          onEndReached={() => {
            if (nextCursor && !loadingMore && !pageError) {
              void cargarMas();
            }
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            <>
              {loadingMore ? (
                <ActivityIndicator style={styles.footerSpinner} color={colors.navy} />
              ) : null}
              {pageError ? (
                <View style={styles.footerError}>
                  <Text style={styles.errorText}>
                    {mensajeErrorHistorial(undefined, 'pagina')}
                  </Text>
                  <Button
                    label="Reintentar"
                    variant="outline"
                    onPress={() => void cargarMas()}
                  />
                </View>
              ) : null}
            </>
          }
        />
      )}
    </SafeAreaView>
  );
}

const CHIP_MIN_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.beige,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  chip: {
    minHeight: CHIP_MIN_HEIGHT,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.beige,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
    textAlign: 'center',
  },
  chipTextSelected: {
    color: colors.textOnNavy,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.sm,
  },
  resumenCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  seedBadge: {
    ...typography.caption,
    alignSelf: 'flex-start',
    backgroundColor: colors.beige,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  resumenLine: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  resumenValue: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  resumenValueStrong: {
    fontWeight: '700',
    color: colors.navy,
    fontSize: 17,
  },
  resumenDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.beige,
    marginVertical: spacing.sm,
  },
  efectivoResumen: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: 4,
  },
  rowMeta: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  rowMuted: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowAmount: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cancelBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.error,
    marginTop: spacing.xs,
  },
  rowMotivo: {
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 2,
  },
  debesLookify: {
    fontSize: 14,
    color: colors.navy,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  emptyWrap: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    minWidth: 160,
  },
  footerSpinner: {
    marginVertical: spacing.md,
  },
  footerError: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
});
