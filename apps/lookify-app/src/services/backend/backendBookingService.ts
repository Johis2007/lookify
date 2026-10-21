import { BookingService, CrearReservaRequest, CrearReservaResponse } from '../bookingService';
import { ServiceError } from '../errors';
import { bffApi } from '../../lib/backend/bff';
import { loadClientSession } from '../../lib/backend/clientAuth';

// Reservas reales del cliente: POST /api/bookings del BFF (Paso 2B/2C).
// El BFF valida el servicio, calcula el precio y deriva el client del token.

type BookingDto = {
  id: number;
  status: string | null;
  price: number | null;
};

export function createBackendBookingService(): BookingService {
  return {
    async crearReserva(input: CrearReservaRequest): Promise<CrearReservaResponse> {
      const session = await loadClientSession();
      if (!session || !session.token || session.token === 'offline-local') {
        throw new ServiceError('INVALID_CREDENTIALS');
      }
      const serviceId = Number(input.serviceId);
      if (!Number.isInteger(serviceId) || serviceId <= 0) throw new ServiceError('VALIDATION');

      const body: Record<string, unknown> = {
        serviceId,
        addressText: input.addressText,
        lat: input.lat,
        lng: input.lng,
      };
      const professionalId = Number(input.professionalId);
      if (Number.isInteger(professionalId) && professionalId > 0) {
        body.professionalId = professionalId;
      }
      if (input.scheduledAt) body.scheduledAt = input.scheduledAt;
      if (input.paymentMethod) body.paymentMethod = input.paymentMethod;

      const dto = await bffApi<BookingDto>('POST', '/api/bookings', session.token, body);
      if (!dto || typeof dto.id !== 'number') {
        throw new ServiceError('UNKNOWN', 'No se pudo crear la reserva.');
      }
      return {
        bookingId: String(dto.id),
        estado: dto.status ?? 'pending',
        precioTotal: dto.price ?? null,
      };
    },
  };
}
