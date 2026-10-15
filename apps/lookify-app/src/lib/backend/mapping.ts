// src/lib/backend/mapping.ts
// Mapeo contratos frontend ↔ colecciones Directus + reglas de negocio
// compartidas (comisión 15% solo sobre base, PIN determinista, periodos
// Bogotá). Ver docs/adaptacion-backend.md para desvíos del contrato.

import { distanciaKm } from '../../utils/geo';

// ---------- Filas Directus ----------

export type DProfessional = {
  id: number;
  user: string;
  display_name: string;
  is_online: boolean;
  rating_avg?: number | null;
  avatar?: string | null;
  verification_status?: 'pending' | 'verified' | 'rejected' | null;
  verification_note?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
};

export type DService = {
  id: number;
  name: string;
  category?: string;
  category_id?: number | null;
  price_base: number;
  duration_min: number;
  is_active: boolean;
};

export type DCategory = { id: number; name: string; slug: string };

export type DBooking = {
  id: number;
  client: string;
  professional: number;
  service: number | { id: number; name: string; price_base: number; duration_min: number };
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'cancelled';
  price_snapshot: number;
  address_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  payment_method?: string | null;
  created_at?: string;
  completed_at?: string | null;
  cancel_reason?: string | null;
};

export type DReview = {
  id: number;
  booking: number;
  client: string;
  professional: number;
  rating: number;
  comment?: string | null;
  created_at?: string;
};

export type DBookingEvent = { id: number; booking: number; status: string; note?: string | null; created_at?: string };

// ---------- Negocio ----------

export const COMISION_PCT = 15;

/** Comisión 15% solo sobre precio base, redondeo al entero más cercano. */
export function comisionCop(precioBaseCop: number): number {
  return Math.round((precioBaseCop * COMISION_PCT) / 100);
}

/** PIN determinista por reserva (misma fórmula que mobile-web). */
export function pinForBookingId(bookingId: number): string {
  return String(1000 + ((bookingId * 7919) % 9000));
}

export function primerNombre(displayName?: string | null): string {
  const p = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  return p[0] ?? 'Cliente';
}

export function desglose(serviceBase: number, totalSnapshot: number): {
  precioBaseCop: number;
  precioDomicilioCop: number;
  precioTotalCop: number;
} {
  const precioBaseCop = Math.max(0, Math.round(serviceBase));
  const precioTotalCop = Math.max(0, Math.round(totalSnapshot));
  return {
    precioBaseCop,
    precioDomicilioCop: Math.max(0, precioTotalCop - precioBaseCop),
    precioTotalCop,
  };
}

/** Distancia aproximada pro→reserva en km (1 decimal), null si sin coords. */
export function distanciaAprox(
  proLat?: number | null,
  proLng?: number | null,
  bLat?: number | null,
  bLng?: number | null,
): number | null {
  if (proLat == null || proLng == null || bLat == null || bLng == null) return null;
  return Math.round(distanciaKm(proLat, proLng, bLat, bLng) * 10) / 10;
}

export function metodoPago(value?: string | null): 'EFECTIVO' | 'DIGITAL' {
  const v = (value ?? '').toUpperCase();
  if (v.includes('EFECT') || v === 'CASH') return 'EFECTIVO';
  return 'DIGITAL';
}

/** Ventana de respuesta del profesional: creada + 60s (ver mobile-web). */
export const VENTANA_RESPUESTA_MS = 60_000;

export function expiraEnDesdeCreada(createdAt?: string): number {
  const base = createdAt ? Date.parse(createdAt) : Date.now();
  return (Number.isNaN(base) ? Date.now() : base) + VENTANA_RESPUESTA_MS;
}
