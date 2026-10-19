import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { RoleGate } from '@/lib/roleGuard';

function Icon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 22 }}>{emoji}</Text>;
}

// Zona CLIENTE: solicitud, búsqueda (radar/mapa), perfil personal y
// seguimiento de servicios. Exclusiva de cuentas cliente (el guard raíz y
// este gate redirigen a profesionales y admins a su propio dashboard).
// ProLiveProvider vive en el layout raíz para compartir una sola instancia
// GPS entre (tabs) y /pro.
export default function TabLayout() {
  return (
    <RoleGate allow="client">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Stitch.colors.secondary,
          tabBarInactiveTintColor: Stitch.colors.onSurfaceVariant,
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: Stitch.colors.surfaceHigh, height: 64, paddingBottom: 8 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: () => <Icon emoji="🏠" /> }} />
        <Tabs.Screen name="services" options={{ title: 'Servicios', tabBarIcon: () => <Icon emoji="✂️" /> }} />
        <Tabs.Screen name="radar" options={{ title: 'Radar', tabBarIcon: () => <Icon emoji="📡" /> }} />
        <Tabs.Screen name="bookings" options={{ title: 'Reservas', tabBarIcon: () => <Icon emoji="🗓" /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: () => <Icon emoji="👤" /> }} />
      </Tabs>
    </RoleGate>
  );
}
