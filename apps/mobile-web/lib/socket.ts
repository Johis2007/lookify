import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:4001';

let socket: Socket | null = null;

/**
 * Obtener o crear la conexión Socket.io (singleton)
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Conectado:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Desconectado:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Error de conexión:', error.message);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Reconectado después de', attemptNumber, 'intentos');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket] Intento de reconexión:', attemptNumber);
    });
  }
  return socket;
}

/**
 * Conectar socket
 */
export function connectSocket(): Promise<void> {
  const s = getSocket();
  if (s.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket timeout')), 10000);
    s.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    s.once('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    s.connect();
  });
}

/**
 * Desconectar socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Eventos de ubicación (Profesional → Server)
 */
export function emitLocationUpdate(data: { lat: number; lng: number; ts?: number }) {
  getSocket().emit('location:update', data);
}

/**
 * Eventos de estado online/offline (Profesional → Server)
 */
export function emitProfOnline(professionalId: string) {
  getSocket().emit('prof:online', { professionalId });
}

export function emitProfOffline(professionalId: string) {
  getSocket().emit('prof:offline', { professionalId });
}

/**
 * Eventos de reserva
 */
export function emitBookingCreate(booking: any) {
  getSocket().emit('booking:create', booking);
}

export function onBookingNew(callback: (booking: any) => void) {
  getSocket().on('booking:new', callback);
  return () => getSocket().off('booking:new', callback);
}

export function onBookingStatus(callback: (data: { bookingId: string; status: string }) => void) {
  getSocket().on('booking:status', callback);
  return () => getSocket().off('booking:status', callback);
}

/**
 * Unirse a rooms
 */
export function joinBookingRoom(bookingId: string) {
  getSocket().emit('join:booking', bookingId);
}

export function leaveBookingRoom(bookingId: string) {
  getSocket().emit('leave:booking', bookingId);
}

export function joinProfRoom(professionalId: string) {
  getSocket().emit('join:prof', professionalId);
}

export function leaveProfRoom(professionalId: string) {
  getSocket().emit('leave:prof', professionalId);
}

/**
 * Escuchar profesionales cercanos (broadcast del server a clientes)
 */
export function onZoneUpdate(callback: (professionals: any[]) => void) {
  getSocket().on('zone:update', callback);
  return () => getSocket().off('zone:update', callback);
}

/**
 * Solicitar profesionales cercanos (query al server)
 */
export function requestNearby(params: { lat: number; lng: number; radius: number; serviceId?: string }) {
  getSocket().emit('nearby:request', params);
}

export function onNearbyResponse(callback: (professionals: any[]) => void) {
  getSocket().on('nearby:response', callback);
  return () => getSocket().off('nearby:response', callback);
}

export default getSocket;