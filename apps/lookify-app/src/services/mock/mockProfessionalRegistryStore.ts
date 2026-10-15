import { EstadoSolicitudProfesional, OnboardingPaso } from '../../types/professionalAuth';
import { TipoDocumentoId } from '../../utils/validators';
import { MOCK_PROFESSIONAL_ACCOUNTS } from './mockProfessionalAccounts';

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
const registeredBySolicitudId = new Map<string, RegisteredProfessionalRecord>();

const serviciosBySolicitudId = new Map<string, string[]>();
const onboardingPasoBySolicitudId = new Map<string, OnboardingPaso>();
const estadoSolicitudBySolicitudId = new Map<string, EstadoSolicitudProfesional>();

/** Demo pro.docs-certificados: servicios sembrados en mapa (no se mutan cuentas semilla). */
export const SOLICITUD_DEMO_DOCS_CERTIFICADOS = 'sol-demo-docs-certificados';
const SERVICIOS_DEMO_DOCS_CERTIFICADOS: string[] = ['pel-1', 'bar-2', 'una-1'];

const seedSolicitudIds = new Set<string>(
  MOCK_PROFESSIONAL_ACCOUNTS.map((a) => a.solicitudId)
);

if (!serviciosBySolicitudId.has(SOLICITUD_DEMO_DOCS_CERTIFICADOS)) {
  serviciosBySolicitudId.set(SOLICITUD_DEMO_DOCS_CERTIFICADOS, [...SERVICIOS_DEMO_DOCS_CERTIFICADOS]);
}

/** Demo aprobados: servicios en mapa (peluquería + maquillaje / barbería). */
const SOLICITUD_DEMO_APROBADO = 'sol-demo-aprobado';
const SOLICITUD_DEMO_APROBADO_NUEVO = 'sol-demo-aprobado-nuevo';
const SERVICIOS_DEMO_APROBADO: string[] = ['pel-1', 'pel-2', 'maq-1'];
const SERVICIOS_DEMO_APROBADO_NUEVO: string[] = ['bar-1', 'bar-2'];

if (!serviciosBySolicitudId.has(SOLICITUD_DEMO_APROBADO)) {
  serviciosBySolicitudId.set(SOLICITUD_DEMO_APROBADO, [...SERVICIOS_DEMO_APROBADO]);
}
if (!serviciosBySolicitudId.has(SOLICITUD_DEMO_APROBADO_NUEVO)) {
  serviciosBySolicitudId.set(SOLICITUD_DEMO_APROBADO_NUEVO, [...SERVICIOS_DEMO_APROBADO_NUEVO]);
}

export interface RechazoSolicitudRecord {
  motivo: string;
  serviciosAfectadosIds: string[];
}

const activadoByProfesionalId = new Map<string, boolean>();
activadoByProfesionalId.set('pro-demo-aprobado', true);

const rechazoBySolicitudId = new Map<string, RechazoSolicitudRecord>();
rechazoBySolicitudId.set('sol-demo-rechazado', {
  motivo:
    'Las fotos del certificado de barbería no son legibles. Sube nuevamente documentos nítidos.',
  serviciosAfectadosIds: ['bar-2'],
});

const avisoCorreccionMotivoBySolicitudId = new Map<string, string>();

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
  registeredBySolicitudId.set(record.solicitudId, record);
  if (record.onboardingPaso !== undefined) {
    onboardingPasoBySolicitudId.set(record.solicitudId, record.onboardingPaso);
  }
}

export function solicitudExiste(solicitudId: string): boolean {
  if (registeredBySolicitudId.has(solicitudId)) return true;
  return seedSolicitudIds.has(solicitudId);
}

