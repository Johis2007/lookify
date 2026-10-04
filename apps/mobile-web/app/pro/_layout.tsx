import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';

export default function ProLayout() {
  const { user, loading } = useAuth();
  // Defensa en profundidad: el guard raíz ya pide login.
  // Cada pantalla muestra estado vacío si aún no hay perfil profesional.
  if (!loading && !user) return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
