import React from 'react';
import LegalDocumentReadScreen from './LegalDocumentReadScreen';
import { DATA_POLICY_PROFESSIONAL_SECTIONS } from '../../constants/legal/dataPolicyProfessionalContent';
import {
  DATA_POLICY_TITLE,
  DATA_POLICY_VERSION,
  DATA_POLICY_VIGENCIA_LABEL,
} from '../../constants/legal/dataPolicyMeta';

export default function ProfessionalPrivacyReadScreen() {
  return (
    <LegalDocumentReadScreen
      title={DATA_POLICY_TITLE}
      version={DATA_POLICY_VERSION}
      vigenciaLabel={DATA_POLICY_VIGENCIA_LABEL}
      sections={DATA_POLICY_PROFESSIONAL_SECTIONS}
      showContactPendingDev
    />
  );
}
