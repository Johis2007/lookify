// src/services/backend/backendProfessionalCertificateService.ts
// Certificados reales: professional_documents + /files. Los metadatos que
// Directus no tiene (nombreTipo, entidad, fechaEmisión, servicioIds) viajan
// en `note` como JSON versionado (ver docs/adaptacion-backend.md).

import {
  ProfessionalCertificateService,
} from '../professionalCertificateService';
import {
  ActualizarCertificadoRequest,
  AgregarCertificadoRequest,
  CertificadoArchivoDescriptor,
  CertificadoFormPayload,
  CertificadoProfesional,
  EliminarCertificadoRequest,
  EnviarSolicitudVerificacionRequest,
  EnviarSolicitudVerificacionResponse,
  ObtenerServiciosDeSolicitudRequest,
  ObtenerServiciosDeSolicitudResponse,
} from '../../types/professionalCertificates';
import { ServiceError } from '../errors';
import { api, assetUrl, uploadFile } from '../../lib/backend/directus';
import { bffApi } from '../../lib/backend/bff';
import {
  backendSolicitudId,
  loadBackendSession,
  resolveProfessionalId,
} from '../../lib/backend/session';
import { CERTIFICADO_MAX_POR_SERVICIO } from '../../constants/certificateUpload';
import { esMimeCertificadoPermitido, resolverSizeBytes, validarTamanoCertificado } from '../../utils/certificateFile';

const NOTE_PREFIX = 'LOOKIFY-CERT:v1 ';

type CertMeta = {
  nombreTipo: string;
  entidadEmisora: string;
  fechaEmision?: string;
  servicioIds: string[];
};

type DDoc = {
  id: number;
  file: string | null;
  docType: string | null;
  status: string | null;
  note?: string | null;
};

function encodeMeta(m: CertMeta): string {
  return NOTE_PREFIX + JSON.stringify(m);
}

function decodeMeta(note?: string | null): CertMeta | null {
  if (!note?.startsWith(NOTE_PREFIX)) return null;
  try {
    const m = JSON.parse(note.slice(NOTE_PREFIX.length)) as CertMeta;
    if (!m || typeof m.nombreTipo !== 'string' || !Array.isArray(m.servicioIds)) return null;
    return m;
  } catch {
    return null;
  }
}

function docTypePara(nombreTipo: string): string {
  const n = nombreTipo.toLowerCase();
  if (n.includes('dni') || n.includes('cédula') || n.includes('cedula') || n.includes('pasaporte')) return 'dni';
  if (n.includes('título') || n.includes('titulo') || n.includes('diploma') || n.includes('grado')) return 'titulo';
  return 'certificado';
}

async function serviciosDelPro(token: string): Promise<string[]> {
  const rows = await bffApi<{ serviceId: number }[]>('GET', '/api/professionals/me/services', token);
  return rows.map((r) => String(r.serviceId));
}

async function documentosDelPro(token: string): Promise<DDoc[]> {
  return bffApi<DDoc[]>('GET', '/api/professionals/me/documents', token);
}

function validarCobertura(form: CertificadoFormPayload, servicioIdsDelPro: string[], existentes: CertificadoProfesional[], excluirId?: string): void {
  if (!form.nombreTipo.trim() || !form.entidadEmisora.trim()) throw new ServiceError('VALIDATION');
  if (form.servicioIds.length === 0) throw new ServiceError('VALIDATION');
  for (const s of form.servicioIds) {
    if (!servicioIdsDelPro.includes(s)) throw new ServiceError('SERVICIO_INVALIDO');
  }
  const conteo = new Map<string, number>();
  for (const c of existentes) {
    if (c.id === excluirId) continue;
    for (const s of c.servicioIds) conteo.set(s, (conteo.get(s) ?? 0) + 1);
  }
  for (const s of form.servicioIds) {
    if ((conteo.get(s) ?? 0) >= CERTIFICADO_MAX_POR_SERVICIO) {
      throw new ServiceError('LIMITE_CERTIFICADOS_SERVICIO');
    }
  }
}

async function validarArchivo(desc: CertificadoArchivoDescriptor): Promise<void> {
  if (!esMimeCertificadoPermitido(desc.mimeType)) throw new ServiceError('ARCHIVO_INVALIDO');
  const size = await resolverSizeBytes(desc.uri, desc.sizeBytes);
  const tam = validarTamanoCertificado(size);
  if (tam === 'muy_grande') throw new ServiceError('ARCHIVO_MUY_GRANDE');
  if (tam === 'invalido') throw new ServiceError('ARCHIVO_INVALIDO');
}

function aCertificado(doc: DDoc, solicitudId: string, archivo: CertificadoArchivoDescriptor): CertificadoProfesional {
  const meta = decodeMeta(doc.note);
  return {
    id: String(doc.id),
    solicitudId,
    nombreTipo: meta?.nombreTipo ?? doc.docType ?? '',
    entidadEmisora: meta?.entidadEmisora ?? '',
    ...(meta?.fechaEmision ? { fechaEmision: meta.fechaEmision } : {}),
    servicioIds: meta?.servicioIds ?? [],
    archivo,
  };
}

