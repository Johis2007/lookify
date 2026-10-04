import { assetUrl, type BeautyProfessional, type BeautyService, type Booking, type ServiceCategory } from './directus';

type FetchFn = (path: string, init?: RequestInit) => Promise<Response>;

async function getJson<T>(authFetch: FetchFn, path: string): Promise<T[]> {
  const r = await authFetch(path);
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return (j?.data as T[]) || [];
}

// Haversine local (fallback sin Distance Matrix) — anti-costos Google.
export function kmBetween(aLat: number, aLng: number, bLat?: number, bLng?: number) {
  if (bLat == null || bLng == null) return null;
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function fetchCategories(authFetch: FetchFn): Promise<ServiceCategory[]> {
  return getJson(authFetch, '/items/service_categories?filter[is_active][_eq]=true&limit=20');
}

export async function fetchServices(authFetch: FetchFn, categoryId?: number): Promise<BeautyService[]> {
  const f = categoryId ? `&filter[category_id][_eq]=${categoryId}` : '';
  return getJson(authFetch, `/items/beauty_services?filter[is_active][_eq]=true${f}&limit=50&fields=*,category_id.*`);
}

export type ProWithMeta = BeautyProfessional & { avatarUrl?: string; distanceKm?: number | null; priceFrom?: number };

export async function fetchOnlinePros(authFetch: FetchFn, lat?: number, lng?: number, radiusKm = 10): Promise<ProWithMeta[]> {
  const rows = await getJson<BeautyProfessional>(authFetch, '/items/beauty_professionals?filter[is_online][_eq]=true&limit=20&fields=*,avatar');
  return rows
    .map((p) => ({
      ...p,
      avatarUrl: assetUrl(typeof p.avatar === 'string' ? p.avatar : (p.avatar as any)?.id || (p.avatar as any)),
      distanceKm: lat != null && lng != null ? kmBetween(lat, lng, p.current_lat, p.current_lng) : null,
    }))
    .filter((p) => p.distanceKm == null || p.distanceKm <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
}

export async function createBooking(authFetch: FetchFn, payload: Partial<Booking>) {
  const r = await authFetch('/items/bookings', { method: 'POST', body: JSON.stringify({ status: 'pending', payment_method: 'efectivo', ...payload }) });
  if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.errors?.[0]?.message || 'No se pudo crear la reserva'); }
  return (await r.json()).data as Booking;
}

export async function patchBooking(authFetch: FetchFn, id: number, patch: Partial<Booking>) {
  const r = await authFetch(`/items/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  if (!r.ok) throw new Error('No se pudo actualizar la reserva');
  return (await r.json()).data as Booking;
}

export async function fetchMyBookings(authFetch: FetchFn, userId: string, asPro: number | null) {
  const path = asPro
    ? `/items/bookings?filter[professional][_eq]=${asPro}&sort=-created_at&limit=30&fields=*,service.*,professional.*`
    : `/items/bookings?filter[client][_eq]=${userId}&sort=-created_at&limit=30&fields=*,service.*,professional.*`;
  return getJson<any>(authFetch, path);
}

export async function createReview(authFetch: FetchFn, payload: { booking: number; client: string; professional: number; rating: number; comment?: string }) {
  // Idempotente: si ya existe reseña para la reserva, no duplicar.
  const ex = await authFetch(`/items/reviews?filter[booking][_eq]=${payload.booking}&fields=id&limit=1`);
  if (ex.ok) {
    const { data: rows } = await ex.json().catch(() => ({ data: [] }));
    if (Array.isArray(rows) && rows.length > 0) throw new Error('Esta reserva ya fue calificada.');
  }
  const r = await authFetch('/items/reviews', { method: 'POST', body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('No se pudo guardar la calificación');
  // espejo en bookings para resumen rápido (si falla, se avisa: reintentar es seguro por el check de arriba)
  const b = await authFetch(`/items/bookings/${payload.booking}`, { method: 'PATCH', body: JSON.stringify({ rating: payload.rating, review_comment: payload.comment || null, status: 'completed', completed_at: new Date().toISOString() }) });
  if (!b.ok) throw new Error('Calificación guardada pero la reserva no se marcó completada.');
  return (await r.json()).data;
}

export async function createRadarSearch(authFetch: FetchFn, payload: { client: string; lat?: number; lng?: number; radius_m: number; service?: number }) {
  const r = await authFetch('/items/radar_searches', { method: 'POST', body: JSON.stringify({ status: 'pending', ...payload }) });
  if (!r.ok) return null;
  return (await r.json()).data;
}

export async function logBookingEvent(authFetch: FetchFn, booking: number, status: string, extra?: { lat?: number; lng?: number; note?: string }) {
  await authFetch('/items/booking_events', { method: 'POST', body: JSON.stringify({ booking, status, ...extra }) }).catch(() => null);
}
