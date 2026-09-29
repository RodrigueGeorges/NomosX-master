"""cover-plates.py — topographic plate covers from the domain frescoes.

Each artwork is read as a relief map: iso-luminance contours of the
smoothed field trace the figure's forms — the cartography of the
domain's myth. Landscape canvas matching the real display bands, one
hue of ink per domain, calibrated per theme.

  public/figures/<key>-plate-{light,dark}.webp      1400×470  (heroes)
  public/figures/<key>-plate-sm-{light,dark}.webp    700×235  (cards)

Both sizes render the SAME polylines scaled — hero and thumbnail are
always the same crop, raccord by construction. `nomos` gets a figureless
field so unresolved domains share the same texture.
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
from skimage.measure import find_contours

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

FIGURES = "public/figures"

W, H = 1400, 470          # landscape plate — matches display bands
SM_W, SM_H = 700, 235
AA = 2                    # supersample factor for anti-aliasing

LEVELS = np.linspace(0.10, 0.92, 19)
SIGMA = 4.0
MIN_LEN = 30              # drop noise-island polylines

# Ink hue per domain, calibrated per theme — same palette as
# lib/brand/domain-figures.ts PLATE_INKS. Sub-domains inherit the parent.
INKS = {
    "light": {
        "technology": "#0369A1",
        "economics": "#4338CA",
        "governance": "#6D28D9",
        "geopolitics": "#B91C1C",
        "climate": "#0F766E",
        "health": "#047857",
        "finance": "#C2410C",
        "security": "#B45309",
        "nomos": "#3F3F46",
    },
    "dark": {
        "technology": "#38BDF8",
        "economics": "#818CF8",
        "governance": "#A78BFA",
        "geopolitics": "#F87171",
        "climate": "#2DD4BF",
        "health": "#34D399",
        "finance": "#FB923C",
        "security": "#FBBF24",
        "nomos": "#D4D4D8",
    },
}


def hex_rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def load_landscape(key, w=W, h=H):
    src = Image.open(f"{FIGURES}/{key}-cover.webp").convert("L")
    ar_t, ar_s = w / h, src.width / src.height
    if ar_s > ar_t:  # source wider — crop a vertical slice around the centre
        cw = int(src.height * ar_t)
        src = src.crop(((src.width - cw) // 2, 0, (src.width + cw) // 2, src.height))
    else:  # source taller — keep the upper-middle band
        ch = int(src.width / ar_t)
        top = int((src.height - ch) * 0.28)
        src = src.crop((0, top, src.width, top + ch))
    g = np.asarray(src.resize((w, h), Image.LANCZOS), float) / 255
    lo, hi = np.percentile(g, [2, 98])
    return np.clip((g - lo) / max(1e-4, hi - lo), 0, 1)


def field_gray(w=W, h=H):
    """Figureless field for `nomos` — smooth low-frequency terrain."""
    rng = np.random.default_rng(11)
    base = rng.random((18, 54))
    img = Image.fromarray((base * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(img, float) / 255


def contours(g):
    """Iso-luminance polylines of the smoothed field — (row, col) arrays."""
    gb = gaussian_filter(g, SIGMA)
    lines = []
    for lvl in LEVELS:
        for c in find_contours(gb, lvl):
            if len(c) >= MIN_LEN:
                lines.append(c)
    return lines


def render(lines, ink_hex, w, h, src_w=W, src_h=H):
    """Draw polylines at AA× then downscale — transparent plate, the page
    supplies the paper."""
    img = Image.new("L", (w * AA, h * AA), 0)
    dr = ImageDraw.Draw(img)
    sx, sy = w * AA / src_w, h * AA / src_h
    width = max(1, int(round(1.1 * AA * (w / W))))
    for ln in lines:
        pts = [(float(x * sx), float(y * sy)) for y, x in ln]
        dr.line(pts, fill=255, width=width, joint="curve")
    img = img.resize((w, h), Image.LANCZOS)
    a = np.asarray(img, float) / 255
    out = np.zeros((*a.shape, 4), np.uint8)
    out[..., :3] = hex_rgb(ink_hex)
    out[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main():
    keys = [f[: -len("-cover.webp")] for f in os.listdir(FIGURES) if f.endswith("-cover.webp")]
    keys.append("nomos")
    for key in sorted(keys):
        parent = key.split("-")[0]
        g = field_gray() if key == "nomos" else load_landscape(key)
        lines = contours(g)
        for theme, palette in INKS.items():
            ink = palette.get(parent, palette["nomos"])
            render(lines, ink, W, H).save(f"{FIGURES}/{key}-plate-{theme}.webp", quality=88)
            render(lines, ink, SM_W, SM_H).save(
                f"{FIGURES}/{key}-plate-sm-{theme}.webp", quality=88
            )
        print(key, len(lines), "lines", flush=True)


if __name__ == "__main__":
    main()
