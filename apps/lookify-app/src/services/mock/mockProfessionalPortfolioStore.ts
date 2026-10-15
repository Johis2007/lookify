import { PortfolioItem, PortfolioMediaTipo } from '../../types/professionalPortfolio';

type ItemInterno = Omit<PortfolioItem, 'esPortada'>;

type PortafolioProfesional = {
  fotos: ItemInterno[];
  videos: ItemInterno[];
};

const portafolioByProfesionalId = new Map<string, PortafolioProfesional>();

function emptyPortafolio(): PortafolioProfesional {
  return { fotos: [], videos: [] };
}

export function getPortafolioStore(profesionalId: string): PortafolioProfesional {
  let data = portafolioByProfesionalId.get(profesionalId);
  if (!data) {
    data = emptyPortafolio();
    portafolioByProfesionalId.set(profesionalId, data);
  }
  return data;
}

function listaPorTipo(data: PortafolioProfesional, tipo: PortfolioMediaTipo): ItemInterno[] {
  return tipo === 'FOTO' ? data.fotos : data.videos;
}

function renumerar(items: ItemInterno[]): void {
  items.sort((a, b) => a.orden - b.orden);
  for (let i = 0; i < items.length; i += 1) {
    items[i].orden = i;
  }
}

function conEsPortada(items: ItemInterno[]): PortfolioItem[] {
  renumerar(items);
  return items.map((item) => ({
    ...item,
    esPortada: item.tipo === 'FOTO' && item.orden === 0,
  }));
}

export function listarItemsPublicos(
  profesionalId: string,
  tipo: PortfolioMediaTipo
): PortfolioItem[] {
  const data = getPortafolioStore(profesionalId);
  return conEsPortada([...listaPorTipo(data, tipo)]);
}

export function encontrarItem(
  profesionalId: string,
  itemId: string
): { item: ItemInterno; tipo: PortfolioMediaTipo; lista: ItemInterno[] } | null {
  const data = getPortafolioStore(profesionalId);
  for (const tipo of ['FOTO', 'VIDEO'] as const) {
    const lista = listaPorTipo(data, tipo);
    const item = lista.find((x) => x.id === itemId);
    if (item) {
      return { item, tipo, lista };
    }
  }
  return null;
}

export function agregarItemInterno(
  profesionalId: string,
  tipo: PortfolioMediaTipo,
  payload: Omit<ItemInterno, 'id' | 'orden' | 'tipo'>
): PortfolioItem {
  const data = getPortafolioStore(profesionalId);
  const lista = listaPorTipo(data, tipo);
  const id = `pf-${tipo === 'FOTO' ? 'f' : 'v'}-${Date.now()}-${lista.length}`;
  const item: ItemInterno = {
    id,
    tipo,
    orden: lista.length,
    ...payload,
  };
  lista.push(item);
  return conEsPortada(lista).find((x) => x.id === id)!;
}

export function eliminarItemInterno(profesionalId: string, itemId: string): void {
  const found = encontrarItem(profesionalId, itemId);
  if (!found) return;
  const idx = found.lista.findIndex((x) => x.id === itemId);
  if (idx >= 0) {
    found.lista.splice(idx, 1);
    renumerar(found.lista);
  }
}

export function moverItemInterno(
  profesionalId: string,
  itemId: string,
  direccion: 'ARRIBA' | 'ABAJO'
): PortfolioItem[] {
  const found = encontrarItem(profesionalId, itemId);
  if (!found) {
    throw new Error('not found');
  }
  renumerar(found.lista);
  const idx = found.lista.findIndex((x) => x.id === itemId);
  if (idx < 0) {
    throw new Error('not found');
  }
  const swapWith = direccion === 'ARRIBA' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= found.lista.length) {
    return conEsPortada(found.lista);
  }
  const tmp = found.lista[idx].orden;
  found.lista[idx].orden = found.lista[swapWith].orden;
  found.lista[swapWith].orden = tmp;
  renumerar(found.lista);
  return conEsPortada(found.lista);
}

export function definirPortadaInterno(profesionalId: string, itemId: string): PortfolioItem[] {
  const found = encontrarItem(profesionalId, itemId);
  if (!found || found.tipo !== 'FOTO') {
    throw new Error('not foto');
  }
  renumerar(found.lista);
  const idx = found.lista.findIndex((x) => x.id === itemId);
  if (idx <= 0) {
    return conEsPortada(found.lista);
  }
  const [item] = found.lista.splice(idx, 1);
  found.lista.unshift(item);
  renumerar(found.lista);
  return conEsPortada(found.lista);
}

export function actualizarItemInterno(
  profesionalId: string,
  itemId: string,
  patch: { descripcion?: string; servicioId?: string | null }
): PortfolioItem {
  const found = encontrarItem(profesionalId, itemId);
  if (!found) {
    throw new Error('not found');
  }
  if (patch.descripcion !== undefined) {
    if (patch.descripcion.length === 0) {
      delete found.item.descripcion;
    } else {
      found.item.descripcion = patch.descripcion;
    }
  }
  if (patch.servicioId !== undefined) {
    if (patch.servicioId === null) {
      delete found.item.servicioId;
    } else {
      found.item.servicioId = patch.servicioId;
    }
  }
  return conEsPortada(found.lista).find((x) => x.id === itemId)!;
}

export function reemplazarArchivoInterno(
  profesionalId: string,
  itemId: string,
  archivo: {
    uri: string;
    mimeType: string;
    sizeBytes?: number;
    duracionSeg?: number;
  }
): PortfolioItem {
  const found = encontrarItem(profesionalId, itemId);
  if (!found) {
    throw new Error('not found');
  }
  found.item.uri = archivo.uri;
  found.item.mimeType = archivo.mimeType;
  if (archivo.sizeBytes !== undefined) {
    found.item.sizeBytes = archivo.sizeBytes;
  } else {
    delete found.item.sizeBytes;
  }
  if (found.tipo === 'VIDEO') {
    found.item.duracionSeg = archivo.duracionSeg;
  } else {
    delete found.item.duracionSeg;
  }
  return conEsPortada(found.lista).find((x) => x.id === itemId)!;
}
