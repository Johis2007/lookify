import { SolicitudEntrante } from '../../types/professionalIncomingRequest';

const activeByProfesionalId = new Map<string, SolicitudEntrante>();

type Listener = (event: import('../../types/professionalIncomingRequest').SolicitudEntranteEvento) => void;

const listenersByProfesionalId = new Map<string, Set<Listener>>();

const expiryTimerBySolicitudId = new Map<string, ReturnType<typeof setTimeout>>();

let demoSimulacionParidad = 0;

export function nextDemoClienteConResenas(): {
  calificacion: number | null;
  total: number;
} {
  demoSimulacionParidad += 1;
  if (demoSimulacionParidad % 2 === 1) {
    return { calificacion: 4.8, total: 12 };
  }
  return { calificacion: null, total: 0 };
}

export function getActiveSolicitud(profesionalId: string): SolicitudEntrante | null {
  const s = activeByProfesionalId.get(profesionalId);
  return s ? { ...s } : null;
}

export function setActiveSolicitud(solicitud: SolicitudEntrante): void {
  activeByProfesionalId.set(solicitud.profesionalId, { ...solicitud });
}

export function clearActiveSolicitud(profesionalId: string): void {
  const s = activeByProfesionalId.get(profesionalId);
  if (s) {
    clearExpiryTimer(s.id);
  }
  activeByProfesionalId.delete(profesionalId);
}

export function hasActiveSolicitudVigente(profesionalId: string): boolean {
  const s = activeByProfesionalId.get(profesionalId);
  if (!s) {
    return false;
  }
  return s.estado === 'PENDIENTE_PRO' || s.estado === 'ESPERANDO_CLIENTE';
}

export function subscribe(profesionalId: string, listener: Listener): () => void {
  let set = listenersByProfesionalId.get(profesionalId);
  if (!set) {
    set = new Set();
    listenersByProfesionalId.set(profesionalId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export function emit(
  profesionalId: string,
  event: import('../../types/professionalIncomingRequest').SolicitudEntranteEvento
): void {
  const set = listenersByProfesionalId.get(profesionalId);
  if (!set) {
    return;
  }
  for (const listener of set) {
    listener(event);
  }
}

export function clearExpiryTimer(solicitudEntranteId: string): void {
  const t = expiryTimerBySolicitudId.get(solicitudEntranteId);
  if (t) {
    clearTimeout(t);
    expiryTimerBySolicitudId.delete(solicitudEntranteId);
  }
}

export function scheduleExpiryTimer(
  solicitudEntranteId: string,
  expiraEn: number,
  onFire: () => void
): void {
  clearExpiryTimer(solicitudEntranteId);
  const ms = expiraEn - Date.now();
  if (ms <= 0) {
    onFire();
    return;
  }
  const t = setTimeout(onFire, ms);
  expiryTimerBySolicitudId.set(solicitudEntranteId, t);
}
