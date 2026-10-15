// src/lib/backend/admin.ts
// Consultas del panel admin (token de administrador). Lógica portada de
// mobile-web/app/admin (dashboard, verification, users) a este proyecto.

import { adminApi } from './adminAuth';
import { BACKEND } from './config';

export type AdminStats = {
  bookings: number;
  pending: number;
  revenue: number;
  pros: number;
  prosOnline: number;
  services: number;
  reviews: number;
  users: number;
  verifyPending: number;
};

export type AdminBooking = {
  id: number;
  status: string;
  price_snapshot: number;
  created_at?: string;
  service?: { name?: string } | number | null;
};

export type VerificationFilter = 'pending' | 'verified' | 'rejected';

export type VerificationPro = {
  id: number;
  display_name?: string;
  specialties?: string;
  bio?: string;
  years_exp?: number;
  phone?: string;
  rating_avg?: number | null;
  avatar?: string | null;
  verification_status?: string;
  verification_note?: string | null;
};

export type VerificationDoc = {
  id: number;
  doc_type?: string;
  status?: string;
  note?: string | null;
  created_at?: string;
  file?: string | { id?: string } | null;
};

export type DirUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  status?: string;
};

export type UserDossier = {
  bookings: number;
  spend: number;
  cancels: number;
  ratingGiven: number | null;
  phone?: string;
  address?: string;
  recent: AdminBooking[];
};

export const assetUrl = (fileId?: string | null): string | undefined =>
  fileId ? `${BACKEND.directusUrl}/assets/${fileId}` : undefined;

export function fileIdOf(file?: string | { id?: string } | null): string | undefined {
  if (!file) return undefined;
  return typeof file === 'string' ? file : file.id ?? undefined;
}

async function metaTotal(path: string): Promise<number> {
  try {
    const j: any = await adminApi('GET', `${path}${path.includes('?') ? '&' : '?'}limit=1&meta=total_count&fields=id`);
    return Number(j?.meta?.filter_count ?? j?.meta?.total_count ?? 0) || 0;
  } catch {
    return 0;
  }
}

export async function fetchAdminStats(): Promise<{ stats: AdminStats; recent: AdminBooking[] }> {
  const [bookings, pros, services, reviews, users, verifyPending, recent] = await Promise.all([
    adminApi<any[]>('GET', '/items/bookings?limit=200&fields=id,status,price_snapshot').catch(() => []),
    adminApi<any[]>('GET', '/items/beauty_professionals?limit=200&fields=id,is_online,verification_status').catch(() => []),
    adminApi<any[]>('GET', '/items/beauty_services?limit=200&fields=id').catch(() => []),
    adminApi<any[]>('GET', '/items/reviews?limit=200&fields=id').catch(() => []),
    adminApi<any>('GET', '/users?limit=1&meta=total_count&fields=id').catch(() => null),
    metaTotal('/items/beauty_professionals?filter[verification_status][_eq]=pending'),
    adminApi<any[]>('GET', '/items/bookings?sort=-created_at&limit=6&fields=id,created_at,status,price_snapshot,service.name').catch(() => []),
  ]);
  const completed = bookings.filter((b) => b.status === 'completed');
  return {
    stats: {
      bookings: bookings.length,
      pending: bookings.filter((b) => b.status === 'pending').length,
      revenue: completed.reduce((a, b) => a + (Number(b.price_snapshot) || 0), 0),
      pros: pros.length,
      prosOnline: pros.filter((p) => p.is_online).length,
      services: services.length,
      reviews: reviews.length,
      users: Number(users?.meta?.filter_count ?? users?.meta?.total_count ?? 0) || 0,
      verifyPending,
    },
    recent,
  };
}

