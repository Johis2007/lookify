// Design tokens Lookify — derivados del brief Stitch:
// "warm lighting, neutral soft cream background, modern mobile app"
export const Lookify = {
  colors: {
    bg: '#FFF7F0',
    card: '#FFFFFF',
    ink: '#2B1B17',
    muted: '#8A756E',
    line: '#F1E2D6',
    primary: '#E85D7A', // rosa coral belleza
    primaryDark: '#C74361',
    gold: '#E9A23B',
    dark: '#2B1B17',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    chip: '#FDECEF',
    mapPin: '#E85D7A',
  },
  radius: { sm: 10, md: 16, lg: 22, full: 999 },
  spacing: (n: number) => n * 4,
} as const;

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const STATUS_COLOR: Record<BookingStatus, string> = {
  pending: '#F59E0B',
  accepted: '#3B82F6',
  rejected: '#EF4444',
  in_progress: '#8B5CF6',
  completed: '#22C55E',
  cancelled: '#8A756E',
};
