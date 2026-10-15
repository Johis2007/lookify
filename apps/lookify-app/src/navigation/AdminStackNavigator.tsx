// src/navigation/AdminStackNavigator.tsx
// Stack del panel administrador (rol admin de Directus): login, dashboard,
// verificación de profesionales y directorio de usuarios (clientes y pros).

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AdminLoginScreen from '../screens/admin/AdminLoginScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminVerificationScreen from '../screens/admin/AdminVerificationScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';

export type AdminStackParamList = {
  AdminLogin: undefined;
  AdminDashboard: undefined;
  AdminVerification: undefined;
  AdminUsers: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export default function AdminStackNavigator() {
  return (
    <Stack.Navigator initialRouteName="AdminLogin" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminVerification" component={AdminVerificationScreen} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
    </Stack.Navigator>
  );
}
