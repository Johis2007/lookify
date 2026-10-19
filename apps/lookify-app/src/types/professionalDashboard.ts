import type { FotoPerfilMimePermitido } from '../constants/professionalProfilePhoto';
import { ResenaProfesional } from './professionalReview';

export type DisponibilidadProfesional = 'DISPONIBLE' | 'OCUPADO';

export interface ResumenDiaPanel {
  serviciosRealizados: number;
  ingresosCop: number;
  /** Solo UI __DEV__: resumen de hoy basado únicamente en ítems de semilla */
  muestraEtiquetaDatosEjemplo?: boolean;
}

export interface ServicioOfrecidoPanel {
  servicioId: string;
  nombre: string;
  duracionMin: number;
  precioBaseCop: number;
}

export interface FotoPerfilPanel {
  uri: string;
  mimeType: FotoPerfilMimePermitido;
}

export interface PanelPrincipalResponse {
  nombre: string;
  /** null si totalResenas === 0 */
  calificacionPromedio: number | null;
  totalResenas: number;
  disponibilidad: DisponibilidadProfesional;
  resumenDia: ResumenDiaPanel;
  ultimasResenas: ResenaProfesional[];
  serviciosOfrecidos: ServicioOfrecidoPanel[];
  fotoPerfil: FotoPerfilPanel | null;
}

export interface ObtenerPanelPrincipalRequest {
  profesionalId: string;
  solicitudId: string;
}

export interface CambiarDisponibilidadRequest {
  profesionalId: string;
  solicitudId: string;
  disponibilidad: DisponibilidadProfesional;
}

export interface CambiarDisponibilidadResponse {
  disponibilidad: DisponibilidadProfesional;
}

export interface ArchivoFotoPerfilInput {
  uri: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface ActualizarFotoPerfilRequest {
  profesionalId: string;
  archivo: ArchivoFotoPerfilInput;
}

export interface ActualizarFotoPerfilResponse {
  fotoPerfil: FotoPerfilPanel;
}

export interface RegistrarCierreSesionRequest {
  profesionalId: string;
}

export interface ConsultarDisponibilidadRequest {
  profesionalId: string;
}

export interface ConsultarDisponibilidadResponse {
  disponibilidad: DisponibilidadProfesional;
}
