import React from 'react';
import LegalDocumentReadScreen from './professional/LegalDocumentReadScreen';
import { TERMS_CLIENT_SECTIONS } from '../constants/legal/termsClientContent';
import {
  CLIENT_TERMS_TITLE,
  CLIENT_TERMS_VERSION,
  CLIENT_TERMS_VIGENCIA_LABEL,
} from '../constants/legal/termsClientMeta';

export default function ClientTermsReadScreen() {
  return (
    <LegalDocumentReadScreen
      title={CLIENT_TERMS_TITLE}
      version={CLIENT_TERMS_VERSION}
      vigenciaLabel={CLIENT_TERMS_VIGENCIA_LABEL}
      sections={TERMS_CLIENT_SECTIONS}
    />
  );
}
