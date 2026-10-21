// src/navigation/AppNavigator.tsx
// Stack de navegación principal. A medida que agreguemos pantallas
// (Matching, Profile, Tracking, Payment), se registran aquí.

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NavigatorScreenParams } from '@react-navigation/native';

import LoginScreen from '../screens/LoginScreen';
import AccountTypeScreen from '../screens/AccountTypeScreen';
import RegisterClientScreen from '../screens/RegisterClientScreen';
import HomeScreen from '../screens/HomeScreen';
import ServiceSelectionScreen from '../screens/ServiceSelectionScreen';
import MatchingScreen from '../screens/MatchingScreen';
import ProfessionalOfferScreen from '../screens/ProfessionalOfferScreen';
import TrackingScreen from '../screens/TrackingScreen';
import LiveRouteScreen from '../screens/LiveRouteScreen';
import ServiceInProgressScreen from '../screens/ServiceInProgressScreen';
import PaymentRatingScreen from '../screens/PaymentRatingScreen';
import ClientTermsReadScreen from '../screens/ClientTermsReadScreen';
import ClientPrivacyReadScreen from '../screens/ClientPrivacyReadScreen';
import ProfessionalStackNavigator, {
  ProfessionalStackParamList,
} from './ProfessionalStackNavigator';
import AdminStackNavigator, { AdminStackParamList } from './AdminStackNavigator';
import { CategoriaId } from '../data/mockProfessionals';

export type MatchingRouteParams = {
  categoriaId: CategoriaId;
  categoriaNombre: string;
  servicioId: string;
  radioKm: 3 | 6;
  rejectionCount: number;
  rejectedIds: string[];
  /** id de la reserva real (BFF); ausente en modo demo. */
  bookingId?: string;
};

export type ProfessionalOfferRouteParams = MatchingRouteParams & {
  professionalId: string;
  distanciaKm: number;
};

export type TrackingRouteParams = {
  professionalId: string;
  servicioId: string;
  categoriaId: CategoriaId;
  distanciaKm: number;
  precioServicio: number;
  precioDomicilio: number;
  precioTotal: number;
  /** id de la reserva real (BFF); ausente en modo demo. */
  bookingId?: string;
};

export type ServiceInProgressRouteParams = TrackingRouteParams;

export type PaymentRatingRouteParams = TrackingRouteParams;

export type RootStackParamList = {
  Login: undefined;
  AccountType: undefined;
  RegisterClient: undefined;
  ClientTermsRead: undefined;
  ClientPrivacyRead: undefined;
  ProfessionalApp: NavigatorScreenParams<ProfessionalStackParamList>;
  AdminApp: NavigatorScreenParams<AdminStackParamList>;
  Home: undefined;
  ServiceSelection: { categoriaId: CategoriaId; categoriaNombre: string };
  Matching: MatchingRouteParams;
  ProfessionalOffer: ProfessionalOfferRouteParams;
  Tracking: TrackingRouteParams;
  LiveRoute: { latitude: number; longitude: number; nombre?: string } | undefined;
  ServiceInProgress: ServiceInProgressRouteParams;
  PaymentRating: PaymentRatingRouteParams;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="AccountType" component={AccountTypeScreen} />
          <Stack.Screen name="RegisterClient" component={RegisterClientScreen} />
          <Stack.Screen name="ClientTermsRead" component={ClientTermsReadScreen} />
          <Stack.Screen name="ClientPrivacyRead" component={ClientPrivacyReadScreen} />
          <Stack.Screen name="ProfessionalApp" component={ProfessionalStackNavigator} />
          <Stack.Screen name="AdminApp" component={AdminStackNavigator} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="ServiceSelection" component={ServiceSelectionScreen} />
          <Stack.Screen name="Matching" component={MatchingScreen} />
          <Stack.Screen name="ProfessionalOffer" component={ProfessionalOfferScreen} />
          <Stack.Screen name="Tracking" component={TrackingScreen} />
          <Stack.Screen name="LiveRoute" component={LiveRouteScreen} />
          <Stack.Screen name="ServiceInProgress" component={ServiceInProgressScreen} />
          <Stack.Screen name="PaymentRating" component={PaymentRatingScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
