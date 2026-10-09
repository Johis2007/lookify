import { LegalSection } from './termsProfessionalContent';

export const DATA_POLICY_CLIENT_CONTACT_PLACEHOLDER = {
  razonSocial: '[PENDIENTE — razón social]',
  nit: '[PENDIENTE — NIT]',
  domicilio: '[PENDIENTE — domicilio]',
  email: '[PENDIENTE — correo solicitudes datos personales]',
};

export const DATA_POLICY_CLIENT_SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Responsable del tratamiento',
    paragraphs: [
      `Razón social: ${DATA_POLICY_CLIENT_CONTACT_PLACEHOLDER.razonSocial}`,
      `NIT: ${DATA_POLICY_CLIENT_CONTACT_PLACEHOLDER.nit}`,
      `Domicilio: ${DATA_POLICY_CLIENT_CONTACT_PLACEHOLDER.domicilio}`,
      `Correo para ejercer derechos: ${DATA_POLICY_CLIENT_CONTACT_PLACEHOLDER.email}`,
    ],
  },
  {
    id: 'finalidades',
    title: 'Finalidades',
    paragraphs: [
      'Crear y administrar la cuenta del cliente y permitir el uso de la plataforma Lookify.',
      'Gestionar solicitudes de servicios, ubicación de prestación, comunicación con profesionales y soporte.',
      'Procesar pagos simulados o reales, calificaciones y prevención de fraude, conforme evolucione el producto.',
      'Cumplir obligaciones legales y mejorar la seguridad del servicio.',
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
];
