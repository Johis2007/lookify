# Fuentes de marca Lookify

## Archivos fuente

| Archivo | Uso |
|---------|-----|
| `logo-simple-source.png` | **Fuente activa:** símbolo crema sobre fondo verde petróleo (sin ventana). Alimenta todos los PNG de `assets/`. |
| `logo-source.png` | Histórico (logo completo con ventana, generación anterior). No usar en el script actual. |

## Regenerar iconos y logo in-app

Requisitos: Python 3 con **Pillow** y **numpy** (`py -3 -c "import PIL, numpy"`).

Desde la raíz del repo:

```bash
py -3 scripts/generate-brand-assets.py
```

Salidas (mismos nombres que antes): `assets/icon.png`, `android-icon-*.png`, `favicon.png`, `splash-icon.png`, `logo-lookify.png`.

Vistas previas de comprobación (fuera del repo): `../logo-preview-lookify/`.

Paleta usada en la composición: `#1F4E5A`, `#FBF6EE`, `#FFFFFF`.
