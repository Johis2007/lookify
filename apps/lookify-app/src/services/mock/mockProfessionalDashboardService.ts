import {
  ActualizarFotoPerfilRequest,
  ActualizarFotoPerfilResponse,
  CambiarDisponibilidadRequest,
  CambiarDisponibilidadResponse,
  ObtenerPanelPrincipalRequest,
  PanelPrincipalResponse,
  ConsultarDisponibilidadRequest,
  ConsultarDisponibilidadResponse,
  RegistrarCierreSesionRequest,
} from '../../types/professionalDashboard';
import { FotoPerfilMimePermitido } from '../../constants/professionalProfilePhoto';
import { ServiceError } from '../errors';
import { ProfessionalDashboardService } from '../professionalDashboardService';
import { getCatalogService } from '../catalogService';
import {
  getEstadoSolicitudForSolicitud,
  getProfesionalBasicoBySolicitudId,
  getServiciosForSolicitud,
  isProfesionalActivado,
  solicitudExiste,
} from './mockProfessionalRegistryStore';
import {
  getDisponibilidad,
  getFotoPerfil,
  getResenasSeed,
  setDisponibilidad,
  setFotoPerfil,
} from './mockProfessionalDashboardStore';
import { resumenHoyParaPanel } from './mockProfessionalEarningsHistoryStore';
import { validarArchivoFotoPerfil } from '../../utils/profilePhotoFile';
import { hayServicioEnCursoActivo } from './mockProfessionalServiceInProgressStore';

const MOCK_LATENCY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertProfesionalHabilitado(profesionalId: string, solicitudId: string): void {
  const estado = getEstadoSolicitudForSolicitud(solicitudId);
  if (estado !== 'APROBADO' || !isProfesionalActivado(profesionalId)) {
    throw new ServiceError('PROFESIONAL_NO_HABILITADO');
  }
}

export function createMockProfessionalDashboardService(): ProfessionalDashboardService {
  return {
    async obtenerPanelPrincipal(
      input: ObtenerPanelPrincipalRequest
    ): Promise<PanelPrincipalResponse> {
      await delay(MOCK_LATENCY_MS);
      if (!input.profesionalId || !input.solicitudId) {
        throw new ServiceError('VALIDATION');
      }
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }
      const basico = getProfesionalBasicoBySolicitudId(input.solicitudId);
      if (!basico || basico.profesionalId !== input.profesionalId) {
        throw new ServiceError('VALIDATION');
      }

      const servicioIds = getServiciosForSolicitud(input.solicitudId) ?? [];
      const catalogo = await getCatalogService().listarServiciosPorCategoria();
      const serviciosOfrecidos = servicioIds.map((id) => {
        for (const cat of catalogo) {
          const s = cat.servicios.find((x) => x.id === id);
          if (s) {
            return {
              servicioId: s.id,
              nombre: s.nombre,
              duracionMin: s.duracionMin,
              precioBaseCop: s.precio,
            };
          }
        }
        return null;
      }).filter((x): x is NonNullable<typeof x> => x != null);

      const resenas = getResenasSeed(input.profesionalId);
      const totalResenas = resenas?.totalResenas ?? 0;
      const calificacionPromedio =
        totalResenas > 0 ? (resenas?.calificacionPromedio ?? null) : null;

      const now = Date.now();
      const resumenDia = resumenHoyParaPanel(input.profesionalId, now);

      return {
        nombre: basico.nombre,
        calificacionPromedio,
        totalResenas,
        disponibilidad: getDisponibilidad(input.profesionalId),
        resumenDia,
        ultimasResenas: resenas?.ultimas ?? [],
        serviciosOfrecidos,
        fotoPerfil: getFotoPerfil(input.profesionalId),
      };
    },

    async cambiarDisponibilidad(
      input: CambiarDisponibilidadRequest
    ): Promise<CambiarDisponibilidadResponse> {
      await delay(MOCK_LATENCY_MS);
      if (!input.profesionalId || !input.solicitudId) {
        throw new ServiceError('VALIDATION');
      }
      if (!solicitudExiste(input.solicitudId)) {
        throw new ServiceError('SOLICITUD_NO_ENCONTRADA');
      }

      if (input.disponibilidad === 'DISPONIBLE') {
        assertProfesionalHabilitado(input.profesionalId, input.solicitudId);
        if (hayServicioEnCursoActivo(input.profesionalId, Date.now())) {
          throw new ServiceError('SERVICIO_EN_CURSO_ACTIVO');
        }
      }

      setDisponibilidad(input.profesionalId, input.disponibilidad);
      return { disponibilidad: input.disponibilidad };
    },

    async actualizarFotoPerfil(
      input: ActualizarFotoPerfilRequest
    ): Promise<ActualizarFotoPerfilResponse> {
      await delay(MOCK_LATENCY_MS);
      if (!input.profesionalId || !input.archivo?.uri) {
        throw new ServiceError('VALIDATION');
      }
      const tam = await validarArchivoFotoPerfil(
        input.archivo.uri,
        input.archivo.mimeType,
        input.archivo.sizeBytes
      );
      if (tam === 'muy_grande') {
        throw new ServiceError('ARCHIVO_MUY_GRANDE');
      }
      if (tam === 'invalido') {
        throw new ServiceError('ARCHIVO_INVALIDO');
      }
      const mimeType = input.archivo.mimeType as FotoPerfilMimePermitido;
      const foto = { uri: input.archivo.uri, mimeType };
      setFotoPerfil(input.profesionalId, foto);
      return { fotoPerfil: { ...foto } };
    },

    async registrarCierreSesion(input: RegistrarCierreSesionRequest): Promise<void> {
      await delay(100);
      if (!input.profesionalId) {
        throw new ServiceError('VALIDATION');
      }
      if (hayServicioEnCursoActivo(input.profesionalId, Date.now())) {
        throw new ServiceError('SERVICIO_EN_CURSO_ACTIVO');
      }
      setDisponibilidad(input.profesionalId, 'OCUPADO');
    },

    async consultarDisponibilidad(
      input: ConsultarDisponibilidadRequest
    ): Promise<ConsultarDisponibilidadResponse> {
      await delay(50);
      if (!input.profesionalId) {
        throw new ServiceError('VALIDATION');
      }
      return { disponibilidad: getDisponibilidad(input.profesionalId) };
    },
  };
}
