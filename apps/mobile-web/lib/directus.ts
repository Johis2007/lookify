import { createDirectus, rest, authentication } from '@directus/sdk';

const DIRECTUS_URL =
  process.env.EXPO_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';

export type BeautyProfessional = {
  id: number;
  user: string;
  display_name: string;
  bio?: string;
  avatar?: string;
  is_online: boolean;
  rating_avg?: number;
  current_lat?: number;
  current_lng?: number;
  geohash?: string;
  verification_status?: 'pending' | 'verified' | 'rejected';
  verification_note?: string;
  years_exp?: number;
  specialties?: string;
  phone?: string;
};

export type BeautyService = {
  id: number;
  name: string;
  category: string;
  category_id?: number;
  description?: string;
  price_base: number;
  duration_min: number;
  is_active: boolean;
  is_featured?: boolean;
  image?: string;
};

export type ServiceCategory = { id: number; name: string; slug: string; icon?: string; color?: string; is_active: boolean };
export type ClientProfile = { id: number; user: string; display_name: string; phone?: string; avatar?: string; address_text?: string; lat?: number; lng?: number };
export type Booking = {
  id: number;
  client: string;
  professional: number;
  service: number;
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'cancelled';
  price_snapshot: number;
  address_text?: string;
  lat?: number;
  lng?: number;
  scheduled_at?: string;
  created_at?: string;
  eta_min?: number;
  rating?: number;
  review_comment?: string;
  payment_method?: string;
};
export type Review = { id: number; booking: number; client: string; professional: number; rating: number; comment?: string; created_at?: string };
export type RadarSearch = { id: number; client: string; lat?: number; lng?: number; radius_m: number; service?: number; status: string; matched_professional?: number };
export type BookingEvent = { id: number; booking: number; status: string; lat?: number; lng?: number; note?: string; created_at?: string };
export type ProfessionalDocument = { id: number; professional: number; file: string; doc_type: string; status: string; note?: string };

type Schema = {
  beauty_professionals: BeautyProfessional;
  beauty_services: BeautyService;
  service_categories: ServiceCategory;
  client_profiles: ClientProfile;
  bookings: Booking;
  reviews: Review;
  radar_searches: RadarSearch;
  booking_events: BookingEvent;
  professional_documents: ProfessionalDocument;
  professional_services: { id: number; professional_id: number; service_id: number; price_override?: number };
  professional_locations: { professional_id: number; updated_at?: string };
  availability_slots: { id: number; professional_id: number; weekday: number; start: string; end: string };
};

export const directus = createDirectus<Schema>(DIRECTUS_URL)
  .with(authentication('json'))
  .with(rest());

export const DIRECTUS_URL_EXPORT = DIRECTUS_URL;
export const assetUrl = (fileId?: string | null, w = 400) =>
  fileId ? `${DIRECTUS_URL}/assets/${fileId}?fit=cover&width=${w}` : undefined;
