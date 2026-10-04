import { io, Socket } from 'socket.io-client';

export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:4001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      // Fase 5: reconexión automática (Expo Go pierde red con facilidad).
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 15000,
    });
  }
  return socket;
}

export function isSocketLive(): boolean {
  try {
    return !!socket?.connected;
  } catch {
    return false;
  }
}

// Cliente entra a la room de su reserva. Si declara professional_id, el
// servidor vincula pro <-> booking para reenviar GPS 1:1 (Fase 5).
export function joinBooking(booking_id: string | number, professional_id?: string | number) {
  const payload: Record<string, unknown> = { booking_id: String(booking_id) };
  if (professional_id !== undefined) payload.professional_id = professional_id;
  getSocket().emit('booking:join', payload);
}

// El pro llama esto al aceptar: su GPS empieza a reenviarse a booking:{id}.
export function attachBookingToPro(booking_id: string | number, professional_id: string | number) {
  getSocket().emit('booking:attach', {
    booking_id: String(booking_id),
    professional_id,
  });
}

export function emitProOnline(professional_id: string | number) {
  getSocket().emit('prof:online', { professional_id });
}

export function emitProOffline(professional_id: string | number) {
  getSocket().emit('prof:offline', { professional_id });
}

// Heartbeat cada ~25s para no expirar el TTL 40s de Redis (Fase 5).
export function emitHeartbeat(professional_id: string | number) {
  try {
    getSocket().emit('prof:heartbeat', { professional_id });
  } catch {
    /* sin conexión: el fallback polling de tracking lo compensa */
  }
}

// GPS throttled del pro (el servidor rate-limitea a 1 msg / 5s + ban).
export function emitLocation(
  professional_id: string | number,
  lat: number,
  lng: number,
  booking_id?: string | number
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
  const payload: Record<string, unknown> = { professional_id, lat, lng };
  if (booking_id !== undefined) payload.booking_id = String(booking_id);
  getSocket().emit('location:update', payload);
}

// Al crear la reserva en Directus, avisar en realtime al pro + admin (Fase 4/5).
export function emitBookingNew(args: {
  booking_id: string | number;
  professional_id?: string | number;
  service?: unknown;
  client?: unknown;
}) {
  getSocket().emit('booking:new', {
    booking_id: String(args.booking_id),
    ...(args.professional_id !== undefined ? { professional_id: args.professional_id } : {}),
    ...(args.service !== undefined ? { service: args.service } : {}),
    ...(args.client !== undefined ? { client: args.client } : {}),
  });
}

export function emitBookingStatus(booking_id: string | number, status: string) {
  getSocket().emit('booking:status', { booking_id: String(booking_id), status });
}
