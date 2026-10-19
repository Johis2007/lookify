import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfessionalIncomingRequestListener from './ProfessionalIncomingRequestListener';

import ProfessionalLoginScreen from '../screens/professional/ProfessionalLoginScreen';
import RegisterProfessionalScreen from '../screens/RegisterProfessionalScreen';
import ProfessionalTermsReadScreen from '../screens/professional/ProfessionalTermsReadScreen';
import ProfessionalPrivacyReadScreen from '../screens/professional/ProfessionalPrivacyReadScreen';
import ProfessionalDashboardScreen from '../screens/professional/ProfessionalDashboardScreen';
import ProfessionalPortfolioScreen from '../screens/professional/ProfessionalPortfolioScreen';
import ProfessionalVerificationScreen from '../screens/professional/ProfessionalVerificationScreen';
import ProfessionalServiceSelectionScreen from '../screens/professional/ProfessionalServiceSelectionScreen';
import ProfessionalCertificateUploadScreen from '../screens/professional/ProfessionalCertificateUploadScreen';
import { ProfessionalSessionRouteParams } from '../types/professionalAuth';
import { ProfessionalIncomingRequestRouteParams } from '../types/professionalIncomingRequest';
import { ProfessionalServiceInProgressRouteParams } from '../types/professionalServiceInProgress';
import { ProfessionalEarningsHistoryRouteParams } from '../types/professionalEarningsHistory';
import ProfessionalIncomingRequestScreen from '../screens/professional/ProfessionalIncomingRequestScreen';
import ProfessionalServiceInProgressScreen from '../screens/professional/ProfessionalServiceInProgressScreen';
import ProfessionalEarningsHistoryScreen from '../screens/professional/ProfessionalEarningsHistoryScreen';

export type ProfessionalStackParamList = {
  ProfessionalLogin: undefined;
  RegisterProfessional: undefined;
  ProfessionalTermsRead: undefined;
  ProfessionalPrivacyRead: undefined;
  ProfessionalServiceSelection: ProfessionalSessionRouteParams;
  ProfessionalCertificateUploadPlaceholder: ProfessionalSessionRouteParams;
  ProfessionalDashboardPlaceholder: ProfessionalSessionRouteParams;
  ProfessionalPortfolioPlaceholder: ProfessionalSessionRouteParams;
  ProfessionalVerificationPlaceholder: ProfessionalSessionRouteParams;
  ProfessionalIncomingRequest: ProfessionalIncomingRequestRouteParams;
  ProfessionalServiceInProgressPlaceholder: ProfessionalServiceInProgressRouteParams;
  ProfessionalEarningsHistory: ProfessionalEarningsHistoryRouteParams;
};

const Stack = createNativeStackNavigator<ProfessionalStackParamList>();

export default function ProfessionalStackNavigator() {
  return (
    <>
      <ProfessionalIncomingRequestListener />
      <Stack.Navigator initialRouteName="ProfessionalLogin" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfessionalLogin" component={ProfessionalLoginScreen} />
      <Stack.Screen name="RegisterProfessional" component={RegisterProfessionalScreen} />
      <Stack.Screen name="ProfessionalTermsRead" component={ProfessionalTermsReadScreen} />
      <Stack.Screen name="ProfessionalPrivacyRead" component={ProfessionalPrivacyReadScreen} />
      <Stack.Screen
        name="ProfessionalDashboardPlaceholder"
        component={ProfessionalDashboardScreen}
      />
      <Stack.Screen
        name="ProfessionalPortfolioPlaceholder"
        component={ProfessionalPortfolioScreen}
      />
      <Stack.Screen
        name="ProfessionalVerificationPlaceholder"
        component={ProfessionalVerificationScreen}
      />
      <Stack.Screen
        name="ProfessionalServiceSelection"
        component={ProfessionalServiceSelectionScreen}
      />
      <Stack.Screen
        name="ProfessionalCertificateUploadPlaceholder"
        component={ProfessionalCertificateUploadScreen}
      />
      <Stack.Screen
        name="ProfessionalIncomingRequest"
        component={ProfessionalIncomingRequestScreen}
      />
      <Stack.Screen
        name="ProfessionalServiceInProgressPlaceholder"
        component={ProfessionalServiceInProgressScreen}
      />
      <Stack.Screen
        name="ProfessionalEarningsHistory"
        component={ProfessionalEarningsHistoryScreen}
      />
    </Stack.Navigator>
    </>
  );
}
