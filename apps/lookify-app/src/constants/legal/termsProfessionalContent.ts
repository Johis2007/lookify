export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
}

export const TERMS_PROFESSIONAL_SECTIONS: LegalSection[] = [
  {
    id: 'naturaleza',
    title: '1. Naturaleza del servicio',
    paragraphs: [
      'Lookify es una plataforma tecnológica que actúa únicamente como intermediario entre clientes (demanda) y profesionales de belleza (oferta).',
      'Lookify no presta servicios de belleza, no emplea a los profesionales ni actúa como su agente, representante o socio.',
    ],
  },
  {
    id: 'independencia',
    title: '2. Independencia del profesional',
    paragraphs: [
      'El profesional presta sus servicios por cuenta propia, sin relación laboral, de subordinación ni de agencia con Lookify.',
      'Es responsable de sus obligaciones tributarias, de seguridad social, permisos, insumos, herramientas y de cumplir la normativa aplicable a su actividad.',
    ],
  },
  {
    id: 'responsabilidad',
    title: '3. Responsabilidad por el servicio',
    paragraphs: [
      'El profesional es el único responsable de la calidad, ejecución, seguridad e higiene del servicio prestado al cliente, así como de los daños que cause con ocasión de la prestación.',
      'Lookify no se hace responsable por daños, perjuicios, lesiones o pérdidas derivados de la prestación del servicio ni de la conducta de profesionales o clientes, en la medida permitida por la ley colombiana.',
    ],
  },
  {
    id: 'verificacion',
    title: '4. Verificación documental',
    paragraphs: [
      'Lookify puede revisar documentos y certificados como requisito para acceder a la plataforma.',
      'Esa revisión no constituye garantía de idoneidad, calidad, resultados ni ausencia de riesgos en la prestación del servicio.',
    ],
  },
  {
    id: 'veracidad',
    title: '5. Veracidad de la información',
    paragraphs: [
      'El profesional garantiza la veracidad de los datos y documentos que suministra.',
      'La falsedad, omisión relevante o uso indebido de documentos puede dar lugar a suspensión o terminación de la cuenta.',
    ],
  },
  {
    id: 'comision',
    title: '6. Comisión y precios',
    paragraphs: [
      'Lookify cobra una comisión sobre el valor del servicio, vigente al momento de cada solicitud e informada en la plataforma.',
      'El profesional puede ajustar el precio del servicio dentro de los límites que establezca Lookify para su categoría.',
    ],
  },
  {
    id: 'datos',
    title: '7. Datos personales',
    paragraphs: [
      'El tratamiento de datos personales se realiza conforme a la Ley 1581 de 2012 y normas complementarias.',
      'En la Política de Tratamiento de Datos Personales se describen las finalidades del tratamiento y los derechos del titular (conocer, actualizar, rectificar y suprimir, entre otros).',
    ],
  },
  {
    id: 'suspension',
    title: '8. Suspensión, terminación y modificaciones',
    paragraphs: [
      'Lookify puede suspender o terminar cuentas por incumplimiento de estos términos, fraude o riesgo para la comunidad, con los procedimientos que indique la plataforma.',
      'Lookify puede modificar estos términos; los cambios relevantes se comunicarán con antelación razonable por medios electrónicos.',
      'Estos términos se rigen por la ley de la República de Colombia.',
    ],
  },
];