export function createBackendProfessionalCertificateService(): ProfessionalCertificateService {
  return {
    async obtenerServiciosDeSolicitud(input: ObtenerServiciosDeSolicitudRequest): Promise<ObtenerServiciosDeSolicitudResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      return { servicioIds: await serviciosDelPro(session.token) };
    },

    async listarCertificados(input): Promise<CertificadoProfesional[]> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const docs = await documentosDelPro(session.token);
      const solicitudId = backendSolicitudId(professionalId);
      return docs.map((d) =>
        aCertificado(d, solicitudId, {
          uri: assetUrl(d.file) ?? '',
          mimeType: 'image/jpeg',
          fileName: `certificado-${d.id}`,
          sizeBytes: 0,
        }),
      );
    },

    async agregarCertificado(input: AgregarCertificadoRequest): Promise<CertificadoProfesional> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const form = input.certificado;
      const delPro = await serviciosDelPro(session.token);
      const existentes = await this.listarCertificados({ solicitudId: input.solicitudId });
      validarCobertura(form, delPro, existentes);
      await validarArchivo(form.archivo);
      const fileId = await uploadFile(session.token, form.archivo.uri, form.archivo.fileName, form.archivo.mimeType);
      const created = await bffApi<DDoc>('POST', '/api/professionals/me/documents', session.token, {
        file: fileId,
        docType: docTypePara(form.nombreTipo),
        note: encodeMeta({
          nombreTipo: form.nombreTipo,
          entidadEmisora: form.entidadEmisora,
          ...(form.fechaEmision ? { fechaEmision: form.fechaEmision } : {}),
          servicioIds: form.servicioIds,
        }),
      });
      return aCertificado(created, backendSolicitudId(professionalId), {
        uri: assetUrl(fileId) ?? form.archivo.uri,
        mimeType: form.archivo.mimeType,
        fileName: form.archivo.fileName,
        sizeBytes: form.archivo.sizeBytes,
      });
    },

    async actualizarCertificado(input: ActualizarCertificadoRequest): Promise<CertificadoProfesional> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const form = input.certificado;
      const existentes = await this.listarCertificados({ solicitudId: input.solicitudId });
      if (!existentes.some((c) => c.id === input.certificadoId)) {
        throw new ServiceError('CERTIFICADO_NO_ENCONTRADO');
      }
      validarCobertura(form, await serviciosDelPro(session.token), existentes, input.certificadoId);
      await validarArchivo(form.archivo);
      const anterior = (await documentosDelPro(session.token)).find(
        (d) => String(d.id) === input.certificadoId,
      );
      if (!anterior) throw new ServiceError('CERTIFICADO_NO_ENCONTRADO');
      const fileId = await uploadFile(session.token, form.archivo.uri, form.archivo.fileName, form.archivo.mimeType);
      const updated = await bffApi<DDoc>(
        'PATCH',
        `/api/professionals/me/documents/${input.certificadoId}`,
        session.token,
        {
          file: fileId,
          docType: docTypePara(form.nombreTipo),
          note: encodeMeta({
            nombreTipo: form.nombreTipo,
            entidadEmisora: form.entidadEmisora,
            ...(form.fechaEmision ? { fechaEmision: form.fechaEmision } : {}),
            servicioIds: form.servicioIds,
          }),
        },
      );
      if (anterior.file) {
        await api('DELETE', `/files/${anterior.file}`, session.token).catch(() => undefined);
      }
      return aCertificado(updated, backendSolicitudId(professionalId), {
        uri: assetUrl(fileId) ?? form.archivo.uri,
        mimeType: form.archivo.mimeType,
        fileName: form.archivo.fileName,
        sizeBytes: form.archivo.sizeBytes,
      });
    },

    async eliminarCertificado(input: EliminarCertificadoRequest): Promise<void> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const doc = (await documentosDelPro(session.token)).find(
        (d) => String(d.id) === input.certificadoId,
      );
      if (!doc) throw new ServiceError('CERTIFICADO_NO_ENCONTRADO');
      await bffApi('DELETE', `/api/professionals/me/documents/${input.certificadoId}`, session.token);
      if (doc.file) {
        await api('DELETE', `/files/${doc.file}`, session.token).catch(() => undefined);
      }
    },

    async enviarSolicitudVerificacion(
      input,
    ): Promise<EnviarSolicitudVerificacionResponse> {
      const session = await loadBackendSession();
      if (!session) throw new ServiceError('INVALID_CREDENTIALS');
      const professionalId = await resolveProfessionalId(undefined, input.solicitudId);
      const pro = await bffApi<{ displayName: string; verificationStatus?: string | null }>(
        'GET',
        '/api/professionals/me',
        session.token,
        undefined,
        'SOLICITUD_NO_ENCONTRADA',
      );
      if (pro.verificationStatus === 'verified') throw new ServiceError('OPERACION_NO_PERMITIDA');
      const delPro = await serviciosDelPro(session.token);
      const certs = await this.listarCertificados({ solicitudId: input.solicitudId });
      for (const s of delPro) {
        const n = certs.filter((c) => c.servicioIds.includes(s)).length;
        if (n < 1) throw new ServiceError('SERVICIO_SIN_CERTIFICADO');
        if (n > CERTIFICADO_MAX_POR_SERVICIO) throw new ServiceError('LIMITE_CERTIFICADOS_SERVICIO');
      }
      await bffApi('PATCH', '/api/professionals/me', session.token, {
        verificationStatus: 'pending',
      });
      return {
        solicitudId: backendSolicitudId(professionalId),
        estadoSolicitud: 'EN_REVISION',
        profesionalId: String(professionalId),
        nombre: pro.displayName,
        email: session.email,
        onboardingPaso: 'CERTIFICADOS',
      };
    },
  };
}
