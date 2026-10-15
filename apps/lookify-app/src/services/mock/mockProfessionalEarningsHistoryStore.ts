import {
  endOfDayBogotaUtcMs,
  endOfMonthBogotaUtcMs,
  endOfWeekBogotaUtcMs,
  startOfDayBogotaUtcMs,
  startOfMonthBogotaUtcMs,
  startOfWeekBogotaUtcMs,
} from '../../utils/bogotaTime';
import {
  HistorialIngresosItem,
  PeriodoHistorialIngresos,
  ResumenPeriodoHistorial,
} from '../../types/professionalEarningsHistory';
import { ServicioEnCurso } from '../../types/professionalServiceInProgress';
import { MOTIVOS_CANCELACION_PROFESIONAL } from '../../constants/professionalServiceInProgress';
import {
  calcularMontosFinalizadoHistorial,
  metodoPagoDeterministicoDesdeId,
} from './earningsMontos';

type ItemInterno = HistorialIngresosItem;

const porProfesional = new Map<string, ItemInterno[]>();

function copiarItem(item: ItemInterno): ItemInterno {
  return { ...item };
}

function lista(profesionalId: string): ItemInterno[] {
  return porProfesional.get(profesionalId) ?? [];
}

export function obtenerHistorialItems(profesionalId: string): HistorialIngresosItem[] {
  return lista(profesionalId).map(copiarItem);
}

function guardarLista(profesionalId: string, items: ItemInterno[]): void {
  porProfesional.set(
    profesionalId,
    items.map(copiarItem)
  );
}

export function historialStoreVacio(profesionalId: string): boolean {
  return lista(profesionalId).length === 0;
}

export function periodoBounds(
  periodo: PeriodoHistorialIngresos,
  ahoraServidor: number
): { startMs: number; endMs: number } {
  switch (periodo) {
    case 'HOY':
      return {
        startMs: startOfDayBogotaUtcMs(ahoraServidor),
        endMs: endOfDayBogotaUtcMs(ahoraServidor),
      };
    case 'SEMANA':
      return {
        startMs: startOfWeekBogotaUtcMs(ahoraServidor),
        endMs: endOfWeekBogotaUtcMs(ahoraServidor),
      };
    case 'MES':
      return {
        startMs: startOfMonthBogotaUtcMs(ahoraServidor),
        endMs: endOfMonthBogotaUtcMs(ahoraServidor),
      };
    default: {
      const _exhaustive: never = periodo;
      return _exhaustive;
    }
  }
}

function filtrarPorPeriodo(
  items: ItemInterno[],
  periodo: PeriodoHistorialIngresos,
  ahoraServidor: number
): ItemInterno[] {
  const { startMs, endMs } = periodoBounds(periodo, ahoraServidor);
  return items.filter((it) => it.cerradoEnMs >= startMs && it.cerradoEnMs <= endMs);
}

export function construirResumenPeriodo(
  items: ItemInterno[],
  periodo: PeriodoHistorialIngresos,
  ahoraServidor: number
): ResumenPeriodoHistorial {
  const enPeriodo = filtrarPorPeriodo(items, periodo, ahoraServidor);
  const finalizados = enPeriodo.filter((it) => it.estado === 'FINALIZADO');
  const cancelados = enPeriodo.filter((it) => it.estado === 'CANCELADO');

  let totalCop = 0;
  let comisionCop = 0;
  let netoCop = 0;
  let comisionEfectivoCop = 0;

  for (const it of finalizados) {
    totalCop += it.precioTotalCop;
    comisionCop += it.comisionCop;
    netoCop += it.netoCop;
    if (it.metodoPago === 'EFECTIVO') {
      comisionEfectivoCop += it.comisionCop;
    }
  }

  return {
    periodo,
    cantidadFinalizados: finalizados.length,
    cantidadCancelados: cancelados.length,
    totalCop,
    comisionCop,
    netoCop,
    comisionEfectivoCop,
    contieneSemillaEnPeriodo: enPeriodo.some((it) => it.origenSemilla),
  };
}

