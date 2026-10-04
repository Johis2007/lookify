import React from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Lookify, STATUS_COLOR, STATUS_LABEL, type BookingStatus } from '@/constants/Lookify';

// Lookify Logo — wordmark + sparkle. Sustituye al asset "Lookify Logo" de Stitch.
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoMark, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.logoMarkText, { fontSize: size * 0.55 }]}>✦</Text>
      </View>
      <Text style={[styles.logoWord, { fontSize: size * 0.8 }]}>Lookify</Text>
    </View>
  );
}

// Avatar cálido estilo Stitch: "friendly young woman, warm lighting, cream bg".
// Usa foto Directus si hay, si no un placeholder con iniciales en crema.
export function Avatar({ uri, name, size = 48 }: { uri?: string | null; name?: string; size?: number }) {
  const initials = (name || 'L').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#F1E2D6' }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, variant = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'dark' | 'ghost' }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, variant === 'primary' && styles.btnPrimary, variant === 'dark' && styles.btnDark, variant === 'ghost' && styles.btnGhost, disabled && { opacity: 0.55 }]}
    >
      <Text style={[styles.btnText, variant === 'ghost' && styles.btnTextGhost]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive, color && active && { backgroundColor: color }]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <View style={[styles.badge, { backgroundColor: (STATUS_COLOR[status] || '#888') + '1A', borderColor: STATUS_COLOR[status] }]}>
      <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />
      <Text style={[styles.badgeText, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status] || status}</Text>
    </View>
  );
}

export function Stars({ value = 5, size = 16 }: { value?: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: size, color: i <= Math.round(value) ? '#E9A23B' : '#E5D5C8' }}>★</Text>
      ))}
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (t: string) => void; placeholder?: string }) {
  return (
    <View style={styles.search}>
      <Text style={styles.searchIcon}>⌕</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder || 'Buscar servicios, estudios…'} placeholderTextColor="#B9A49A" style={styles.searchInput} />
    </View>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoMark: { backgroundColor: Lookify.colors.primary, alignItems: 'center', justifyContent: 'center' },
  logoMarkText: { color: '#fff', fontWeight: '900' },
  logoWord: { fontWeight: '900', color: Lookify.colors.ink, letterSpacing: -0.5 },
  avatarFallback: { backgroundColor: '#FBE3D8', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { fontWeight: '800', color: '#9C4A3C' },
  btn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: Lookify.colors.primary },
  btnDark: { backgroundColor: Lookify.colors.dark },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Lookify.colors.line },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnTextGhost: { color: Lookify.colors.ink },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Lookify.colors.line, shadowColor: '#9C4A3C', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: Lookify.colors.line },
  chipActive: { backgroundColor: Lookify.colors.dark, borderColor: Lookify.colors.dark },
  chipText: { fontSize: 13, fontWeight: '600', color: Lookify.colors.ink },
  chipTextActive: { color: '#fff' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  screen: { flex: 1, backgroundColor: Lookify.colors.bg },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: Lookify.colors.line, paddingHorizontal: 12, gap: 8 },
  searchIcon: { fontSize: 18, color: Lookify.colors.muted },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: Lookify.colors.ink },
});
