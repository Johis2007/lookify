import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CategoriaId } from '../data/mockProfessionals';

/** Mismo mapa que HomeScreen; refactor opcional para compartir import (ver PROGRESS.md). */
export const CATEGORIA_ICONOS: Record<CategoriaId, keyof typeof MaterialCommunityIcons.glyphMap> =
  {
    peluqueria: 'content-cut',
    barberia: 'razor-double-edge',
    maquillaje: 'lipstick',
    unas: 'hand-back-right-outline',
  };
