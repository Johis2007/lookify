import {
  AgregarCertificadoRequest,
  ActualizarCertificadoRequest,
  CertificadoFormPayload,
  CertificadoProfesional,
  EliminarCertificadoRequest,
  EnviarSolicitudVerificacionRequest,
  EnviarSolicitudVerificacionResponse,
  ListarCertificadosRequest,
  ObtenerServiciosDeSolicitudRequest,
  ObtenerServiciosDeSolicitudResponse,
} from '../../types/professionalCertificates';
import {
  CERTIFICADO_MAX_BYTES,
  CERTIFICADO_MAX_POR_SERVICIO,
} from '../../constants/certificateUpload';
import { esMimeCertificadoPermitido } from '../../utils/certificateFile';
import {
  coberturaCompleta,
  contarCertificadosPorServicio,
  serviciosSinCubrir,
} from '../../utils/certificateCoverage';
import { esServicioIdValido } from './catalogServicioIds';
import {
  clearAvisoCorreccionMotivo,
  clearRechazoForSolicitud,
  getProfesionalBasicoBySolicitudId,
  getServiciosForSolicitud,
  setEstadoSolicitudForSolicitud,
  solicitudExiste,
} from './mockProfessionalRegistryStore';
import { clearActivacionForSolicitud } from './mockProfessionalActivationStore';
import { ServiceError } from '../errors';
import { ProfessionalCertificateService } from '../professionalCertificateService';
import {
  certificadoFormularioValido,
  validarEntidadEmisoraCertificado,
  validarNombreTipoCertificado,
} from '../../utils/validators';

const MOCK_CERT_LATENCY_MS = 450;

