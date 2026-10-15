import {
  ACTIVACION_CODE_LENGTH,
  ACTIVACION_MAX_REENVIOS,
} from '../../constants/professionalActivation';
import {
  EstadoActivacionUi,
  EstadoVerificacionResponse,
  IniciarCorreccionCertificadosRequest,
  IniciarCorreccionCertificadosResponse,
  ObtenerAvisoCorreccionRequest,
  ObtenerAvisoCorreccionResponse,
  ObtenerEstadoVerificacionRequest,
  ReenviarCodigoActivacionRequest,
  ReenviarCodigoActivacionResponse,
  SimularDecisionAdministradorRequest,
  ValidarCodigoActivacionRequest,
  ValidarCodigoActivacionResponse,
} from '../../types/professionalVerification';
import { maskEmail } from '../../utils/maskEmail';
import { ServiceError } from '../errors';
import { ProfessionalVerificationService } from '../professionalVerificationService';
import { mockContarCertificados } from './mockProfessionalCertificateService';
import {
  ActivacionMemoria,
  calcularReenvioDisponibleEnMs,
  clearActivacionForSolicitud,
  crearPrimerCodigoActivacion,
  evaluarBloqueoIntentos,
  expirarCodigoActivacionDemo,
  getActivacionForSolicitud,
  mutarActivacion,
  reemitirCodigoActivacion,
  registrarIntentoFallido,
  reenviosRestantes,
} from './mockProfessionalActivationStore';
import {
  clearRechazoForSolicitud,
  getAvisoCorreccionMotivo,
  getEstadoSolicitudForSolicitud,
  getProfesionalBasicoBySolicitudId,
  getRechazoForSolicitud,
  getServiciosForSolicitud,
  isProfesionalActivado,
  setAvisoCorreccionMotivo,
  setEstadoSolicitudForSolicitud,
  setOnboardingPasoForSolicitud,
  setProfesionalActivado,
  setRechazoForSolicitud,
  solicitudExiste,
} from './mockProfessionalRegistryStore';

const MOCK_LATENCY_MS = 450;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs(): number {
  return Date.now();
}

function buildActivacionUi(activacion: ActivacionMemoria, now: number): EstadoActivacionUi {
  const evaluada = evaluarBloqueoIntentos(activacion, now);
  const codigoExpirado = now >= evaluada.expiraEnMs;
  const reenviosRest = reenviosRestantes(evaluada);
  const sinSalidaActivacion = codigoExpirado && reenviosRest <= 0;
  return {
    codigoExpirado,
    bloqueadoHastaMs:
      evaluada.bloqueadoHastaMs != null && now < evaluada.bloqueadoHastaMs
        ? evaluada.bloqueadoHastaMs
        : null,
    reenvioDisponibleEnMs: calcularReenvioDisponibleEnMs(evaluada, now),
    reenviosRestantes: reenviosRest,
    sinSalidaActivacion,
  };
}

function ensureActivacionAprobadoPendiente(solicitudId: string, now: number): ActivacionMemoria {
  let activacion = getActivacionForSolicitud(solicitudId);
  if (!activacion) {
    // Simula el correo de aprobación del servidor en la primera consulta de estado.
    activacion = crearPrimerCodigoActivacion(solicitudId, now);
  }
  return activacion;
}

async function buildEstadoResponse(solicitudId: string): Promise<EstadoVerificacionResponse> {
  const basico = getProfesionalBasicoBySolicitudId(solicitudId);
  if (!basico) {
    throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
  }
  const estado = getEstadoSolicitudForSolicitud(solicitudId);
  if (!estado) {
    throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
  }
  const activado = isProfesionalActivado(basico.profesionalId);
  const now = nowMs();
  const servicioIds = getServiciosForSolicitud(solicitudId) ?? [];
  const resumen =
    servicioIds.length > 0 || mockContarCertificados(solicitudId) > 0
      ? {
          cantidadCertificados: mockContarCertificados(solicitudId),
          cantidadServicios: servicioIds.length,
          servicioIds,
        }
      : undefined;

  const response: EstadoVerificacionResponse = {
    solicitudId,
    profesionalId: basico.profesionalId,
    nombre: basico.nombre,
    estadoSolicitud: estado,
    profesionalActivado: activado,
    emailEnmascarado: maskEmail(basico.email),
    resumen,
  };

  if (estado === 'RECHAZADO') {
    const rechazo = getRechazoForSolicitud(solicitudId);
    if (rechazo) {
      response.rechazo = {
        motivo: rechazo.motivo,
        serviciosAfectadosIds: [...rechazo.serviciosAfectadosIds],
      };
    }
  }

  if (estado === 'APROBADO' && !activado) {
    const activacion = ensureActivacionAprobadoPendiente(solicitudId, now);
    response.activacion = buildActivacionUi(activacion, now);
    if (__DEV__) {
      response.codigoActivacionDemo = activacion.codigo;
    }
  }

  return response;
}

