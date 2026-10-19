import { LegalSection } from './termsProfessionalContent';

export const TERMS_CLIENT_SECTIONS: LegalSection[] = [
  {
    id: 'naturaleza',
    title: '1. Naturaleza del servicio',
    paragraphs: [
      'Lookify es una plataforma tecnológica que actúa únicamente como intermediario entre clientes (demanda) y profesionales independientes de belleza (oferta).',
      'Lookify no presta los servicios de belleza; conecta a quien solicita un servicio con quien lo ejecuta en el domicilio indicado.',
    ],
  },
  {
    id: 'profesionales',
    title: '2. Profesionales independientes',
    paragraphs: [
      'Lookify revisa documentos y certificados de los profesionales como requisito para acceder a la plataforma, sin que ello implique garantía de idoneidad, calidad ni resultados.',
      'Antes de aceptar una solicitud, el cliente puede consultar calificación, reseñas y portafolio del profesional y decide libremente si contrata el servicio.',
    ],
  },
  {
    id: 'responsabilidad',
    title: '3. Responsabilidad',
    paragraphs: [
      'La ejecución, calidad, seguridad e higiene del servicio son responsabilidad exclusiva del profesional independiente.',
      'Lookify no se hace responsable por daños, perjuicios, lesiones o pérdidas derivados del servicio ni de la conducta de profesionales o clientes, en la medida permitida por la ley, sin perjuicio de los derechos irrenunciables del consumidor.',
    ],
  },
  {
    id: 'obligaciones-cliente',
    title: '4. Obligaciones del cliente',
    paragraphs: [
      'Proporcionar información veraz, especialmente dirección y datos de contacto, y estar disponible en el lugar acordado.',
      'Tratar con respeto al profesional y ofrecer un entorno seguro y adecuado para la prestación del servicio.',
      'No compartir con terceros el PIN de inicio del servicio; este código autoriza el inicio de la prestación.',
    ],
  },
  {
    id: 'precio',
    title: '5. Precio y pago',
    paragraphs: [
      'El precio se muestra desglosado (valor del servicio y domicilio) antes de que el cliente acepte la oferta del profesional.',
      'Las condiciones de pago disponibles en la app se informan en el momento de cerrar el servicio.',
    ],
  },
  {
    id: 'cancelacion',
    title: '6. Cancelación',
    paragraphs: [
      'El cliente puede rechazar la oferta de un profesional o cancelar la solicitud sin costo antes de que el servicio inicie (según las reglas mostradas en la app).',
      'Una vez iniciado el servicio, no se permite cancelar la solicitud en curso.',
      'Lookify puede suspender cuentas por uso abusivo, incluidas cancelaciones repetidas o conductas que afecten a la comunidad.',
    ],
  },
  {
    id: 'calificaciones',
    title: '7. Calificaciones',
    paragraphs: [
      'Las calificaciones y comentarios deben ser honestos y basados en la experiencia real del servicio.',
      'Lookify puede moderar o retirar contenido que vulnere estas reglas o la ley.',
    ],
  },
  {
    id: 'datos',
    title: '8. Datos personales',
    paragraphs: [
      'El tratamiento de datos personales se realiza conforme a la Ley 1581 de 2012 y normas complementarias.',
      'En la Política de Tratamiento de Datos Personales se indican las finalidades del tratamiento y los derechos del titular (conocer, actualizar, rectificar y suprimir, entre otros).',
    ],
  },
  {
    id: 'suspension',
    title: '9. Suspensión, modificaciones y ley aplicable',
    paragraphs: [
      'Lookify puede suspender o cerrar cuentas por incumplimiento de estos términos.',
      'Estos términos pueden modificarse; los cambios relevantes se comunicarán con aviso razonable.',
      'Se rigen por la ley de la República de Colombia.',
    ],
  },
];
