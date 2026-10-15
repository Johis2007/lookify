import { ProfessionalSessionRouteParams } from './professionalAuth';

export type DesgloseServicioEnCurso = {
  precioBaseCop: number;
  precioDomicilioCop: number;
  precioTotalCop: number;
};

export type EtapaServicioEnCurso =
  | 'EN_CAMINO'
  | 'LLEGUE'
  | 'INICIADO'
  | 'FINALIZADO'
  | 'CANCELADA_POR_PROFESIONAL';

export type MotivoCancelacionProfesional =
  | 'CLIENTE_AUSENTE'
  | 'DIRECCION_INCORRECTA'
  | 'CLIENTE_CANCELO_EN_PERSONA'
  | 'NO_PUEDO_CONTINUAR';

export type ResultadoValidarPin = 'VALIDO' | 'INVALIDO' | 'BLOQUEADO';

/** El PIN correcto no forma parte de este tipo. Solo lo entrega obtenerPinDemo. */
export type ServicioEnCurso = {
  id: string;
  profesionalId: string;
  etapa: EtapaServicioEnCurso;
  servicioId: string;
  servicioNombre: string;
  duracionMin: number;
  clientePrimerNombre: string;
  direccionExacta: string;
  desglose: DesgloseServicioEnCurso;
  llegadaEn: number | null;
  iniciadoEn: number | null;
  finalizadoEn: number | null;
  canceladoEn: number | null;
  intentosFallidosPin: number;
  bloqueadoHasta: number | null;
  motivoCancelacion: MotivoCancelacionProfesional | null;
};

export function esEtapaServicioActiva(etapa: EtapaServicioEnCurso): boolean {
  return etapa === 'EN_CAMINO' || etapa === 'LLEGUE' || etapa === 'INICIADO';
}

export type ProfessionalServiceInProgressRouteParams = ProfessionalSessionRouteParams & {
  solicitudEntranteId: string;
  /** Solo navegación interna: abre la lista de motivos al entrar. */
  abrirMotivosCancelacion?: boolean;
};

export type ObtenerServicioActivoRequest = {
  profesionalId: string;
};

export type RespuestaServicioActivo = {
  servicio: ServicioEnCurso | null;
  ahoraServidor: number;
};

export type MarcarLlegadaRequest = {
  profesionalId: string;
  servicioId: string;
};

export type RespuestaServicioEnCurso = {
  servicio: ServicioEnCurso;
  ahoraServidor: number;
};

export type ValidarPinServicioRequest = {
  profesionalId: string;
  servicioId: string;
  pin: string;
};

export type RespuestaValidarPin = {
  resultado: ResultadoValidarPin;
  intentosRestantes: number;
  bloqueadoHasta: number | null;
  servicio: ServicioEnCurso;
  ahoraServidor: number;
};

export type CancelarServicioPorProfesionalRequest = {
  profesionalId: string;
  servicioId: string;
  motivo: MotivoCancelacionProfesional;
};

export type FinalizarServicioEnCursoRequest = {
  profesionalId: string;
  servicioId: string;
};

export type ObtenerPinDemoRequest = {
  profesionalId: string;
  servicioId: string;
};

export type RespuestaPinDemo = {
  pin: string;
  ahoraServidor: number;
};

export type ExpirarBloqueoPinDemoRequest = {
  profesionalId: string;
  servicioId: string;
};

export type CrearServicioEnCursoInput = {
  solicitudEntranteId: string;
  profesionalId: string;
  servicioId: string;
  servicioNombre: string;
  duracionMin: number;
  clientePrimerNombre: string;
  desglose: DesgloseServicioEnCurso;
};
