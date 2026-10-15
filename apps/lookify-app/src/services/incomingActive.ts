// src/services/incomingActive.ts
// Indirección para la última solicitud entrante conocida (la usa el listener
// para no presentar dos veces la misma). Por defecto delega al store mock;
// initBackend() la conecta a la cache del servicio backend.

import { SolicitudEntrante } from '../types/professionalIncomingRequest';
import { getActiveSolicitud as getActiveMock } from './mock/mockProfessionalIncomingRequestStore';

let backendProvider: ((profesionalId: string) => SolicitudEntrante | null) | null = null;

export function setActiveSolicitudProvider(
  fn: ((profesionalId: string) => SolicitudEntrante | null) | null,
): void {
  backendProvider = fn;
}

export function getActiveSolicitudKnown(profesionalId: string): SolicitudEntrante | null {
  if (backendProvider) return backendProvider(profesionalId);
  return getActiveMock(profesionalId);
}
