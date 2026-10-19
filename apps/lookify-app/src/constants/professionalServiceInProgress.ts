import {
  EtapaServicioEnCurso,
  MotivoCancelacionProfesional,
} from '../types/professionalServiceInProgress';

export const ETIQUETA_ETAPA_SERVICIO: Record<EtapaServicioEnCurso, string> = {
  EN_CAMINO: 'En camino',
  LLEGUE: 'Llegué',
  INICIADO: 'Servicio iniciado',
  FINALIZADO: 'Finalizado',
  CANCELADA_POR_PROFESIONAL: 'Cancelado',
};

export const PIN_SERVICIO_LENGTH = 4;

export const PIN_MAX_INTENTOS_FALLIDOS = 3;

export const PIN_BLOQUEO_MS = 5 * 60 * 1000;

/** Dirección de ejemplo. Solo existe después de que profesional y cliente aceptaron. */
export const DIRECCION_EXACTA_DEMO = 'Calle 72 # 10-34, Chapinero, Bogotá';

export const MOTIVOS_CANCELACION_PROFESIONAL: {
  codigo: MotivoCancelacionProfesional;
  etiqueta: string;
}[] = [
  { codigo: 'CLIENTE_AUSENTE', etiqueta: 'El cliente no está' },
  { codigo: 'DIRECCION_INCORRECTA', etiqueta: 'No encuentro la dirección' },
  { codigo: 'CLIENTE_CANCELO_EN_PERSONA', etiqueta: 'El cliente canceló en persona' },
  { codigo: 'NO_PUEDO_CONTINUAR', etiqueta: 'No puedo continuar' },
];
