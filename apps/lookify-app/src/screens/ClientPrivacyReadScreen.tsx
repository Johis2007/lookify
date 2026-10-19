import React from 'react';
import LegalDocumentReadScreen from './professional/LegalDocumentReadScreen';
import { DATA_POLICY_CLIENT_SECTIONS } from '../constants/legal/dataPolicyClientContent';
import {
  CLIENT_DATA_POLICY_TITLE,
  CLIENT_DATA_POLICY_VERSION,
  CLIENT_DATA_POLICY_VIGENCIA_LABEL,
} from '../constants/legal/dataPolicyClientMeta';

export default function ClientPrivacyReadScreen() {
  return (
    <LegalDocumentReadScreen
      title={CLIENT_DATA_POLICY_TITLE}
      version={CLIENT_DATA_POLICY_VERSION}
      vigenciaLabel={CLIENT_DATA_POLICY_VIGENCIA_LABEL}
      sections={DATA_POLICY_CLIENT_SECTIONS}
      showContactPendingDev
    />
  );
}
