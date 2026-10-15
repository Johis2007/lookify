import { DIRECCION_EXACTA_DEMO } from '../../constants/professionalServiceInProgress';
import {
  CrearServicioEnCursoInput,
  esEtapaServicioActiva,
  ServicioEnCurso,
} from '../../types/professionalServiceInProgress';
import { generarPinServicioMock } from '../../utils/mockServicePin';

type RegistroServicioEnCurso = {
  servicio: ServicioEnCurso;
  pin: string;
};

const porProfesional = new Map<string, RegistroServicioEnCurso>();

function copiarDesglose(servicio: ServicioEnCurso): ServicioEnCurso['desglose'] {
  return { ...servicio.desglose };
}

function copiarServicio(servicio: ServicioEnCurso): ServicioEnCurso {
  return { ...servicio, desglose: copiarDesglose(servicio) };
}

function copiarRegistro(reg: RegistroServicioEnCurso): RegistroServicioEnCurso {
  return { pin: reg.pin, servicio: copiarServicio(reg.servicio) };
}

function guardar(profesionalId: string, reg: RegistroServicioEnCurso): RegistroServicioEnCurso {
  const copia = copiarRegistro(reg);
  porProfesional.set(profesionalId, copia);
  return copiarRegistro(copia);
}

export function crearServicioEnCursoDesdeAceptacion(input: CrearServicioEnCursoInput): void {
  const previo = porProfesional.get(input.profesionalId);
  if (previo && esEtapaServicioActiva(previo.servicio.etapa)) {
    return;
  }
  const servicio: ServicioEnCurso = {
    id: input.solicitudEntranteId,
    profesionalId: input.profesionalId,
    etapa: 'EN_CAMINO',
    servicioId: input.servicioId,
    servicioNombre: input.servicioNombre,
    duracionMin: input.duracionMin,
    clientePrimerNombre: input.clientePrimerNombre,
    direccionExacta: DIRECCION_EXACTA_DEMO,
    desglose: { ...input.desglose },
    llegadaEn: null,
    iniciadoEn: null,
    finalizadoEn: null,
    canceladoEn: null,
    intentosFallidosPin: 0,
    bloqueadoHasta: null,
    motivoCancelacion: null,
  };
  guardar(input.profesionalId, { servicio, pin: generarPinServicioMock() });
}

/** Aplica el fin del bloqueo y devuelve una copia. El PIN queda en el registro, no en el servicio. */
export function leerRegistroServicioEnCurso(
  profesionalId: string,
  now: number
): RegistroServicioEnCurso | null {
  const reg = porProfesional.get(profesionalId);
  if (!reg) {
    return null;
  }
  if (reg.servicio.bloqueadoHasta != null && now >= reg.servicio.bloqueadoHasta) {
    const liberado = guardar(profesionalId, {
      pin: reg.pin,
      servicio: {
        ...copiarServicio(reg.servicio),
        bloqueadoHasta: null,
        intentosFallidosPin: 0,
      },
    });
    return liberado;
  }
  return copiarRegistro(reg);
}

export function guardarServicioEnCurso(
  profesionalId: string,
  servicio: ServicioEnCurso
): RegistroServicioEnCurso | null {
  const reg = porProfesional.get(profesionalId);
  if (!reg || reg.servicio.id !== servicio.id) {
    return null;
  }
  return guardar(profesionalId, { pin: reg.pin, servicio });
}

export function hayServicioEnCursoActivo(profesionalId: string, now: number): boolean {
  const reg = leerRegistroServicioEnCurso(profesionalId, now);
  return reg != null && esEtapaServicioActiva(reg.servicio.etapa);
}
