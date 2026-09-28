import { Stack } from 'expo-router';

export default function ProLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="online" />
      <Stack.Screen name="requests" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}