import { BookingService, CrearReservaRequest, CrearReservaResponse } from '../bookingService';

// Mock del servicio de reservas: no toca la red. Genera un id local estable
// por solicitud para que el flujo de Matching/Tracking siga funcionando sin
// backend.
let seq = 0;

export function createMockBookingService(): BookingService {
  return {
    async crearReserva(_input: CrearReservaRequest): Promise<CrearReservaResponse> {
      seq += 1;
      const bookingId = 900000 + seq;
      return {
        bookingId: String(bookingId),
        estado: 'pending',
        precioTotal: null,
      };
    },
  };
}