export async function fetchVerificationQueue(filter: VerificationFilter): Promise<VerificationPro[]> {
  return adminApi<VerificationPro[]>(
    'GET',
    `/items/beauty_professionals?filter[verification_status][_eq]=${filter}` +
      `&limit=50&sort=-id&fields=id,display_name,specialties,bio,years_exp,phone,rating_avg,avatar,verification_status,verification_note`,
  );
}

export async function fetchProDocuments(proId: number): Promise<VerificationDoc[]> {
  return adminApi<VerificationDoc[]>(
    'GET',
    `/items/professional_documents?filter[professional][_eq]=${proId}` +
      `&fields=id,doc_type,status,note,created_at,file&limit=20&sort=-created_at`,
  );
}

export async function decideProfessional(
  id: number,
  status: 'verified' | 'rejected',
  note: string,
): Promise<void> {
  await adminApi('PATCH', `/items/beauty_professionals/${id}`, {
    verification_status: status,
    verification_note: note,
  });
}

export async function fetchUsersPage(opts: {
  q: string;
  suspendedOnly: boolean;
  page: number;
  limit: number;
}): Promise<{ users: DirUser[]; total: number }> {
  const search = opts.q.trim() ? `&search=${encodeURIComponent(opts.q.trim())}` : '';
  const statusF = opts.suspendedOnly ? '&filter[status][_eq]=suspended' : '';
  const j: any = await adminApi(
    'GET',
    `/users?fields=id,first_name,last_name,email,status&limit=${opts.limit}` +
      `&offset=${opts.page * opts.limit}&sort=-id&meta=total_count${search}${statusF}`,
  );
  return {
    users: Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [],
    total: Number(j?.meta?.filter_count ?? j?.meta?.total_count ?? 0) || 0,
  };
}

export async function fetchUsersCounts(): Promise<{ total: number; pros: number; suspended: number }> {
  const [total, pros, suspended] = await Promise.all([
    metaTotal('/users'),
    metaTotal('/items/beauty_professionals'),
    metaTotal('/users?filter[status][_eq]=suspended'),
  ]);
  return { total, pros, suspended };
}

export async function fetchProUserIds(): Promise<Set<string>> {
  try {
    const rows = await adminApi<{ user: string }[]>('GET', '/items/beauty_professionals?fields=user&limit=1000');
    return new Set(rows.map((r) => String(r.user)));
  } catch {
    return new Set();
  }
}

export async function fetchUserDossier(userId: string): Promise<UserDossier> {
  const [bk, rv, cp] = await Promise.all([
    adminApi<any[]>('GET', `/items/bookings?filter[client][_eq]=${userId}&fields=id,price_snapshot,status&limit=100`).catch(() => []),
    adminApi<any[]>('GET', `/items/reviews?filter[client][_eq]=${userId}&fields=rating&limit=100`).catch(() => []),
    adminApi<any[]>('GET', `/items/client_profiles?filter[user][_eq]=${userId}&fields=phone,address_text,display_name&limit=1`).catch(() => []),
  ]);
  const completed = bk.filter((b) => b.status === 'completed');
  const dossier: UserDossier = {
    bookings: bk.length,
    spend: completed.reduce((s, b) => s + (Number(b.price_snapshot) || 0), 0),
    cancels: bk.filter((b) => b.status === 'cancelled').length,
    ratingGiven: rv.length ? rv.reduce((s, r) => s + (Number(r.rating) || 0), 0) / rv.length : null,
    phone: cp[0]?.phone,
    address: cp[0]?.address_text,
    recent: [],
  };
  try {
    const hist = await adminApi<any[]>(
      'GET',
      `/items/bookings?filter[client][_eq]=${userId}&sort=-created_at&limit=5&fields=id,price_snapshot,status,created_at,service.name,professional.display_name`,
    );
    dossier.recent = hist;
  } catch {
    /* sin historial */
  }
  return dossier;
}

export async function setUserStatus(userId: string, status: 'active' | 'suspended'): Promise<void> {
  await adminApi('PATCH', `/users/${userId}`, { status });
}
