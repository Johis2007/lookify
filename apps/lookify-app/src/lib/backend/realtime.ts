// src/lib/backend/realtime.ts
// Socket del realtime-server para el profesional: une a la sala prof:{id}
// (evento prof:online) y recibe booking:new con {booking_id}. El detalle se
// trae por REST de Directus. Heartbeat cada 25s como mobile-web.

import { io, Socket } from 'socket.io-client';
import { BACKEND } from './config';

let socket: Socket | null = null;
let heartbeatId: ReturnType<typeof setInterval> | null = null;
let proOnline = false;

export function connectRealtime(token: string): Socket {
  disconnectRealtime();
  socket = io(BACKEND.socketUrl, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
  });
  heartbeatId = setInterval(() => {
    try {
      socket?.emit('prof:heartbeat');
    } catch {
      /* reconectando */
    }
  }, 25_000);
  return socket;
}

export function disconnectRealtime(): void {
  if (heartbeatId) {
    clearInterval(heartbeatId);
    heartbeatId = null;
  }
  try {
    if (proOnline) socket?.emit('prof:offline');
  } catch {
    /* noop */
  }
  proOnline = false;
  try {
    socket?.disconnect();
  } catch {
    /* noop */
  }
  socket = null;
}

/** Une a la sala del profesional (necesario para recibir booking:new). */
export function ensureProOnline(): void {
  if (!socket) return;
  proOnline = true;
  socket.emit('prof:online');
}

/** Marca salida sin cerrar el socket (toggle a OCUPADO). */
export function emitProOffline(): void {
  if (!socket) return;
  proOnline = false;
  try {
    socket.emit('prof:offline');
  } catch {
    /* noop */
  }
}

export function onBookingNew(cb: (bookingId: string) => void): () => void {
  if (!socket) return () => undefined;
  const handler = (p: { booking_id?: string | number }) => {
    if (p?.booking_id !== undefined && p.booking_id !== null) cb(String(p.booking_id));
  };
  socket.on('booking:new', handler);
  return () => {
    try {
      socket?.off('booking:new', handler);
    } catch {
      /* noop */
    }
  };
}

export function joinBookingRoom(bookingId: string, professionalId: number): void {
  try {
    socket?.emit('booking:join', { booking_id: bookingId, professional_id: professionalId });
  } catch {
    /* noop */
  }
}

export function emitBookingStatus(bookingId: string, status: string): void {
  try {
    socket?.emit('booking:status', { booking_id: bookingId, status });
  } catch {
    /* noop */
  }
}
