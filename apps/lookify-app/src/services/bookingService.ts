import { createMockBookingService } from './mock/mockBookingService';

// Servicio de reservas del CLIENTE (Pasos 2C y 4B).
// En modo backend llama al BFF (/api/bookings) con el token de sesión;
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
  /** Epoch ms del vencimiento de la oferta (null si no aplica). */
  expiraEn?: number | null;
  /** Ronda de matching inicial (1 = 3 km, 2 = 6 km). */
  ronda?: number;
}

/** Ficha pública del profesional (sin teléfono ni documentos). */
export type ProfesionalPublico = {
  id: string;
  nombre: string;
  calificacion: number | null;
  avatar: string | null;
};

/** Estado de la reserva visto por el cliente. */
export type EstadoReserva =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | string;

export type ReservaDetalle = {
  bookingId: string;
  estado: EstadoReserva;
  precioTotal: number | null;
  /** Epoch ms del vencimiento de la oferta (null si ya no aplica). */
  expiraEn: number | null;
  /** Ronda de matching actual (1 = 3 km, 2 = 6 km). */
  ronda: number;
  /** Ficha pública del profesional (null mientras la reserva está sin asignar). */
  profesional: ProfesionalPublico | null;
  /** Nombre del servicio reservado (si el BFF lo devuelve). */
  servicioNombre: string | null;
};

/** Última posición conocida del pro (4C-2). */
export type ReservaTracking = {
  bookingId: string;
  estado: EstadoReserva;
  profesionalId: string | null;
  /** null si aún no hay ninguna posición en Redis (o expiró el TTL). */
  ubicacion: { lat: number; lng: number; ts: number } | null;
  /** Epoch ms del evento 'llegada' (null si aún no llega). */
  llegadaEn: number | null;
  /** Coordenadas del destino (dirección de la reserva). */
  cliente: { lat: number | null; lng: number | null };
};

export interface BookingService {
  crearReserva(input: CrearReservaRequest): Promise<CrearReservaResponse>;
  /** Estado actual de la reserva (poll del matching). */
  obtenerReserva(bookingId: string): Promise<ReservaDetalle>;
  /** Cancela la reserva del cliente. */
  cancelarReserva(bookingId: string): Promise<ReservaDetalle>;
  /** Última posición del pro (respaldo por polling del tracking). */
  obtenerTracking(bookingId: string): Promise<ReservaTracking>;
}

let implementation: BookingService = createMockBookingService();

export function getBookingService(): BookingService {
  return implementation;
}

/** Solo para tests o swap a implementación HTTP (ver initBackend). */
export function setBookingServiceForTesting(service: BookingService): void {
  implementation = service;
}