export function registrarDesdeServicioEnCursoInterno(
  profesionalId: string,
  servicio: ServicioEnCurso
): void {
  const prev = lista(profesionalId);
  if (prev.some((it) => it.id === servicio.id)) {
    return;
  }

  const metodoPago = metodoPagoDeterministicoDesdeId(servicio.id);

  if (servicio.etapa === 'FINALIZADO' && servicio.finalizadoEn != null) {
    const montos = calcularMontosFinalizadoHistorial(
      servicio.desglose.precioBaseCop,
      servicio.desglose.precioDomicilioCop
    );
    const item: ItemInterno = {
      id: servicio.id,
      servicioNombre: servicio.servicioNombre,
      clientePrimerNombre: servicio.clientePrimerNombre,
      metodoPago,
      estado: 'FINALIZADO',
      precioTotalCop: montos.precioTotalCop,
      comisionCop: montos.comisionCop,
      netoCop: montos.netoCop,
      cerradoEnMs: servicio.finalizadoEn,
      motivoCancelacion: null,
      origenSemilla: false,
    };
    guardarLista(profesionalId, [item, ...prev]);
    return;
  }

  if (servicio.etapa === 'CANCELADA_POR_PROFESIONAL' && servicio.canceladoEn != null) {
    const item: ItemInterno = {
      id: servicio.id,
      servicioNombre: servicio.servicioNombre,
      clientePrimerNombre: servicio.clientePrimerNombre,
      metodoPago,
      estado: 'CANCELADO',
      precioTotalCop: 0,
      comisionCop: 0,
      netoCop: 0,
      cerradoEnMs: servicio.canceladoEn,
      motivoCancelacion: servicio.motivoCancelacion,
      origenSemilla: false,
    };
    guardarLista(profesionalId, [item, ...prev]);
  }
}

export function listarHistorialInterno(
  profesionalId: string,
  periodo: PeriodoHistorialIngresos,
  ahoraServidor: number,
  cursor: string | undefined,
  limit: number
): { items: HistorialIngresosItem[]; nextCursor: string | null } {
  const enPeriodo = filtrarPorPeriodo(lista(profesionalId), periodo, ahoraServidor).sort(
    (a, b) => b.cerradoEnMs - a.cerradoEnMs || b.id.localeCompare(a.id)
  );

  let startIndex = 0;
  if (cursor) {
    const idx = enPeriodo.findIndex((it) => encodeCursor(it) === cursor);
    if (idx < 0) {
      throw new Error('CURSOR_INVALIDO');
    }
    startIndex = idx + 1;
  }

  const slice = enPeriodo.slice(startIndex, startIndex + limit).map(copiarItem);
  const last = slice[slice.length - 1];
  const nextCursor =
    startIndex + limit < enPeriodo.length && last ? encodeCursor(last) : null;

  return { items: slice, nextCursor };
}

function encodeCursor(item: ItemInterno): string {
  return `${item.cerradoEnMs}:${item.id}`;
}

function crearItemSemilla(
  id: string,
  servicioNombre: string,
  clientePrimerNombre: string,
  cerradoEnMs: number,
  estado: 'FINALIZADO' | 'CANCELADO',
  precioBaseCop: number,
  precioDomicilioCop: number,
  metodoPago: 'EFECTIVO' | 'DIGITAL',
  motivoCancelacion: ItemInterno['motivoCancelacion']
): ItemInterno {
  if (estado === 'CANCELADO') {
    return {
      id,
      servicioNombre,
      clientePrimerNombre,
      metodoPago,
      estado: 'CANCELADO',
      precioTotalCop: 0,
      comisionCop: 0,
      netoCop: 0,
      cerradoEnMs,
      motivoCancelacion,
      origenSemilla: true,
    };
  }
  const montos = calcularMontosFinalizadoHistorial(precioBaseCop, precioDomicilioCop);
  return {
    id,
    servicioNombre,
    clientePrimerNombre,
    metodoPago,
    estado: 'FINALIZADO',
    precioTotalCop: montos.precioTotalCop,
    comisionCop: montos.comisionCop,
    netoCop: montos.netoCop,
    cerradoEnMs,
    motivoCancelacion: null,
    origenSemilla: true,
  };
}

