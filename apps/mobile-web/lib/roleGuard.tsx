import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './auth';

export type Role = 'client' | 'pro' | 'admin';

/** Pantalla de inicio según rol (separación estricta cliente vs profesional). */
export function homeForRole(isProfessional: boolean, isAdmin: boolean): string {
  if (isAdmin) return '/admin/dashboard';
  if (isProfessional) return '/pro/incoming';
  return '/(tabs)';
}

/**
 * Barrera de rol para layouts. Mientras carga la sesión muestra spinner;
 * si el rol no coincide, redirige a su pantalla de inicio (sin parpadeo de
 * contenido prohibido). Defensa en profundidad: el control fino de datos
 * vive en Directus (roles client/professional/admin).
 */
export function RoleGate({ allow, children }: { allow: Role; children: React.ReactNode }) {
  const { user, isProfessional, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.text}>Verificando tu cuenta…</Text>
      </View>
    );
  }
  if (!user) return <Redirect href="/(auth)/login" />;

  const ok =
    allow === 'client'
      ? !isProfessional && !isAdmin
      : allow === 'pro'
        ? isProfessional && !isAdmin
        : isAdmin;
  if (!ok) return <Redirect href={homeForRole(isProfessional, isAdmin) as any} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { color: '#6b7280' },
});
