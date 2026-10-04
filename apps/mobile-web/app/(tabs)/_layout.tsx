import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { ProLiveProvider } from '@/lib/proLiveState';

function Icon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 22 }}>{emoji}</Text>;
}

export default function TabLayout() {
  return (
    <ProLiveProvider>
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
    </ProLiveProvider>
  );
}
