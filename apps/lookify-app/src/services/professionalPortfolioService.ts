import {
  ActualizarPortfolioItemRequest,
  AgregarFotoRequest,
  AgregarVideoRequest,
  DefinirPortadaRequest,
  EliminarPortfolioItemRequest,
  ListarServiciosAsociablesRequest,
  MoverPortfolioItemRequest,
  ObtenerPortafolioRequest,
  PortfolioItem,
  PortfolioResponse,
  ReemplazarArchivoPortfolioRequest,
  ServicioAsociable,
} from '../types/professionalPortfolio';
import { createMockProfessionalPortfolioService } from './mock/mockProfessionalPortfolioService';

export interface ProfessionalPortfolioService {
  obtenerPortafolio(input: ObtenerPortafolioRequest): Promise<PortfolioResponse>;
  listarServiciosAsociables(input: ListarServiciosAsociablesRequest): Promise<ServicioAsociable[]>;
  agregarFoto(input: AgregarFotoRequest): Promise<PortfolioItem>;
  agregarVideo(input: AgregarVideoRequest): Promise<PortfolioItem>;
  actualizarItem(input: ActualizarPortfolioItemRequest): Promise<PortfolioItem>;
  eliminarItem(input: EliminarPortfolioItemRequest): Promise<void>;
  reemplazarArchivo(input: ReemplazarArchivoPortfolioRequest): Promise<PortfolioItem>;
  moverItem(input: MoverPortfolioItemRequest): Promise<PortfolioResponse>;
  definirPortada(input: DefinirPortadaRequest): Promise<PortfolioResponse>;
}

let implementation: ProfessionalPortfolioService = createMockProfessionalPortfolioService();

export function getProfessionalPortfolioService(): ProfessionalPortfolioService {
  return implementation;
}

export function setProfessionalPortfolioServiceForTesting(
  service: ProfessionalPortfolioService
): void {
  implementation = service;
}