export function createMockProfessionalVerificationService(): ProfessionalVerificationService {
  return {
    async obtenerEstadoVerificacion(
      input: ObtenerEstadoVerificacionRequest
    ): Promise<EstadoVerificacionResponse> {
      await delay(MOCK_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      return buildEstadoResponse(input.solicitudId);
    },

    async actualizarEstadoVerificacion(
      input: ObtenerEstadoVerificacionRequest
    ): Promise<EstadoVerificacionResponse> {
      return this.obtenerEstadoVerificacion(input);
    },

    async iniciarCorreccionCertificados(
      input: IniciarCorreccionCertificadosRequest
    ): Promise<IniciarCorreccionCertificadosResponse> {
      await delay(MOCK_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const estado = getEstadoSolicitudForSolicitud(input.solicitudId);
      if (estado !== 'RECHAZADO') {
        throw new ServiceError('VALIDATION');
      }
      const rechazo = getRechazoForSolicitud(input.solicitudId);
      if (rechazo) {
        setAvisoCorreccionMotivo(input.solicitudId, rechazo.motivo);
      }
      clearRechazoForSolicitud(input.solicitudId);
      setEstadoSolicitudForSolicitud(input.solicitudId, 'DOCUMENTOS_PENDIENTES');
      setOnboardingPasoForSolicitud(input.solicitudId, 'CERTIFICADOS');
      const basico = getProfesionalBasicoBySolicitudId(input.solicitudId);
      const servicioIds = getServiciosForSolicitud(input.solicitudId);
      if (!basico || !servicioIds?.length) {
        throw new ServiceError('VALIDATION');
      }
      return {
        profesionalId: basico.profesionalId,
        solicitudId: input.solicitudId,
        nombre: basico.nombre,
        email: basico.email,
        estadoSolicitud: 'DOCUMENTOS_PENDIENTES',
        onboardingPaso: 'CERTIFICADOS',
        servicioIds,
      };
    },

    async reenviarCodigoActivacion(
      input: ReenviarCodigoActivacionRequest
    ): Promise<ReenviarCodigoActivacionResponse> {
      await delay(MOCK_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const estado = getEstadoSolicitudForSolicitud(input.solicitudId);
      const basico = getProfesionalBasicoBySolicitudId(input.solicitudId);
      if (!basico || estado !== 'APROBADO' || isProfesionalActivado(basico.profesionalId)) {
        throw new ServiceError('VALIDATION');
      }
      const now = nowMs();
      const activacion = getActivacionForSolicitud(input.solicitudId);
      if (!activacion) {
        throw new ServiceError('VALIDATION');
      }
      let activacionViva = activacion;
      activacionViva = evaluarBloqueoIntentos(activacionViva, now);
      if (activacionViva.bloqueadoHastaMs != null && now < activacionViva.bloqueadoHastaMs) {
        throw new ServiceError('BLOQUEO_TEMPORAL');
      }
      const disponibleEn = calcularReenvioDisponibleEnMs(activacionViva, now);
      if (disponibleEn != null) {
        throw new ServiceError('REENVIO_NO_DISPONIBLE');
      }
      if (activacionViva.reenviosUsados >= ACTIVACION_MAX_REENVIOS) {
        throw new ServiceError('REENVIOS_AGOTADOS');
      }
      const next = reemitirCodigoActivacion(input.solicitudId, now);
      const response: ReenviarCodigoActivacionResponse = {
        emailEnmascarado: maskEmail(basico.email),
        reenvioDisponibleEnMs: calcularReenvioDisponibleEnMs(next, now),
        reenviosRestantes: reenviosRestantes(next),
      };
      if (__DEV__) {
        response.codigoActivacionDemo = next.codigo;
      }
      return response;
    },

    async validarCodigoActivacion(
      input: ValidarCodigoActivacionRequest
    ): Promise<ValidarCodigoActivacionResponse> {
      await delay(MOCK_LATENCY_MS);
      const codigo = input.codigo.trim();
      if (codigo.length !== ACTIVACION_CODE_LENGTH || !/^\d+$/.test(codigo)) {
        throw new ServiceError('CODIGO_INVALIDO');
      }
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('CODIGO_INVALIDO');
      }
      const basico = getProfesionalBasicoBySolicitudId(input.solicitudId);
      const estado = getEstadoSolicitudForSolicitud(input.solicitudId);
      if (!basico || estado !== 'APROBADO' || isProfesionalActivado(basico.profesionalId)) {
        throw new ServiceError('CODIGO_INVALIDO');
      }
      const now = nowMs();
      let activacion = getActivacionForSolicitud(input.solicitudId);
      if (!activacion) {
        throw new ServiceError('CODIGO_INVALIDO');
      }
      activacion = evaluarBloqueoIntentos(activacion, now);
      if (activacion.bloqueadoHastaMs != null && now < activacion.bloqueadoHastaMs) {
        throw new ServiceError('BLOQUEO_TEMPORAL');
      }
      if (now >= activacion.expiraEnMs) {
        throw new ServiceError('CODIGO_EXPIRADO');
      }
      if (activacion.codigo !== codigo) {
        const updated = mutarActivacion(input.solicitudId, (prev) =>
          registrarIntentoFallido(prev, now)
        );
        if (updated && updated.bloqueadoHastaMs != null && now < updated.bloqueadoHastaMs) {
          throw new ServiceError('DEMASIADOS_INTENTOS');
        }
        throw new ServiceError('CODIGO_INVALIDO');
      }
      setProfesionalActivado(basico.profesionalId, true);
      clearActivacionForSolicitud(input.solicitudId);
      return {
        profesionalId: basico.profesionalId,
        solicitudId: input.solicitudId,
        nombre: basico.nombre,
        email: basico.email,
        estadoSolicitud: 'APROBADO',
        profesionalActivado: true,
      };
    },

    async obtenerAvisoCorreccion(
      input: ObtenerAvisoCorreccionRequest
    ): Promise<ObtenerAvisoCorreccionResponse> {
      await delay(MOCK_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      return { motivoRechazo: getAvisoCorreccionMotivo(input.solicitudId) ?? null };
    },

    async simularDecisionAdministrador(
      input: SimularDecisionAdministradorRequest
    ): Promise<EstadoVerificacionResponse> {
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      await delay(MOCK_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const now = nowMs();
      if (input.decision === 'APROBAR') {
        clearRechazoForSolicitud(input.solicitudId);
        setEstadoSolicitudForSolicitud(input.solicitudId, 'APROBADO');
        crearPrimerCodigoActivacion(input.solicitudId, now);
      } else {
        const motivo = input.motivoRechazo?.trim() || 'Documentación incompleta o no válida.';
        setRechazoForSolicitud(input.solicitudId, {
          motivo,
          serviciosAfectadosIds: input.serviciosAfectadosIds ?? [],
        });
        setEstadoSolicitudForSolicitud(input.solicitudId, 'RECHAZADO');
        clearActivacionForSolicitud(input.solicitudId);
      }
      return buildEstadoResponse(input.solicitudId);
    },

    async expirarCodigoActivacionDemo(
      input: ObtenerEstadoVerificacionRequest
    ): Promise<EstadoVerificacionResponse> {
      if (!__DEV__) {
        throw new ServiceError('OPERACION_NO_PERMITIDA');
      }
      await delay(MOCK_LATENCY_MS);
      expirarCodigoActivacionDemo(input.solicitudId, nowMs());
      return buildEstadoResponse(input.solicitudId);
    },
  };
}
