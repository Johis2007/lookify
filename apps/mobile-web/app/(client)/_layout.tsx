import { Stack } from 'expo-router';

export default function ClientLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="map" />
      <Stack.Screen name="booking/[id]" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}