// src/navigation/AdminStackNavigator.tsx
// Stack del panel administrador (rol admin de Directus): login, dashboard,
// verificación de profesionales y directorio de usuarios (clientes y pros).

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminVerificationScreen from '../screens/admin/AdminVerificationScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';

export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminVerification: undefined;
  AdminUsers: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export default function AdminStackNavigator() {
  return (
    <Stack.Navigator initialRouteName="AdminDashboard" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminVerification" component={AdminVerificationScreen} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
    </Stack.Navigator>
  );
}
