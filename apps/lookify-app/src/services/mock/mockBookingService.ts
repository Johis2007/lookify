import {
  BookingService,
  CrearReservaRequest,
  CrearReservaResponse,
  ReservaDetalle,
} from '../bookingService';
import { ServiceError } from '../errors';

// Mock del servicio de reservas: no toca la red. Genera un id local estable
// por solicitud para que el flujo de Matching/Tracking siga funcionando sin
// backend.

let seq = 0;

type MockState = {
  estado: ReservaDetalle['estado'];
  expiraEn: number | null;
  profesional: ReservaDetalle['profesional'];
};

const reservas = new Map<string, MockState>();

/** Ventana de búsqueda simulada (60 s), igual que el TTL del servidor. */
const TTL_MS = 60_000;

export function createMockBookingService(): BookingService {
  return {
    async crearReserva(_input: CrearReservaRequest): Promise<CrearReservaResponse> {
      seq += 1;
      const bookingId = 900000 + seq;
      const expiraEn = Date.now() + TTL_MS;
      reservas.set(String(bookingId), {
        estado: 'pending',
        expiraEn,
        profesional: null,
      });
      return {
        bookingId: String(bookingId),
        estado: 'pending',
        precioTotal: null,
        expiraEn,
        ronda: 1,
      };
    },

    async obtenerReserva(bookingId: string): Promise<ReservaDetalle> {
      const st = reservas.get(bookingId);
      if (!st) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      let estado = st.estado;
      if (estado === 'pending' && st.expiraEn !== null && Date.now() > st.expiraEn) {
        estado = 'expired';
        st.estado = 'expired';
        st.expiraEn = null;
      }
      return {
        bookingId,
        estado,
        precioTotal: null,
        expiraEn: st.expiraEn,
        ronda: 1,
        profesional: st.profesional,
        servicioNombre: null,
      };
    },

    async cancelarReserva(bookingId: string): Promise<ReservaDetalle> {
      const st = reservas.get(bookingId);
      if (!st) throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      st.estado = 'cancelled';
      st.expiraEn = null;
      return {
        bookingId,
        estado: 'cancelled',
        precioTotal: null,
        expiraEn: null,
        ronda: 1,
        profesional: null,
        servicioNombre: null,
      };
    },
  };
}
