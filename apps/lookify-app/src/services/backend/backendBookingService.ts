import {
  BookingService,
  CrearReservaRequest,
  CrearReservaResponse,
  EstadoReserva,
  ProfesionalPublico,
  ReservaDetalle,
} from '../bookingService';
import { ServiceError } from '../errors';
import { bffApi } from '../../lib/backend/bff';
import { loadClientSession } from '../../lib/backend/clientAuth';

// Reservas reales del cliente: POST/GET /api/bookings del BFF (Pasos 2B/2C/4B).
// El BFF valida el servicio, calcula el precio y deriva el client del token.

type BookingDto = {
  id: number;
  status: string | null;
  price: number | null;
  expiresAt?: string | null;
  matchRound?: number;
};

type BookingFullDto = {
  id: number;
  status: string | null;
  price_snapshot: number | null;
  expiresAt: string | null;
  matchRound: number;
  professionalPublic: {
    id: number;
    displayName: string;
    avatar: string | null;
    rating: number | null;
  } | null;
  service:
    | { id: number; name: string; price_base: number | null; duration_min: number | null }
    | number
    | null;
};

function toPublic(
  dto: BookingFullDto,
): { profesional: ProfesionalPublico | null; servicioNombre: string | null } {
  const profesional: ProfesionalPublico | null = dto.professionalPublic
    ? {
        id: String(dto.professionalPublic.id),
        nombre: dto.professionalPublic.displayName,
        calificacion:
          dto.professionalPublic.rating === null ? null : Number(dto.professionalPublic.rating),
        avatar: dto.professionalPublic.avatar ?? null,
      }
    : null;
  const servicioNombre =
    dto.service && typeof dto.service === 'object' ? dto.service.name : null;
  return { profesional, servicioNombre };
}

/** Normaliza las dos formas del BFF: GET /:id (snake_case) y POST /:id/cancel (camelCase). */
function normalizeFull(dto: any): BookingFullDto {
  return {
    id: Number(dto?.id),
    status: dto?.status ?? null,
    price_snapshot:
      dto?.price_snapshot === null || dto?.price_snapshot === undefined
        ? dto?.price ?? null
        : dto.price_snapshot,
    expiresAt: dto?.expiresAt ?? null,
    matchRound: Number(dto?.matchRound ?? 0),
    professionalPublic: dto?.professionalPublic ?? null,
    service: dto?.service ?? null,
  };
}

function toDetalle(bookingId: string, dto: BookingFullDto): ReservaDetalle {
  const { profesional, servicioNombre } = toPublic(dto);
  return {
    bookingId,
    estado: (dto.status ?? 'pending') as EstadoReserva,
    precioTotal: dto.price_snapshot === null ? null : Number(dto.price_snapshot),
    expiraEn: dto.expiresAt ? Date.parse(dto.expiresAt) : null,
    ronda: Number(dto.matchRound ?? 0),
    profesional,
    servicioNombre,
  };
}

export function createBackendBookingService(): BookingService {
  const tokenCliente = async (): Promise<string> => {
    const session = await loadClientSession();
    if (!session || !session.token || session.token === 'offline-local') {
      throw new ServiceError('INVALID_CREDENTIALS');
    }
    return session.token;
  };

  return {
    async crearReserva(input: CrearReservaRequest): Promise<CrearReservaResponse> {
      const token = await tokenCliente();
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

      const dto = await bffApi<BookingDto>('POST', '/api/bookings', token, body);
      if (!dto || typeof dto.id !== 'number') {
        throw new ServiceError('UNKNOWN', 'No se pudo crear la reserva.');
      }
      return {
        bookingId: String(dto.id),
        estado: dto.status ?? 'pending',
        precioTotal: dto.price ?? null,
        expiraEn: dto.expiresAt ? Date.parse(dto.expiresAt) : null,
        ronda: Number(dto.matchRound ?? 0),
      };
    },

    async obtenerReserva(bookingId: string): Promise<ReservaDetalle> {
      const token = await tokenCliente();
      const dto = await bffApi<any>(
        'GET',
        `/api/bookings/${encodeURIComponent(bookingId)}`,
        token,
        undefined,
        'VALIDATION',
      );
      if (!dto || typeof dto.id !== 'number') {
        throw new ServiceError('UNKNOWN', 'No se pudo consultar la reserva.');
      }
      return toDetalle(bookingId, normalizeFull(dto));
    },

    async cancelarReserva(bookingId: string): Promise<ReservaDetalle> {
      const token = await tokenCliente();
      const dto = await bffApi<any>(
        'POST',
        `/api/bookings/${encodeURIComponent(bookingId)}/cancel`,
        token,
        {},
        'VALIDATION',
      );
      if (!dto || typeof dto.id !== 'number') {
        throw new ServiceError('UNKNOWN', 'No se pudo cancelar la reserva.');
      }
      return toDetalle(bookingId, normalizeFull(dto));
    },
  };
}
