import {
  ACTIVACION_BLOQUEO_MS,
  ACTIVACION_CODE_LENGTH,
  ACTIVACION_MAX_INTENTOS_FALLIDOS,
  ACTIVACION_MAX_REENVIOS,
  ACTIVACION_REENVIO_COOLDOWN_MS,
  ACTIVACION_VIGENCIA_MS,
} from '../../constants/professionalActivation';

export interface ActivacionMemoria {
  codigo: string;
  expiraEnMs: number;
  intentosFallidos: number;
  bloqueadoHastaMs: number | null;
  reenviosUsados: number;
  ultimoReenvioEnMs: number | null;
}

const activacionBySolicitudId = new Map<string, ActivacionMemoria>();

function generarCodigoNumerico(): string {
  let code = '';
  for (let i = 0; i < ACTIVACION_CODE_LENGTH; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export function clearActivacionForSolicitud(solicitudId: string): void {
  activacionBySolicitudId.delete(solicitudId);
}

export function getActivacionForSolicitud(solicitudId: string): ActivacionMemoria | undefined {
  const a = activacionBySolicitudId.get(solicitudId);
  if (!a) return undefined;
  return { ...a };
}

export function crearPrimerCodigoActivacion(solicitudId: string, nowMs: number): ActivacionMemoria {
  const next: ActivacionMemoria = {
    codigo: generarCodigoNumerico(),
    expiraEnMs: nowMs + ACTIVACION_VIGENCIA_MS,
    intentosFallidos: 0,
    bloqueadoHastaMs: null,
    reenviosUsados: 0,
    ultimoReenvioEnMs: null,
  };
  activacionBySolicitudId.set(solicitudId, next);
  return { ...next };
}

export function reemitirCodigoActivacion(solicitudId: string, nowMs: number): ActivacionMemoria {
  const prev = activacionBySolicitudId.get(solicitudId);
  if (!prev) {
    return crearPrimerCodigoActivacion(solicitudId, nowMs);
  }
  const next: ActivacionMemoria = {
    ...prev,
    codigo: generarCodigoNumerico(),
    expiraEnMs: nowMs + ACTIVACION_VIGENCIA_MS,
    reenviosUsados: prev.reenviosUsados + 1,
    ultimoReenvioEnMs: nowMs,
  };
  activacionBySolicitudId.set(solicitudId, next);
  return { ...next };
}

export function mutarActivacion(
  solicitudId: string,
  updater: (prev: ActivacionMemoria) => ActivacionMemoria
): ActivacionMemoria | undefined {
  const prev = activacionBySolicitudId.get(solicitudId);
  if (!prev) return undefined;
  const next = updater(prev);
  activacionBySolicitudId.set(solicitudId, next);
  return { ...next };
}

export function expirarCodigoActivacionDemo(solicitudId: string, nowMs: number): boolean {
  const prev = activacionBySolicitudId.get(solicitudId);
  if (!prev) return false;
  activacionBySolicitudId.set(solicitudId, { ...prev, expiraEnMs: nowMs - 1000 });
  return true;
}

export function evaluarBloqueoIntentos(prev: ActivacionMemoria, nowMs: number): ActivacionMemoria {
  if (prev.bloqueadoHastaMs != null && nowMs < prev.bloqueadoHastaMs) {
    return prev;
  }
  if (prev.bloqueadoHastaMs != null && nowMs >= prev.bloqueadoHastaMs) {
    return { ...prev, bloqueadoHastaMs: null, intentosFallidos: 0 };
  }
  return prev;
}

export function registrarIntentoFallido(prev: ActivacionMemoria, nowMs: number): ActivacionMemoria {
  const intentosFallidos = prev.intentosFallidos + 1;
  if (intentosFallidos >= ACTIVACION_MAX_INTENTOS_FALLIDOS) {
    return {
      ...prev,
      intentosFallidos,
      bloqueadoHastaMs: nowMs + ACTIVACION_BLOQUEO_MS,
    };
  }
  return { ...prev, intentosFallidos };
}

export function calcularReenvioDisponibleEnMs(
  activacion: ActivacionMemoria,
  nowMs: number
): number | null {
  if (activacion.ultimoReenvioEnMs == null) return null;
  const disponible = activacion.ultimoReenvioEnMs + ACTIVACION_REENVIO_COOLDOWN_MS;
  if (nowMs >= disponible) return null;
  return disponible;
}

export function reenviosRestantes(activacion: ActivacionMemoria): number {
  return Math.max(0, ACTIVACION_MAX_REENVIOS - activacion.reenviosUsados);
}
