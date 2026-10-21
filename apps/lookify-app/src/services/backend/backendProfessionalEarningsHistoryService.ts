// src/services/backend/backendProfessionalEarningsHistoryService.ts
// Historial real desde bookings (completed/cancelled) + reviews. Comisión
// 15% sobre base del servicio; neto = total − comisión. Cursor opaco
// `o<offset>` (paginación por desplazamiento; el contrato solo sugiere
// formato). Semilla demo: no-op (solo existe en mocks).

import {
  ProfessionalEarningsHistoryService,
} from '../professionalEarningsHistoryService';
import {
  HistorialIngresosItem,
  ListarHistorialRequest,
  ObtenerResumenPeriodoRequest,
  PeriodoHistorialIngresos,
  RespuestaListarHistorial,
  RespuestaResumenPeriodo,
  ResumenPeriodoHistorial,
  SembrarHistorialDemoRequest,
} from '../../types/professionalEarningsHistory';
import { MotivoCancelacionProfesional } from '../../types/professionalServiceInProgress';
import { ServiceError } from '../errors';
import { bffApi } from '../../lib/backend/bff';
import { loadBackendSession, resolveProfessionalId } from '../../lib/backend/session';
import {
  DBooking,
  DBookingEvent,
  comisionCop,
  desglose,
  metodoPago,
  primerNombre,
} from '../../lib/backend/mapping';
import {
  endOfDayBogotaUtcMs,
  endOfMonthBogotaUtcMs,
  endOfWeekBogotaUtcMs,
  startOfDayBogotaUtcMs,
  startOfMonthBogotaUtcMs,
  startOfWeekBogotaUtcMs,
} from '../../utils/bogotaTime';

function motivoValido(v?: string | null): MotivoCancelacionProfesional | null {
  const validos: MotivoCancelacionProfesional[] = [
    'CLIENTE_AUSENTE',
    'DIRECCION_INCORRECTA',
    'CLIENTE_CANCELO_EN_PERSONA',
    'NO_PUEDO_CONTINUAR',
  ];
  if (v && (validos as string[]).includes(v)) return v as MotivoCancelacionProfesional;
  return null;
}

function rangoPeriodo(periodo: PeriodoHistorialIngresos, ahora: number): { from: string; to: string } {
  let fromMs: number;
  let toMs: number;
  if (periodo === 'HOY') {
    fromMs = startOfDayBogotaUtcMs(ahora);
    toMs = endOfDayBogotaUtcMs(ahora);
  } else if (periodo === 'SEMANA') {
    fromMs = startOfWeekBogotaUtcMs(ahora);
    toMs = endOfWeekBogotaUtcMs(ahora);
  } else if (periodo === 'MES') {
    fromMs = startOfMonthBogotaUtcMs(ahora);
    toMs = endOfMonthBogotaUtcMs(ahora);
  } else {
    throw new ServiceError('PERIODO_INVALIDO');
  }
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
}

function parseCursor(cursor?: string): number {
  if (!cursor) return 0;
  const m = /^o(\d+)$/.exec(cursor);
  if (!m) throw new ServiceError('CURSOR_INVALIDO');
  return Number(m[1]);
}

type BookingCerrado = {
  b: DBooking;
  base: number;
  servicioNombre: string;
};

async function bookingsCerrados(
  token: string,
  _professionalId: number,
  periodo: PeriodoHistorialIngresos,
): Promise<BookingCerrado[]> {
  const ahora = Date.now();
  const { from, to } = rangoPeriodo(periodo, ahora);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const rows = await bffApi<DBooking[]>(
    'GET',
    '/api/bookings/pro/mine?status=completed,cancelled',
    token,
  );
  return rows
    .filter((b) => {
      const t = b.created_at ? Date.parse(b.created_at) : NaN;
      return !Number.isNaN(t) && t >= fromMs && t <= toMs;
    })
    .map((b) => {
      const svc = typeof b.service === 'object' && b.service !== null ? b.service : null;
      return {
        b,
        base: svc?.price_base ?? b.price_snapshot,
        servicioNombre: svc?.name ?? 'Servicio',
      };
    });
}

