#!/usr/bin/env py -3
"""Genera PNG de marca Lookify desde assets/brand/logo-simple-source.png."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "assets" / "brand"
SOURCE = BRAND / "logo-simple-source.png"
OUT_DIR = ROOT / "assets"
PREVIEW_DIR = ROOT.parent / "logo-preview-lookify"

TEAL = np.array([0x1F, 0x4E, 0x5A], dtype=np.float64)
CREAM = np.array([0xFB, 0xF6, 0xEE], dtype=np.float64)
WHITE = np.array([0xFF, 0xFF, 0xFF], dtype=np.float64)

CANVAS = 1024
SAFE_RADIUS = 338  # 66% of 512


def corner_median_rgb(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    s = max(8, min(h, w) // 64)
    patches = [
        img[:s, :s, :3],
        img[:s, -s:, :3],
        img[-s:, :s, :3],
        img[-s:, -s:, :3],
    ]
    return np.median(np.concatenate([p.reshape(-1, 3) for p in patches], axis=0), axis=0)


def stroke_median_rgb(img: np.ndarray, bg: np.ndarray) -> np.ndarray:
    rgb = img[:, :, :3].astype(np.float64)
    dist_bg = np.linalg.norm(rgb - bg, axis=2)
    dist_all = np.linalg.norm(rgb - rgb.reshape(-1, 3).mean(axis=0), axis=2)
    # Píxeles más claros que el fondo (símbolo crema)
    mask = dist_bg > 8
    if mask.sum() < 100:
        raise RuntimeError("No se detectaron píxeles de trazo claros")
    bright = rgb[mask]
    lum = bright.mean(axis=1)
    top = bright[lum >= np.percentile(lum, 50)]
    return np.median(top, axis=0)


def alpha_from_projection(img: np.ndarray, bg: np.ndarray, stroke: np.ndarray) -> np.ndarray:
    rgb = img[:, :, :3].astype(np.float64)
    v = stroke - bg
    denom = float(np.dot(v, v))
    if denom < 1e-6:
        raise RuntimeError("Fondo y trazo demasiado similares")
    diff = rgb - bg
    alpha = np.dot(diff, v) / denom
    return np.clip(alpha, 0.0, 1.0)


def resize_alpha(alpha: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    a_img = Image.fromarray((alpha * 255).astype(np.uint8), mode="L")
    a_img = a_img.resize(size, Image.Resampling.LANCZOS)
    return np.asarray(a_img, dtype=np.float64) / 255.0


def bbox_of_alpha(alpha: np.ndarray, thresh: float = 0.5) -> tuple[int, int, int, int]:
    ys, xs = np.where(alpha >= thresh)
    if len(xs) == 0:
        raise RuntimeError("Máscara vacía")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crop_alpha(alpha: np.ndarray, thresh: float = 0.5) -> np.ndarray:
    x0, y0, x1, y1 = bbox_of_alpha(alpha, thresh)
    return alpha[y0:y1, x0:x1]


def paste_centered(
    canvas: np.ndarray,
    alpha: np.ndarray,
    rgb: np.ndarray,
    *,
    target_h_frac: float | None = None,
    margin_frac: float = 0.0,
    max_radius: float | None = None,
) -> np.ndarray:
    """canvas: HxWx4 float 0-1. alpha: symbol mask 2d."""
    h, w = canvas.shape[:2]
    sym = alpha.copy()
    sh, sw = sym.shape
    if target_h_frac is not None:
        target_h = h * target_h_frac
        scale = target_h / sh
        nw, nh = max(1, int(round(sw * scale))), max(1, int(round(sh * scale)))
        sym = resize_alpha(sym, (nw, nh))
        sh, sw = sym.shape

    if max_radius is not None:
        # escala uniforme para que max distancia al centro del lienzo <= max_radius
        cy, cx = h / 2.0, w / 2.0
        ys, xs = np.where(sym >= 0.5)
        if len(xs) == 0:
            raise RuntimeError("Sin píxeles opacos para zona segura")
        # probar escala actual
        def max_dist(scale: float) -> float:
            nw, nh = max(1, int(round(sw * scale))), max(1, int(round(sh * scale)))
            a = resize_alpha(sym, (nw, nh))
            yy, xx = np.where(a >= 0.5)
            ox = (w - nw) / 2.0
            oy = (h - nh) / 2.0
            d = np.sqrt((ox + xx - cx) ** 2 + (oy + yy - cy) ** 2)
            return float(d.max()) if len(d) else 0.0

        lo, hi = 0.01, 20.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if max_dist(mid) <= max_radius:
                lo = mid
            else:
                hi = mid
        scale = lo * 0.998
        nw, nh = max(1, int(round(sw * scale))), max(1, int(round(sh * scale)))
        sym = resize_alpha(sym, (nw, nh))
        sh, sw = sym.shape

    usable_h = h * (1 - 2 * margin_frac)
    usable_w = w * (1 - 2 * margin_frac)
    if sh > usable_h or sw > usable_w:
        scale = min(usable_h / sh, usable_w / sw)
        nw, nh = max(1, int(round(sw * scale))), max(1, int(round(sh * scale)))
        sym = resize_alpha(sym, (nw, nh))
        sh, sw = sym.shape

    out = canvas.copy()
    y0 = int(round((h - sh) / 2))
    x0 = int(round((w - sw) / 2))
    a = sym[..., None]
    fg = (np.asarray(rgb, dtype=np.float64) / 255.0).reshape(1, 1, 3)
    region = out[y0 : y0 + sh, x0 : x0 + sw]
    region_a = region[..., 3:4]
    new_a = np.clip(a + region_a * (1 - a), 0, 1)
    # PNG con alfa straight: RGB = color pleno del símbolo donde hay cobertura
    region[..., :3] = np.where(new_a > 1e-6, fg, region[..., :3])
    region[..., 3:4] = new_a
    out[y0 : y0 + sh, x0 : x0 + sw] = region
    return out


def rgba_uint8(canvas: np.ndarray) -> Image.Image:
    arr = np.clip(canvas * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, mode="RGBA")


def solid_rgb(size: int, rgb: np.ndarray) -> np.ndarray:
    c = np.zeros((size, size, 4), dtype=np.float64)
    c[..., :3] = rgb / 255.0
    c[..., 3] = 1.0
    return c


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


def analyze_png(path: Path) -> dict:
    im = Image.open(path)
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    arr = np.asarray(im)
    alpha = arr[:, :, 3]
    return {
        "path": str(path.relative_to(ROOT)),
        "size": f"{im.width}x{im.height}",
        "has_alpha": bool(has_alpha and alpha.min() < 255),
    }


def max_opaque_distance(path: Path) -> float:
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im, dtype=np.float64)
    a = arr[:, :, 3] / 255.0
    h, w = a.shape
    cy, cx = h / 2.0, w / 2.0
    ys, xs = np.where(a >= 0.5)
    if len(xs) == 0:
        return 0.0
    d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    return float(d.max())


def halo_check(path: Path, *, symbol_rgb: tuple[int, int, int] | None = None) -> dict:
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im, dtype=np.float64)
    rgb = arr[:, :, :3]
    a = arr[:, :, 3] / 255.0
    edge = (a > 0.01) & (a < 0.99)
    if edge.sum() == 0:
        return {"edge_pixels": 0, "mean_rgb": None}
    mean = rgb[edge].mean(axis=0)
    out = {"edge_pixels": int(edge.sum()), "mean_rgb": [round(x, 2) for x in mean.tolist()]}
    bg_like = np.array([14, 69, 88], dtype=np.float64)
    cream_like = np.array([251, 246, 238], dtype=np.float64)
    out["max_dist_to_bg"] = round(float(np.linalg.norm(mean - bg_like)), 2)
    out["max_dist_to_cream_bg"] = round(float(np.linalg.norm(mean - cream_like)), 2)
    if symbol_rgb:
        sym = np.array(symbol_rgb, dtype=np.float64)
        out["mean_dist_to_symbol"] = round(float(np.linalg.norm(mean - sym)), 2)
    return out


def window_band_teal_count(img: np.ndarray) -> int:
    h, w = img.shape[:2]
    cx0, cx1 = int(w * 0.30), int(w * 0.70)
    y0, y1 = int(h * 0.72), int(h * 0.92)
    rgb = img[:, :, :3]
    # ventana = píxeles muy claros en banda inferior (crema del símbolo extra)
    band = rgb[y0:y1, cx0:cx1]
    lum = band.mean(axis=2)
    # contar blobs pequeños tipo cuadrito: píxeles crema aislados en zona baja
    cream = (band[:, :, 0] > 200) & (band[:, :, 1] > 200) & (lum > 180)
    # heurística: cuadrito = más de 800 px crema en banda para logo con ventana
    return int(cream.sum())


def make_previews() -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    fg = Image.open(OUT_DIR / "android-icon-foreground.png").convert("RGBA")
    icon = Image.open(OUT_DIR / "icon.png").convert("RGBA")
    logo = Image.open(OUT_DIR / "logo-lookify.png").convert("RGBA")

    def circle_mask(size: int) -> Image.Image:
        m = Image.new("L", (size, size), 0)
        px = m.load()
        r = size / 2
        for y in range(size):
            for x in range(size):
                if (x - r + 0.5) ** 2 + (y - r + 0.5) ** 2 <= r * r:
                    px[x, y] = 255
        return m

    def rounded_mask(size: int, radius: int) -> Image.Image:
        m = Image.new("L", (size, size), 0)
        from PIL import ImageDraw

        d = ImageDraw.Draw(m)
        d.rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
        return m

    for size in (192, 108, 48):
        ic = icon.resize((size, size), Image.Resampling.LANCZOS)
        ic.save(PREVIEW_DIR / f"icon-square-{size}.png")
        circ = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        circ.paste(ic, (0, 0), circle_mask(size))
        circ.save(PREVIEW_DIR / f"icon-circle-{size}.png")
        rnd = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        rnd.paste(ic, (0, 0), rounded_mask(size, max(4, size // 5)))
        rnd.save(PREVIEW_DIR / f"icon-rounded-{size}.png")

    teal_bg = Image.new("RGBA", (96, 96), (*TEAL.astype(int), 255))
    for size in (96, 48):
        lg = logo.resize((size, size), Image.Resampling.LANCZOS)
        comp = teal_bg.copy() if size == 96 else Image.new("RGBA", (48, 48), (*TEAL.astype(int), 255))
        comp.paste(lg, (0, 0), lg)
        comp.save(PREVIEW_DIR / f"logo-on-teal-{size}.png")


def main() -> int:
    if not SOURCE.exists():
        print(f"ERROR: falta {SOURCE}", file=sys.stderr)
        return 1

    src = Image.open(SOURCE).convert("RGBA")
    arr = np.asarray(src, dtype=np.float64)
    h, w = arr.shape[:2]
    print(f"SOURCE {SOURCE.name} {w}x{h}")
    if (w, h) != (1254, 1254):
        print(f"ADVERTENCIA: se esperaba 1254x1254, got {w}x{h}")

    window_px = window_band_teal_count(arr)
    print(f"window_band_cream_pixels={window_px} (bajo ~800 = sin cuadrito)")

    bg = corner_median_rgb(arr)
    stroke = stroke_median_rgb(arr, bg)
    print(f"bg_median={[round(x,1) for x in bg.tolist()]} stroke_median={[round(x,1) for x in stroke.tolist()]}")

    alpha = alpha_from_projection(arr, bg, stroke)
    alpha = resize_alpha(alpha, (alpha.shape[1], alpha.shape[0]))  # suaviza re-muestreo idempotente
    sym = crop_alpha(alpha, 0.35)

    # --- icon.png ---
    c = solid_rgb(CANVAS, CREAM)
    c = paste_centered(c, sym, TEAL, target_h_frac=0.60)
    save_png(rgba_uint8(c), OUT_DIR / "icon.png")

    # --- android-icon-foreground ---
    c = np.zeros((CANVAS, CANVAS, 4), dtype=np.float64)
    c = paste_centered(c, sym, TEAL, max_radius=SAFE_RADIUS)
    save_png(rgba_uint8(c), OUT_DIR / "android-icon-foreground.png")

    # --- android-icon-background ---
    save_png(rgba_uint8(solid_rgb(CANVAS, CREAM)), OUT_DIR / "android-icon-background.png")

    # --- monochrome ---
    c = np.zeros((CANVAS, CANVAS, 4), dtype=np.float64)
    c = paste_centered(c, sym, WHITE, max_radius=SAFE_RADIUS)
    save_png(rgba_uint8(c), OUT_DIR / "android-icon-monochrome.png")

    # --- splash ---
    c = np.zeros((CANVAS, CANVAS, 4), dtype=np.float64)
    c = paste_centered(c, sym, TEAL, margin_frac=0.30)
    save_png(rgba_uint8(c), OUT_DIR / "splash-icon.png")

    # --- favicon ---
    c = solid_rgb(48, CREAM)
    c = paste_centered(c, sym, TEAL, target_h_frac=0.72)
    save_png(rgba_uint8(c), OUT_DIR / "favicon.png")

    # --- logo-lookify ---
    c = np.zeros((512, 512, 4), dtype=np.float64)
    c = paste_centered(c, sym, CREAM, margin_frac=0.08)
    save_png(rgba_uint8(c), OUT_DIR / "logo-lookify.png")

    fg_dist = max_opaque_distance(OUT_DIR / "android-icon-foreground.png")
    mono_dist = max_opaque_distance(OUT_DIR / "android-icon-monochrome.png")
    print(f"foreground_max_dist={fg_dist:.2f} (limit {SAFE_RADIUS})")
    print(f"monochrome_max_dist={mono_dist:.2f} (limit {SAFE_RADIUS})")

    outputs = [
        OUT_DIR / "icon.png",
        OUT_DIR / "android-icon-foreground.png",
        OUT_DIR / "android-icon-background.png",
        OUT_DIR / "android-icon-monochrome.png",
        OUT_DIR / "splash-icon.png",
        OUT_DIR / "favicon.png",
        OUT_DIR / "logo-lookify.png",
    ]
    print("TABLE", json.dumps([analyze_png(p) for p in outputs]))
    halo_specs = {
        "android-icon-foreground.png": (31, 78, 90),
        "android-icon-monochrome.png": (255, 255, 255),
        "splash-icon.png": (31, 78, 90),
        "logo-lookify.png": (251, 246, 238),
    }
    for name, sym in halo_specs.items():
        print(f"HALO {name}", json.dumps(halo_check(OUT_DIR / name, symbol_rgb=sym)))

    make_previews()
    print(f"PREVIEW_DIR={PREVIEW_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
