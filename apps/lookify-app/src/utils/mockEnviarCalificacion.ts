import type { MetodoPagoMock } from '../constants/paymentRating';

export interface MockCalificacionPayload {
  professionalId: string;
  servicioId: string;
  estrellas: number;
  comentario: string;
  metodoPago: MetodoPagoMock;
}

/** Mock hasta POST /calificaciones (sin HTTP). */
export function mockEnviarCalificacion(payload: MockCalificacionPayload): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[mock] Calificación enviada:', payload);
  }
}