async function motivosPorBooking(
  token: string,
  bookingIds: number[],
): Promise<Map<number, MotivoCancelacionProfesional>> {
  const map = new Map<number, MotivoCancelacionProfesional>();
  if (bookingIds.length === 0) return map;
  const listas = await Promise.all(
    bookingIds.map((id) =>
      bffApi<DBookingEvent[]>('GET', `/api/bookings/${id}/events`, token).catch(() => []),
    ),
  );
  bookingIds.forEach((bookingId, i) => {
    const eventos = [...listas[i]].sort((a, b) =>
      (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    );
    for (const e of eventos) {
      const m = /^motivo:([A-Z_]+)/.exec(e.note ?? '');
      const motivo = motivoValido(m?.[1]);
      if (motivo) {
        map.set(bookingId, motivo);
        break;
      }
    }
  });
  return map;
}

function aItem(
  row: BookingCerrado,
  motivo: MotivoCancelacionProfesional | null,
  clienteNombre: string,
): HistorialIngresosItem {
  const finalizado = row.b.status === 'completed';
  const d = desglose(row.base, row.b.price_snapshot);
  const comision = finalizado ? comisionCop(d.precioBaseCop) : 0;
  const cerradoMs = row.b.completed_at
    ? Date.parse(row.b.completed_at)
    : row.b.created_at
      ? Date.parse(row.b.created_at)
      : Date.now();
  return {
    id: String(row.b.id),
    servicioNombre: row.servicioNombre,
    clientePrimerNombre: clienteNombre,
    metodoPago: metodoPago(row.b.payment_method),
    estado: finalizado ? 'FINALIZADO' : 'CANCELADO',
    precioTotalCop: finalizado ? d.precioTotalCop : 0,
    comisionCop: comision,
    netoCop: finalizado ? d.precioTotalCop - comision : 0,
    cerradoEnMs: Number.isNaN(cerradoMs) ? Date.now() : cerradoMs,
    motivoCancelacion: finalizado ? null : (motivoValido(row.b.cancel_reason) ?? motivo),
    origenSemilla: false,
  };
}

// A partir de las reservas (que ya traen clientFirstName del BFF), mapea
// clientId -> primer nombre. Evita leer /users directamente (PII).
function nombresClientesDe(rows: DBooking[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of rows) {
    if (!map.has(b.client)) map.set(b.client, primerNombre(b.clientFirstName));
  }
  return map;
}

export async function resumenDiaBackend(
  token: string,
  professionalId: number,
): Promise<{ serviciosRealizados: number; ingresosCop: number }> {
  const rows = await bookingsCerrados(token, professionalId, 'HOY');
  let serviciosRealizados = 0;
  let ingresosCop = 0;
  for (const row of rows) {
    if (row.b.status !== 'completed') continue;
    const d = desglose(row.base, row.b.price_snapshot);
    serviciosRealizados += 1;
    ingresosCop += d.precioTotalCop - comisionCop(d.precioBaseCop);
  }
  return { serviciosRealizados, ingresosCop };
}

export function createBackendProfessionalEarningsHistoryService(): ProfessionalEarningsHistoryService {
  return {
    async obtenerResumenPeriodo(input: ObtenerResumenPeriodoRequest): Promise<RespuestaResumenPeriodo> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const rows = await bookingsCerrados(session.token, professionalId, input.periodo);
      const resumen: ResumenPeriodoHistorial = {
        periodo: input.periodo,
        cantidadFinalizados: 0,
        cantidadCancelados: 0,
        totalCop: 0,
        comisionCop: 0,
        netoCop: 0,
        comisionEfectivoCop: 0,
        contieneSemillaEnPeriodo: false,
      };
      for (const row of rows) {
        if (row.b.status !== 'completed') {
          resumen.cantidadCancelados += 1;
          continue;
        }
        const d = desglose(row.base, row.b.price_snapshot);
        const comision = comisionCop(d.precioBaseCop);
        resumen.cantidadFinalizados += 1;
        resumen.totalCop += d.precioTotalCop;
        resumen.comisionCop += comision;
        resumen.netoCop += d.precioTotalCop - comision;
        if (metodoPago(row.b.payment_method) === 'EFECTIVO') resumen.comisionEfectivoCop += comision;
      }
      return { resumen, ahoraServidor: Date.now() };
    },

    async listarHistorial(input: ListarHistorialRequest): Promise<RespuestaListarHistorial> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(input.profesionalId);
      const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
      const offset = parseCursor(input.cursor);
      const rows = await bookingsCerrados(session.token, professionalId, input.periodo);
      const page = rows.slice(offset, offset + limit);
      const motivos = await motivosPorBooking(
        session.token,
        page.filter((r) => r.b.status !== 'completed').map((r) => r.b.id),
      );
      const nombres = nombresClientesDe(page.map((r) => r.b));
      const items = page.map((r) =>
        aItem(r, motivos.get(r.b.id) ?? null, nombres.get(r.b.client) ?? 'Cliente'),
      );
      return {
        items,
        nextCursor: offset + limit < rows.length ? `o${offset + limit}` : null,
        ahoraServidor: Date.now(),
      };
    },

    async sembrarHistorialDemo(_input: SembrarHistorialDemoRequest): Promise<void> {
      // Solo existe en mocks (__DEV__); en backend no hay nada que sembrar.
    },
  };
}
