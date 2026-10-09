import { EstadoSolicitudProfesional, OnboardingPaso } from '../../types/professionalAuth';
import { TipoDocumentoId } from '../../utils/validators';

export interface RegisteredProfessionalRecord {
  profesionalId: string;
  solicitudId: string;
  email: string;
  password: string;
  nombre: string;
  tipoDocumento: TipoDocumentoId;
  numeroDocumento: string;
  estadoSolicitud: EstadoSolicitudProfesional;
  onboardingPaso?: OnboardingPaso;
  verificado: boolean;
  estadoOperativo: 'OCUPADO' | 'DISPONIBLE';
}

const registeredByEmail = new Map<string, RegisteredProfessionalRecord>();
const registeredByDocument = new Map<string, RegisteredProfessionalRecord>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function documentKey(tipo: TipoDocumentoId, numero: string): string {
  return `${tipo}:${numero.trim()}`;
}

export function findRegisteredByEmail(email: string): RegisteredProfessionalRecord | undefined {
  return registeredByEmail.get(normalizeEmail(email));
}

export function isDocumentRegistered(tipo: TipoDocumentoId, numero: string): boolean {
  return registeredByDocument.has(documentKey(tipo, numero));
}

export function registerProfessionalRecord(record: RegisteredProfessionalRecord): void {
  const emailKey = normalizeEmail(record.email);
  registeredByEmail.set(emailKey, record);
  registeredByDocument.set(documentKey(record.tipoDocumento, record.numeroDocumento), record);
}
