import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';

export default function AdminLayout() {
  const { user, loading } = useAuth();
  // Defensa en profundidad: el guard raíz ya pide login.
  // El control fino de permisos vive en Directus (roles client/professional/admin).
  if (!loading && !user) return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
