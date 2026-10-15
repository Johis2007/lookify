import { ProfessionalSessionRouteParams } from './professionalAuth';
import { MotivoCancelacionProfesional } from './professionalServiceInProgress';

export type PeriodoHistorialIngresos = 'HOY' | 'SEMANA' | 'MES';

export type MetodoPagoHistorial = 'EFECTIVO' | 'DIGITAL';

export type EstadoHistorialIngresos = 'FINALIZADO' | 'CANCELADO';

export type HistorialIngresosItem = {
  id: string;
  servicioNombre: string;
  clientePrimerNombre: string;
  metodoPago: MetodoPagoHistorial;
  estado: EstadoHistorialIngresos;
  precioTotalCop: number;
  comisionCop: number;
  netoCop: number;
  cerradoEnMs: number;
  motivoCancelacion: MotivoCancelacionProfesional | null;
  origenSemilla: boolean;
};

export type ResumenPeriodoHistorial = {
  periodo: PeriodoHistorialIngresos;
  cantidadFinalizados: number;
  cantidadCancelados: number;
  totalCop: number;
  comisionCop: number;
  netoCop: number;
  comisionEfectivoCop: number;
  /** Solo UI __DEV__: el resumen incluye al menos un ítem de semilla en el periodo */
  contieneSemillaEnPeriodo: boolean;
};

export type ObtenerResumenPeriodoRequest = {
  profesionalId: string;
  periodo: PeriodoHistorialIngresos;
};

export type RespuestaResumenPeriodo = {
  resumen: ResumenPeriodoHistorial;
  ahoraServidor: number;
};

export type ListarHistorialRequest = {
  profesionalId: string;
  periodo: PeriodoHistorialIngresos;
  cursor?: string;
  limit?: number;
};

export type RespuestaListarHistorial = {
  items: HistorialIngresosItem[];
  nextCursor: string | null;
  ahoraServidor: number;
};

export type SembrarHistorialDemoRequest = {
  profesionalId: string;
};

export type ProfessionalEarningsHistoryRouteParams = ProfessionalSessionRouteParams;
