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

/**
 * La reserva la tomó otro profesional: el candidato la retira de su lista.
 * El servidor lo emite en la sala prof:{id} como 'booking:taken'.
 */
export function onBookingTaken(cb: (bookingId: string) => void): () => void {
  if (!socket) return () => undefined;
  const handler = (p: { booking_id?: string | number }) => {
    if (p?.booking_id === undefined || p?.booking_id === null) return;
    cb(String(p.booking_id));
  };
  socket.on('booking:taken', handler);
  return () => {
    try {
      socket?.off('booking:taken', handler);
    } catch {
      /* noop */
    }
  };
}

export function emitBookingStatus(bookingId: string, status: string): void {
  try {
    socket?.emit('booking:status', { booking_id: bookingId, status });
  } catch {
    /* noop */
  }
}

/**
 * GPS del profesional hacia UNA reserva (4C-2). El servidor deriva quién eres
 * del token, exige que seas el pro asignado y que la reserva siga `accepted`.
 */
export function emitBookingLocation(bookingId: string, lat: number, lng: number): void {
  try {
    socket?.emit('location:update', { booking_id: bookingId, lat, lng });
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Socket del CLIENTE (4B): observa el estado de su propia reserva.
// Es un socket aparte del del profesional: el cliente no emite prof:*.
// ---------------------------------------------------------------------------

let clientSocket: Socket | null = null;

/** Conecta el socket del cliente (idempotente mientras viva la sesión). */
export function connectClientRealtime(token: string): Socket {
  if (clientSocket) return clientSocket;
  clientSocket = io(BACKEND.socketUrl, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
  });
  return clientSocket;
}

export function disconnectClientRealtime(): void {
  try {
    clientSocket?.disconnect();
  } catch {
    /* noop */
  }
  clientSocket = null;
}

/** Entra a la sala de su reserva para recibir booking:status. */
export function joinClientBookingRoom(bookingId: string): void {
  const emit = () => {
    try {
      clientSocket?.emit('booking:join', { booking_id: bookingId });
    } catch {
      /* noop */
    }
  };
  emit();
  // Tras una reconexión hay que volver a entrar a la sala.
  clientSocket?.on('connect', emit);
}

/**
 * Cambios de estado de la reserva del cliente.
 * El servidor emite { booking_id, status } en la sala booking:{id}.
 */
export function onBookingStatus(cb: (bookingId: string, status: string) => void): () => void {
  if (!clientSocket) return () => undefined;
  const handler = (p: { booking_id?: string | number; status?: string }) => {
    if (p?.booking_id === undefined || p?.booking_id === null) return;
    if (!p?.status) return;
    cb(String(p.booking_id), String(p.status));
  };
  clientSocket.on('booking:status', handler);
  return () => {
    try {
      clientSocket?.off('booking:status', handler);
    } catch {
      /* noop */
    }
  };
}

/** Última posición del pro en su reserva (4C-2), solo a participantes. */
export function onBookingLocation(
  cb: (p: { bookingId: string; lat: number; lng: number; ts: number }) => void,
): () => void {
  if (!clientSocket) return () => undefined;
  const handler = (p: {
    booking_id?: string | number;
    lat?: number;
    lng?: number;
    ts?: number;
  }) => {
    if (p?.booking_id === undefined || p?.booking_id === null) return;
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
    cb({
      bookingId: String(p.booking_id),
      lat: p.lat,
      lng: p.lng,
      ts: typeof p.ts === 'number' ? p.ts : Date.now(),
    });
  };
  clientSocket.on('booking:location', handler);
  return () => {
    try {
      clientSocket?.off('booking:location', handler);
    } catch {
      /* noop */
    }
  };
}

/** Avisos de la reserva (p. ej. la llegada del profesional). */
export function onBookingEvent(
  cb: (p: { bookingId: string; status: string; ts: number }) => void,
): () => void {
  if (!clientSocket) return () => undefined;
  const handler = (p: { booking_id?: string | number; status?: string; ts?: number }) => {
    if (p?.booking_id === undefined || p?.booking_id === null || !p.status) return;
    cb({
      bookingId: String(p.booking_id),
      status: String(p.status),
      ts: typeof p.ts === 'number' ? p.ts : Date.now(),
    });
  };
  clientSocket.on('booking:event', handler);
  return () => {
    try {
      clientSocket?.off('booking:event', handler);
    } catch {
      /* noop */
    }
  };
}
