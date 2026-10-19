import { Stack } from 'expo-router';
import { RoleGate } from '@/lib/roleGuard';

// Zona ADMIN: métricas y paneles de control. Solo rol administrador de
// Directus. Clientes y profesionales nunca acceden (ni por URL directa).
export default function AdminLayout() {
  return (
    <RoleGate allow="admin">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGate>
  );
}
