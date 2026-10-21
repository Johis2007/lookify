import { createMockBookingService } from './mock/mockBookingService';

// Servicio de creación de reservas del CLIENTE (Paso 2C).
// En modo backend llama a POST /api/bookings del BFF con el token de sesión;
// con EXPO_PUBLIC_USE_BACKEND=false usa el mock (sin red).

export interface CrearReservaRequest {
  /** id del servicio (real en backend, o id de mock en modo demo). */
  serviceId: string;
  /** profesional elegido (opcional: la reserva puede quedar sin asignar). */
  professionalId?: string;
  addressText: string;
  lat: number;
  lng: number;
  scheduledAt?: string;
  paymentMethod?: string;
}

export interface CrearReservaResponse {
  /** id de la reserva (string en la app). */
  bookingId: string;
  estado: string;
  precioTotal: number | null;
}

export interface BookingService {
  crearReserva(input: CrearReservaRequest): Promise<CrearReservaResponse>;
}

let implementation: BookingService = createMockBookingService();

export function getBookingService(): BookingService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP (ver initBackend). */
export function setBookingServiceForTesting(service: BookingService): void {
  implementation = service;
}
