#!/usr/bin/env python3
"""Generate lib/brand/fresco-fields.ts — landscape luminance matrices of
Greek-mythology frescoes, rendered as Greek glyphs by GodField.tsx (the
NomosX DA: the figure is made of letters).

Sources — antiquity frescoes/mosaics/reliefs, public domain (Wikimedia):

  technology   → The Fall of Icarus — fresco, Pompeii (Daedalus & Icarus)
  economics    → Mercury/Hermes — fresco, Pompeii
  governance   → Jupiter and Thetis — Ingres (Zeus enthroned, supplication)
  geopolitics  → Abduction of Europa — fresco, House of Jason, Pompeii
  climate      → Neptune & Amphitrite — mosaic, Herculaneum
  health       → Asclepius & Hygieia — votive relief
  finance      → Tyche-Fortuna — marble statue, MET
  security     → Alexander Mosaic (Battle of Issus) — mosaic, Pompeii

Wide grid (192x52) so fitWidth canvases keep glyphs ~4px on article covers.
Requires: pip install pillow
"""

import io
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

CANDIDATES: dict[str, list[str]] = {
    "technology": [
        "The Fall of Icarus, fresco from Pompeii, 40-79 AD.png",
        "I.9.5 Pompeii. March 2009. Room 10, triclinium. East wall with painting of Daedalus and Icarus..jpg",
        "Wenceslas Hollar - The Greek gods. Vulcan.jpg",
    ],
    "economics": [
        "Fresco of Mercury-Hermes, Pompeii.jpg",
        "Bust of Hermes of Olympia Gilliéron EFA-CEG-734.jpg",
    ],
    "governance": [
        "Jupiter and Thetis (Ingres).jpg",
        "Jupiter et Thetis Ingres 1812.jpg",
        "Zeus Otricoli Pio-Clementino Inv257.jpg",
    ],
    "geopolitics": [
        "Rape of Europa from Casa di Giasone (Pompeii).jpg",
        "Europa & the Bull Fresco (49345540597).jpg",
        "Wall painting - Europa and the bull - Pompeii (IX 5 18-21) - Napoli MAN 111475 - 02.jpg",
        "Janus-Vatican.jpg",
    ],
    "climate": [
        "Neptune Amphitrite mosaic Herculaneum.jpg",
        "Mosaic of Neptune and Amphitrite.jpg",
        "Herculaneum Neptune And Amphitrite 2.jpg",
        "Bust of Poseidon.jpg",
    ],
    "health": [
        "Asclepius and hygieia relief.jpg",
        "IAM 109T - Relief of Asclepius and Hygieia.jpg",
        "Asklepios Leutari Chiaramonti Inv2023.jpg",
    ],
    "finance": [
        "Marble statue of Tyche-Fortuna restored with the portrait head of a woman MET DP229179.jpg",
        "Head of Juno Ludovisi 03.jpg",
    ],
    "security": [
        "Alexander the Great mosaic.jpg",
        "Battle of Issus mosaic (from Pompeii).jpg",
        "The Alexander Mosaic depicting the Battle of Issus between Alexander the Great & Darius III of Persia, from the House of the Faun in Pompeii, Naples Archaeological Museum (15045954695).jpg",
        "Ares Ludovisi Altemps Inv8602.jpg",
    ],
}

COLS = 192
ROWS = 52
UA = {"User-Agent": "NomosX-design-tool/1.0 (brand asset generation)"}


def fetch(name: str) -> Image.Image:
    url = (
        "https://commons.wikimedia.org/wiki/Special:FilePath/"
        + urllib.parse.quote(name)
        + "?width=1400"
    )
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return Image.open(io.BytesIO(r.read())).convert("L")


def to_matrix(img: Image.Image) -> list[list[int]]:
    w, h = img.size
    # Drop photo borders/museum frames — frescoes are often shot framed.
    img = img.crop((int(w * 0.04), int(h * 0.04), int(w * 0.96), int(h * 0.96)))
    w, h = img.size
    target = COLS / ROWS
    if w / h > target:  # too wide — crop sides
        crop_w = int(h * target)
        x0 = (w - crop_w) // 2
        img = img.crop((x0, 0, x0 + crop_w, h))
    else:  # too tall — crop top/bottom, bias to center
        crop_h = int(w / target)
        img = img.crop((0, max(0, int((h - crop_h) * 0.45)), w, max(0, int((h - crop_h) * 0.45)) + crop_h))
    img = img.resize((COLS, ROWS), Image.LANCZOS)
    # Frescoes are low-contrast mid-tone — equalize spreads the histogram
    # so the scene's structure survives the glyph threshold.
    img = ImageOps.autocontrast(img, cutoff=1)
    img = ImageOps.equalize(img)
    img = img.filter(ImageFilter.UnsharpMask(2, 120, 2))
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    px = img.load()
    grid = [[px[c, r] / 255 for c in range(COLS)] for r in range(ROWS)]
    # Glyph density follows luminance — bright becomes ink. Sources with
    # bright backgrounds invert so the figure carries the glyphs.
    mean = sum(sum(row) for row in grid) / (COLS * ROWS)
    if mean > 0.55:
        grid = [[1 - v for v in row] for row in grid]
    grid = [[v ** 1.35 for v in row] for row in grid]
    # Cut the speckle floor — equalized photo backgrounds otherwise
    # render as grey noise. Below ~24% there is no figure, only texture.
    FLOOR = 0.24
    grid = [[0 if v < FLOOR else (v - FLOOR) / (1 - FLOOR) for v in row] for row in grid]
    return [[round(v, 2) for v in row] for row in grid]


def main() -> None:
    fields: dict[str, str] = {}
    used: dict[str, str] = {}
    for domain, candidates in CANDIDATES.items():
        time.sleep(6)  # Commons rate-limits bursts
        img = None
        for name in candidates:
            try:
                img = fetch(name)
                used[domain] = name
                print(f"[{domain}] using {name}")
                break
            except Exception as e:  # noqa: BLE001
                print(f"[{domain}] skip {name}: {e}")
        if img is None:
            print(f"[{domain}] FAILED - no candidate fetched, domain omitted")
            continue
        grid = to_matrix(img)
        fields[domain] = ",".join(str(int(v * 100)) for row in grid for v in row)

    lines = [
        "/**",
        " * FrescoFields — landscape luminance matrices of Greek-mythology",
        " * frescoes (public domain, Wikimedia), rendered as Greek glyphs by",
        " * components/signature/GodField.tsx in fitWidth mode.",
        " * Generated by scripts/fresco-fields.py.",
        " *",
        " * Sources:",
        *[f" *   {d}: {name}" for d, name in used.items()],
        " */",
        'import { resolveDomainKey } from "./god-fields";',
        "",
        f"export const FRESCO_COLS = {COLS};",
        f"export const FRESCO_ROWS = {ROWS};",
        "",
        "export const FRESCO_FIELDS: Record<string, number[]> = {",
        *[f'  "{d}": [{flat}],' for d, flat in fields.items()],
        "};",
        "",
        "/** Resolve any domain/vertical/topic label to its fresco matrix. */",
        "export function frescoFieldFor(key: string | null | undefined): number[] | undefined {",
        "  const d = resolveDomainKey(key);",
        "  return d ? FRESCO_FIELDS[d] : undefined;",
        "}",
        "",
    ]

    path = "lib/brand/fresco-fields.ts"
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"wrote {path} - {len(fields)} fields ({COLS}x{ROWS})")


if __name__ == "__main__":
    main()