export function sembrarHistorialDemoInterno(profesionalId: string, ahoraServidor: number): boolean {
  if (!historialStoreVacio(profesionalId)) {
    return false;
  }

  const hoyStart = startOfDayBogotaUtcMs(ahoraServidor);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  const seeds: ItemInterno[] = [
    crearItemSemilla(
      'seed-hoy-1',
      'Corte clásico',
      'María',
      hoyStart + 10 * hour,
      'FINALIZADO',
      25000,
      5200,
      'EFECTIVO',
      null
    ),
    crearItemSemilla(
      'seed-hoy-2',
      'Corte y barba',
      'Juan',
      hoyStart + 14 * hour,
      'FINALIZADO',
      38000,
      6400,
      'DIGITAL',
      null
    ),
    crearItemSemilla(
      'seed-ayer-1',
      'Peinado para evento',
      'Laura',
      hoyStart - day + 11 * hour,
      'CANCELADO',
      0,
      0,
      'DIGITAL',
      'CLIENTE_AUSENTE'
    ),
    crearItemSemilla(
      'seed-ayer-2',
      'Maquillaje básico',
      'Ana',
      hoyStart - day + 16 * hour,
      'FINALIZADO',
      45000,
      7000,
      'EFECTIVO',
      null
    ),
    crearItemSemilla(
      'seed-5d-1',
      'Corte de dama',
      'Sofía',
      hoyStart - 5 * day + 9 * hour,
      'FINALIZADO',
      35000,
      5800,
      'DIGITAL',
      null
    ),
    crearItemSemilla(
      'seed-5d-2',
      'Perfilado de barba',
      'Carlos',
      hoyStart - 5 * day + 18 * hour,
      'CANCELADO',
      0,
      0,
      'EFECTIVO',
      'NO_PUEDO_CONTINUAR'
    ),
    crearItemSemilla(
      'seed-sem-1',
      'Uñas básico',
      'Diana',
      hoyStart - 10 * day + 12 * hour,
      'FINALIZADO',
      20000,
      5200,
      'EFECTIVO',
      null
    ),
    crearItemSemilla(
      'seed-sem-2',
      'Tinte y color',
      'Paola',
      hoyStart - 12 * day + 15 * hour,
      'FINALIZADO',
      85000,
      7000,
      'DIGITAL',
      null
    ),
    crearItemSemilla(
      'seed-mes-1',
      'Corte infantil',
      'Tomás',
      hoyStart - 25 * day + 10 * hour,
      'FINALIZADO',
      20000,
      5200,
      'DIGITAL',
      null
    ),
    crearItemSemilla(
      'seed-mes-2',
      'Maquillaje especial',
      'Elena',
      hoyStart - 28 * day + 17 * hour,
      'CANCELADO',
      0,
      0,
      'EFECTIVO',
      MOTIVOS_CANCELACION_PROFESIONAL[2].codigo
    ),
  ];

  guardarLista(profesionalId, seeds);
  return true;
}

export function resumenHoyParaPanel(
  profesionalId: string,
  ahoraServidor: number
): { serviciosRealizados: number; ingresosCop: number; muestraEtiquetaDatosEjemplo: boolean } {
  const resumen = construirResumenPeriodo(lista(profesionalId), 'HOY', ahoraServidor);
  const soloSemillaHoy =
    resumen.cantidadFinalizados + resumen.cantidadCancelados > 0 &&
    filtrarPorPeriodo(lista(profesionalId), 'HOY', ahoraServidor).every((it) => it.origenSemilla);
  return {
    serviciosRealizados: resumen.cantidadFinalizados,
    ingresosCop: resumen.netoCop,
    muestraEtiquetaDatosEjemplo: soloSemillaHoy && resumen.contieneSemillaEnPeriodo,
  };
}