export function getOnboardingPasoForSolicitud(solicitudId: string): OnboardingPaso | undefined {
  const override = onboardingPasoBySolicitudId.get(solicitudId);
  if (override !== undefined) return override;
  const registered = registeredBySolicitudId.get(solicitudId);
  if (registered?.onboardingPaso !== undefined) return registered.onboardingPaso;
  const seed = MOCK_PROFESSIONAL_ACCOUNTS.find((a) => a.solicitudId === solicitudId);
  return seed?.onboardingPaso;
}

export function setServiciosForSolicitud(solicitudId: string, servicioIds: string[]): void {
  serviciosBySolicitudId.set(solicitudId, [...servicioIds]);
}

export function getServiciosForSolicitud(solicitudId: string): string[] | undefined {
  const stored = serviciosBySolicitudId.get(solicitudId);
  if (stored !== undefined) return [...stored];
  return undefined;
}

export function getEstadoSolicitudForSolicitud(
  solicitudId: string
): EstadoSolicitudProfesional | undefined {
  const override = estadoSolicitudBySolicitudId.get(solicitudId);
  if (override !== undefined) return override;
  const registered = registeredBySolicitudId.get(solicitudId);
  if (registered) return registered.estadoSolicitud;
  const seed = MOCK_PROFESSIONAL_ACCOUNTS.find((a) => a.solicitudId === solicitudId);
  return seed?.estadoSolicitud;
}

export function setEstadoSolicitudForSolicitud(
  solicitudId: string,
  estado: EstadoSolicitudProfesional
): void {
  estadoSolicitudBySolicitudId.set(solicitudId, estado);
}

export function getProfesionalBasicoBySolicitudId(solicitudId: string):
  | { profesionalId: string; nombre: string; email: string }
  | undefined {
  const registered = registeredBySolicitudId.get(solicitudId);
  if (registered) {
    return {
      profesionalId: registered.profesionalId,
      nombre: registered.nombre,
      email: registered.email,
    };
  }
  const seed = MOCK_PROFESSIONAL_ACCOUNTS.find((a) => a.solicitudId === solicitudId);
  if (!seed) return undefined;
  return {
    profesionalId: seed.profesionalId,
    nombre: seed.nombre,
    email: seed.email,
  };
}

export function setOnboardingPasoForSolicitud(solicitudId: string, paso: OnboardingPaso): void {
  onboardingPasoBySolicitudId.set(solicitudId, paso);
  const registered = registeredBySolicitudId.get(solicitudId);
  if (registered) {
    registeredBySolicitudId.set(solicitudId, { ...registered, onboardingPaso: paso });
  }
}

export function isProfesionalActivado(profesionalId: string): boolean {
  return activadoByProfesionalId.get(profesionalId) === true;
}

export function setProfesionalActivado(profesionalId: string, activado: boolean): void {
  activadoByProfesionalId.set(profesionalId, activado);
}

export function getRechazoForSolicitud(
  solicitudId: string
): RechazoSolicitudRecord | undefined {
  const record = rechazoBySolicitudId.get(solicitudId);
  if (!record) return undefined;
  return {
    motivo: record.motivo,
    serviciosAfectadosIds: [...record.serviciosAfectadosIds],
  };
}

export function setRechazoForSolicitud(
  solicitudId: string,
  record: RechazoSolicitudRecord
): void {
  rechazoBySolicitudId.set(solicitudId, {
    motivo: record.motivo,
    serviciosAfectadosIds: [...record.serviciosAfectadosIds],
  });
}

export function clearRechazoForSolicitud(solicitudId: string): void {
  rechazoBySolicitudId.delete(solicitudId);
}

export function setAvisoCorreccionMotivo(solicitudId: string, motivo: string): void {
  avisoCorreccionMotivoBySolicitudId.set(solicitudId, motivo);
}

export function getAvisoCorreccionMotivo(solicitudId: string): string | undefined {
  return avisoCorreccionMotivoBySolicitudId.get(solicitudId);
}

export function clearAvisoCorreccionMotivo(solicitudId: string): void {
  avisoCorreccionMotivoBySolicitudId.delete(solicitudId);
}