const certificadosBySolicitudId = new Map<string, CertificadoProfesional[]>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateCertId(): string {
  return `cert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mockContarCertificados(solicitudId: string): number {
  return getLista(solicitudId).length;
}

function getLista(solicitudId: string): CertificadoProfesional[] {
  if (!certificadosBySolicitudId.has(solicitudId)) {
    certificadosBySolicitudId.set(solicitudId, []);
  }
  return certificadosBySolicitudId.get(solicitudId)!;
}

function assertServiciosElegidos(solicitudId: string): string[] {
  const servicios = getServiciosForSolicitud(solicitudId);
  if (!servicios || servicios.length === 0) {
    throw new ServiceError('VALIDATION');
  }
  return servicios;
}

function validarArchivo(archivo: CertificadoFormPayload['archivo']): void {
  if (!esMimeCertificadoPermitido(archivo.mimeType)) {
    throw new ServiceError('ARCHIVO_INVALIDO');
  }
  if (!archivo.uri || !archivo.fileName.trim()) {
    throw new ServiceError('ARCHIVO_INVALIDO');
  }
  if (!Number.isFinite(archivo.sizeBytes) || archivo.sizeBytes <= 0) {
    throw new ServiceError('ARCHIVO_INVALIDO');
  }
  if (archivo.sizeBytes > CERTIFICADO_MAX_BYTES) {
    throw new ServiceError('ARCHIVO_MUY_GRANDE');
  }
}

function validarServiciosCertificado(
  solicitudId: string,
  servicioIds: string[],
  certificados: CertificadoProfesional[],
  excluirCertificadoId?: string
): void {
  const elegidos = assertServiciosElegidos(solicitudId);
  const unique = [...new Set(servicioIds)];
  if (unique.length === 0) {
    throw new ServiceError('VALIDATION');
  }
  if (unique.some((id) => !elegidos.includes(id) || !esServicioIdValido(id))) {
    throw new ServiceError('SERVICIO_INVALIDO');
  }

  const counts = contarCertificadosPorServicio(certificados, elegidos, excluirCertificadoId);
  for (const sid of unique) {
    const next = (counts[sid] ?? 0) + 1;
    if (next > CERTIFICADO_MAX_POR_SERVICIO) {
      throw new ServiceError('LIMITE_CERTIFICADOS_SERVICIO');
    }
  }
}

function validarMetadatos(certificado: CertificadoFormPayload): void {
  if (validarNombreTipoCertificado(certificado.nombreTipo) !== null) {
    throw new ServiceError('VALIDATION');
  }
  if (validarEntidadEmisoraCertificado(certificado.entidadEmisora) !== null) {
    throw new ServiceError('VALIDATION');
  }
  if (
    !certificadoFormularioValido(
      certificado.nombreTipo,
      certificado.entidadEmisora,
      certificado.fechaEmision
        ? new Date(`${certificado.fechaEmision}T12:00:00`)
        : null,
      certificado.servicioIds,
      true
    )
  ) {
    throw new ServiceError('VALIDATION');
  }
}

function toStored(
  solicitudId: string,
  payload: CertificadoFormPayload,
  id: string
): CertificadoProfesional {
  const base: CertificadoProfesional = {
    id,
    solicitudId,
    nombreTipo: payload.nombreTipo.trim(),
    entidadEmisora: payload.entidadEmisora.trim(),
    servicioIds: [...new Set(payload.servicioIds)],
    archivo: { ...payload.archivo },
  };
  if (payload.fechaEmision) {
    base.fechaEmision = payload.fechaEmision;
  }
  return base;
}

export function createMockProfessionalCertificateService(): ProfessionalCertificateService {
  return {
    async obtenerServiciosDeSolicitud(
      input: ObtenerServiciosDeSolicitudRequest
    ): Promise<ObtenerServiciosDeSolicitudResponse> {
      await delay(MOCK_CERT_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const servicioIds = assertServiciosElegidos(input.solicitudId);
      return { servicioIds };
    },

    async listarCertificados(input: ListarCertificadosRequest): Promise<CertificadoProfesional[]> {
      await delay(MOCK_CERT_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      return getLista(input.solicitudId).map((c) => ({
        ...c,
        servicioIds: [...c.servicioIds],
        archivo: { ...c.archivo },
      }));
    },

    async agregarCertificado(input: AgregarCertificadoRequest): Promise<CertificadoProfesional> {
      await delay(MOCK_CERT_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const lista = getLista(input.solicitudId);
      validarArchivo(input.certificado.archivo);
      validarMetadatos(input.certificado);
      validarServiciosCertificado(
        input.solicitudId,
        input.certificado.servicioIds,
        lista
      );
      const cert = toStored(input.solicitudId, input.certificado, generateCertId());
      lista.push(cert);
      return { ...cert, servicioIds: [...cert.servicioIds], archivo: { ...cert.archivo } };
    },

    async actualizarCertificado(input: ActualizarCertificadoRequest): Promise<CertificadoProfesional> {
      await delay(MOCK_CERT_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const lista = getLista(input.solicitudId);
      const idx = lista.findIndex((c) => c.id === input.certificadoId);
      if (idx === -1) {
        throw new ServiceError('CERTIFICADO_NO_ENCONTRADO');
      }
      validarArchivo(input.certificado.archivo);
      validarMetadatos(input.certificado);
      validarServiciosCertificado(
        input.solicitudId,
        input.certificado.servicioIds,
        lista,
        input.certificadoId
      );
      const cert = toStored(input.solicitudId, input.certificado, input.certificadoId);
      lista[idx] = cert;
      return { ...cert, servicioIds: [...cert.servicioIds], archivo: { ...cert.archivo } };
    },

    async eliminarCertificado(input: EliminarCertificadoRequest): Promise<void> {
      await delay(MOCK_CERT_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const lista = getLista(input.solicitudId);
      const next = lista.filter((c) => c.id !== input.certificadoId);
      if (next.length === lista.length) {
        throw new ServiceError('CERTIFICADO_NO_ENCONTRADO');
      }
      certificadosBySolicitudId.set(input.solicitudId, next);
    },

    async enviarSolicitudVerificacion(
      input: EnviarSolicitudVerificacionRequest
    ): Promise<EnviarSolicitudVerificacionResponse> {
      await delay(MOCK_CERT_LATENCY_MS);
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const elegidos = assertServiciosElegidos(input.solicitudId);
      const lista = getLista(input.solicitudId);
      const counts = contarCertificadosPorServicio(lista, elegidos);
      const faltantes = serviciosSinCubrir(counts);
      if (faltantes.length > 0 || !coberturaCompleta(counts)) {
        throw new ServiceError('SERVICIO_SIN_CERTIFICADO');
      }
      clearRechazoForSolicitud(input.solicitudId);
      clearAvisoCorreccionMotivo(input.solicitudId);
      clearActivacionForSolicitud(input.solicitudId);
      setEstadoSolicitudForSolicitud(input.solicitudId, 'EN_REVISION');
      const basico = getProfesionalBasicoBySolicitudId(input.solicitudId);
      if (!basico) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      return {
        solicitudId: input.solicitudId,
        estadoSolicitud: 'EN_REVISION',
        profesionalId: basico.profesionalId,
        nombre: basico.nombre,
        email: basico.email,
        onboardingPaso: 'CERTIFICADOS',
      };
    },
  };
}
