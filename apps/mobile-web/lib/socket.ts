import { io, Socket } from 'socket.io-client';

export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:4001';

let socket: Socket | null = null;
// Último access token de Directus (lo fija el AuthProvider).
let currentToken: string | null = null;
// Cómo refrescar la sesión cuando el servidor rechaza con TOKEN_EXPIRED
// (lo registra el AuthProvider; el socket no conoce el refresh token).
let expiredHandler: (() => void) | null = null;

export function setAuthExpiredHandler(fn: (() => void) | null) {
  expiredHandler = fn;
}

// Fija el token del handshake. Con token: (re)conecta autenticado;
// sin token (logout): desconecta y no reintenta.
export function setSocketToken(token: string | null) {
  currentToken = token;
  if (!socket) return;
  socket.auth = token ? { token } : {};
  socket.disconnect();
  if (token) socket.connect();
}

export function disconnectSocket() {
  setSocketToken(null);
}

export function getSocket(): Socket {
  if (!socket) {
    const s = io(SOCKET_URL, {
      // Fase 5: reconexión automática (Expo Go pierde red con facilidad).
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 15000,
      // Fase 7: el servidor exige este JWT en el handshake (io.use).
      auth: currentToken ? { token: currentToken } : {},
    });
    s.on('connect_error', (err: Error) => {
      // Sin token no tiene sentido reintentar: el servidor siempre dirá no.
      if (err?.message === 'UNAUTHORIZED' && !currentToken) s.disconnect();
      // Token caducado: el AuthProvider lo refresca y reconecta con uno nuevo.
      if (err?.message === 'TOKEN_EXPIRED') {
        s.disconnect();
        expiredHandler?.();
      }
    });
    socket = s;
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
// servidor verifica que sea el propio antes de vincular GPS 1:1 (Fase 7).
export function joinBooking(booking_id: string | number, professional_id?: string | number) {
  const payload: Record<string, unknown> = { booking_id: String(booking_id) };
  if (professional_id !== undefined) payload.professional_id = professional_id;
  getSocket().emit('booking:join', payload);
}

// Salir de la room al cerrar la pantalla (deja de recibir GPS/estados).
export function leaveBooking(booking_id: string | number) {
  try {
    getSocket().emit('leave:booking', { booking_id: String(booking_id) });
  } catch {
    /* sin conexión: nada que salir */
  }
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
// El servidor verifica que la reserva exista y sea del propio cliente (Fase 7).
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
