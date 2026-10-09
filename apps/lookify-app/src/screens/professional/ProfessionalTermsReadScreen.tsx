import React from 'react';
import LegalDocumentReadScreen from './LegalDocumentReadScreen';
import { TERMS_PROFESSIONAL_SECTIONS } from '../../constants/legal/termsProfessionalContent';
import { TERMS_TITLE, TERMS_VERSION, TERMS_VIGENCIA_LABEL } from '../../constants/legal/termsMeta';

export default function ProfessionalTermsReadScreen() {
  return (
    <LegalDocumentReadScreen
      title={TERMS_TITLE}
      version={TERMS_VERSION}
      vigenciaLabel={TERMS_VIGENCIA_LABEL}
      sections={TERMS_PROFESSIONAL_SECTIONS}
    />
  );
}
