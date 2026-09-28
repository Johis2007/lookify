import { Stack, router } from 'expo-router';
import { useEffect } from 'react';

export default function TabsLayout() {
  // Redirect to auth flow - login will redirect to appropriate role
  useEffect(() => {
    router.replace('/(auth)/login');
  }, []);

  return <Stack />;
}