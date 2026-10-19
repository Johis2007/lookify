import { LegalSection } from './termsProfessionalContent';

/** Contacto de relleno; sustituir antes del lanzamiento (ver PROGRESS.md). */
export const DATA_POLICY_CONTACT_PLACEHOLDER = {
  razonSocial: '[PENDIENTE — razón social]',
  nit: '[PENDIENTE — NIT]',
  domicilio: '[PENDIENTE — domicilio]',
  email: '[PENDIENTE — correo solicitudes datos personales]',
};

export const DATA_POLICY_PROFESSIONAL_SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Responsable del tratamiento',
    paragraphs: [
      `Razón social: ${DATA_POLICY_CONTACT_PLACEHOLDER.razonSocial}`,
      `NIT: ${DATA_POLICY_CONTACT_PLACEHOLDER.nit}`,
      `Domicilio: ${DATA_POLICY_CONTACT_PLACEHOLDER.domicilio}`,
      `Correo para ejercer derechos: ${DATA_POLICY_CONTACT_PLACEHOLDER.email}`,
    ],
  },
  {
    id: 'finalidades',
    title: 'Finalidades',
    paragraphs: [
      'Gestionar el registro, verificación y acceso del profesional a la plataforma Lookify.',
      'Permitir la intermediación con clientes, el cumplimiento de solicitudes de servicio, pagos y soporte.',
      'Cumplir obligaciones legales, prevenir fraude y mejorar la seguridad de la plataforma.',
    ],
  },
  {
    id: 'derechos',
    title: 'Derechos del titular (Ley 1581 de 2012)',
    paragraphs: [
      'Conocer, actualizar y rectificar sus datos personales.',
      'Solicitar prueba de la autorización otorgada y revocarla cuando proceda.',
      'Solicitar la supresión de datos cuando no exista deber legal o contractual de conservarlos.',
      'Presentar consultas y reclamos ante el responsable del tratamiento.',
    ],
  },
  {
    id: 'autorizacion',
    title: 'Autorización',
    paragraphs: [
      'Al registrarse, el profesional autoriza el tratamiento de sus datos para las finalidades descritas, en los términos de esta política y de la ley vigente.',
    ],
  },
];
