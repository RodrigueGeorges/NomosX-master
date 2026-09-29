#!/usr/bin/env python3
"""Generate mythological domain covers — public/figures/<domain>-cover.webp

Each public domain gets a major mythological painting or antiquity fresco
(Wikimedia Commons, public domain), treated with the NomosX DA: warm grade,
paper-bright highlights, subtle grain, engraved plate frame. Color kept.

  technology   → Velázquez, The Forge of Vulcan
  economics    → Velázquez, Mercury and Argus (commerce)
  governance   → Ingres, Jupiter and Thetis (power, supplication)
  geopolitics  → Rubens, Peace and War (Minerva vs Mars — diplomacy)
  climate      → Turner, Ulysses Deriding Polyphemus (sun, sea, hubris)
  health       → Creti, The Education of Achilles by Chiron
  finance      → Titian, Danaë Receiving the Golden Rain
  security     → David, Leonidas at Thermopylae

Cover: 1400×560 full-bleed — the EMPN-style hero band. Rendered w-full
h-auto so the scene is never cropped.
Requires: pip install pillow
"""

import io
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

CANDIDATES: dict[str, list[str]] = {
    "technology": [
        "Diego Velázquez - The Forge of Vulcan - WGA24376.jpg",
        "Velázquez - La Fragua de Vulcano (Museo del Prado, 1630).jpg",
        "The Fall of Icarus, fresco from Pompeii, 40-79 AD.png",
    ],
    "economics": [
        "Diego Velázquez - Mercury and Argus - WGA24471.jpg",
        "Fábula de Mercurio y Argos, by Diego Velázquez.jpg",
        "Fresco of Mercury-Hermes, Pompeii.jpg",
    ],
    "governance": [
        "Jupiter and Thetis (Ingres).jpg",
        "Jupiter et Thetis Ingres 1812.jpg",
    ],
    "geopolitics": [
        "Peter Paul Rubens (1577-1640) Peace and War (1629).jpg",
        "Rubens peace-war.jpg",
        "Peter Paul Rubens - Allegory on the Blessings of Peace - WGA20333.jpg",
        "Arte romana, affreschi con storie dell'odissea da via graziosa, 50 ac ca. (musei vaticani) 01.jpg",
    ],
    "climate": [
        "Joseph Mallord William Turner - Ulysses Deriding Polyphemus - WGA23185.jpg",
        "Turner - Ulysses deriding Polyphemus 1829.jpg",
        "London National Gallery Turner Ulysses deriding Polyphemus.jpg",
        "Neptune Amphitrite mosaic Herculaneum.jpg",
    ],
    "health": [
        "Donato Creti, The Education of Achilles by Chiron.jpg",
        "Klimt-medizin.jpg",
        "Chiron instructs young Achilles - Ancient Roman fresco.jpg",
        "Asclepius and hygieia relief.jpg",
    ],
    "finance": [
        "Tizian - Danae receiving the Golden Rain - Prado.jpg",
        "Titian - Danaë with a Nurse - WGA22878.jpg",
        "Tizian - Danae receiving the Golden Rain - Prado (cropped).jpg",
    ],
    "security": [
        "Jacques-Louis David - Leonidas at Thermopylae - WGA6095.jpg",
        "Leonidas at Thermopylae, 1814, by Jacques-Louis David, depicting Sparta's King Leonidas before the Battle of Thermopylae. (11606613584).jpg",
        "Alexander the Great mosaic.jpg",
    ],
    # ---- Sub-domains — one dedicated mythological scene each ----
    "technology-ai": [          # artificial life — Pygmalion sculpts Galatea
        "Pygmalion and Galatea MET DT1969.jpg",
        "Jean-Léon Gérôme, Pygmalion and Galatea, ca. 1890.jpg",
    ],
    "technology-space": [       # hubris of the sun chariot
        "Peter Paul Rubens - The Fall of Phaeton (National Gallery of Art).jpg",
        "Sir Peter Paul Rubens, The Fall of Phaeton, c. 1604-1605, probably reworked c. 1606-1608, NGA 71349.jpg",
    ],
    "technology-infra": [       # Icarus fallen — engineering's ambition
        "Herbert Draper - The Lament for Icarus - Google Art Project.jpg",
        "I.9.5 Pompeii. March 2009. Room 10, triclinium. East wall with painting of Daedalus and Icarus..jpg",
    ],
    "finance-crypto": [         # Midas — the golden touch, wealth beyond measure
        "Nicolas Poussin - Midas and Bacchus - WGA18272.jpg",
        "Midas und Bacchus, um 1624.jpg",
        "Nicolas Poussin - Midas devant Bacchus.jpg",
    ],
    "climate-energy": [         # Aurora — dawn, light, the sun harnessed
        "Guido Reni - Aurora - WGA19273.jpg",
        "Guido Reni 010.jpg",
        "Guido Reni 009.jpg",
    ],
    "security-war": [           # Alexander Mosaic — the canonical battle
        "Alexander the Great mosaic.jpg",
        "Battle of Issus mosaic (from Pompeii).jpg",
    ],
    "security-nuclear": [       # Pandora's box — the force once opened
        "Pandora - John William Waterhouse.jpg",
        "John William Waterhouse - Pandora, 1896.jpg",
    ],
    "security-surveil": [       # Juno receives Argus's hundred eyes
        "Hendrick Goltzius 019.jpg",
        "Diego Velázquez - Mercury and Argus - WGA24471.jpg",
    ],
    "health-pandemic": [        # the plague in the ancient city
        "Plague in an Ancient City LACMA AC1997.10.1 (1 of 2).jpg",
        "Michiel Sweerts and Workshop - Plague in an Ancient City.jpg",
    ],
    "health-pharma": [          # Medea brewing — potions, drugs, chemistry
        "Medea - Frederick Sandys - Google Cultural Institute.jpg",
        "Frederick Sandys - Medea, 1866-1868.jpg",
        "Medea-Sandys.jpg",
    ],
    "geopolitics-diplomacy": [  # the Judgement of Paris — arbitration between powers
        "Rubens - Judgement of Paris.jpg",
        "The Judgement of Paris by Follower of Peter Paul Rubens.jpg",
    ],
    "geopolitics-migration": [  # Europa carried across the sea — Titian
        "Titian - The Rape of Europa.jpeg",
        "Rape of Europa from Casa di Giasone (Pompeii).jpg",
    ],
    "economics-trade": [        # Mercury, god of merchants
        "Fresco of Mercury-Hermes, Pompeii.jpg",
    ],
    "economics-labor": [        # Sisyphus — labor without end
        "Titian - Sisyphus - Madrid - Prado.jpg",
        "Punishment sisyph.jpg",
    ],
    "economics-agriculture": [  # Ceres/Demeter — harvest, grain, food
        "Venus, Ceres and Bacchus.jpg",
        "Jan Brueghel II and Hendrick van Balen - Venus, Bacchus and Ceres feasting in a wooded glade.jpg",
    ],
    "governance-law": [         # Solon, the lawgiver, before Croesus
        "Solon before Croesus by Nicolaes Knüpfer, Getty Center.JPG",
        "Knüpfer, Nikolaus - Solon before Croesus - Google Art Project.jpg",
        "Honthorst (after) - Solon before Croesus, 9838.jpg",
    ],
}

PAPER = (245, 241, 232)   # warm stone paper
INK = (26, 24, 20)        # warm near-black

# Artwork credit shown under the hero — institutional norm.
META: dict[str, tuple[str, str, str]] = {
    # key: (artwork title, artist, venue)
    "technology": ("The Forge of Vulcan", "Diego Velázquez, 1630", "Museo del Prado"),
    "economics": ("Mercury and Argus", "Diego Velázquez, 1659", "Museo del Prado"),
    "governance": ("Jupiter and Thetis", "Jean-Auguste-Dominique Ingres, 1811", "Musée Granet"),
    "geopolitics": ("Peace and War", "Peter Paul Rubens, 1629", "National Gallery, London"),
    "climate": ("Ulysses Deriding Polyphemus", "J.M.W. Turner, 1829", "National Gallery, London"),
    "health": ("The Education of Achilles by Chiron", "Donato Creti, 1714", "Pinacoteca Nazionale, Bologna"),
    "finance": ("Danaë Receiving the Golden Rain", "Titian, 1553–54", "Museo del Prado"),
    "security": ("Leonidas at Thermopylae", "Jacques-Louis David, 1814", "Musée du Louvre"),
    "technology-ai": ("Pygmalion and Galatea", "Jean-Léon Gérôme, c. 1890", "Metropolitan Museum"),
    "technology-space": ("The Fall of Phaeton", "Peter Paul Rubens, c. 1604–08", "National Gallery of Art"),
    "technology-infra": ("The Lament for Icarus", "Herbert Draper, 1898", "Tate"),
    "finance-crypto": ("Midas and Bacchus", "Nicolas Poussin, c. 1624", "Alte Pinakothek"),
    "climate-energy": ("Aurora", "Guido Reni, 1614", "Casino Rospigliosi"),
    "security-war": ("The Alexander Mosaic", "Roman mosaic, c. 100 BC", "Museo Archeologico, Naples"),
    "security-nuclear": ("Pandora", "John William Waterhouse, 1896", "Private collection"),
    "security-surveil": ("Juno and Argus", "Hendrick Goltzius, 1615", "Museum Boijmans"),
    "health-pandemic": ("Plague in an Ancient City", "Michael Sweerts, c. 1652", "LACMA"),
    "health-pharma": ("Medea", "Frederick Sandys, 1868", "Birmingham Museums"),
    "geopolitics-diplomacy": ("The Judgement of Paris", "Peter Paul Rubens, c. 1632–35", "National Gallery, London"),
    "geopolitics-migration": ("The Rape of Europa", "Titian, 1560–62", "Isabella Stewart Gardner Museum"),
    "economics-trade": ("Mercury", "Roman fresco, 1st c. AD", "Pompeii"),
    "economics-labor": ("Sisyphus", "Titian, 1548–49", "Museo del Prado"),
    "economics-agriculture": ("Venus, Ceres and Bacchus", "Rubens circle, c. 1620s", "—"),
    "governance-law": ("Solon before Croesus", "Nikolaus Knüpfer, c. 1652", "Getty Center"),
}
UA = {"User-Agent": "NomosX-design-tool/1.0 (brand asset generation)"}

COVER = (1400, 560)


def fetch(name: str) -> Image.Image:
    url = (
        "https://commons.wikimedia.org/wiki/Special:FilePath/"
        + urllib.parse.quote(name)
        + "?width=1600"
    )
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def warm_grade(img: Image.Image) -> Image.Image:
    """Unify the corpus — warm highlights (paper), cool-protected shadows."""
    r, g, b = img.split()
    r = r.point(lambda v: min(255, int(v * 1.04 + 4)))
    b = b.point(lambda v: int(v * 0.94))
    return Image.merge("RGB", (r, g, b))


def plate_frame(img: Image.Image, inset: int = 14, tick: int = 40) -> Image.Image:
    """Engraving plate mark — hairline inner frame + corner ticks."""
    w, h = img.size
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([inset, inset, w - inset - 1, h - inset - 1], outline=(*INK, 95), width=1)
    i2 = inset + 5
    d.rectangle([i2, i2, w - i2 - 1, h - i2 - 1], outline=(*INK, 42), width=1)
    for cx, cy, sx, sy in (
        (inset, inset, 1, 1),
        (w - inset - 1, inset, -1, 1),
        (inset, h - inset - 1, 1, -1),
        (w - inset - 1, h - inset - 1, -1, -1),
    ):
        d.line([cx, cy, cx + tick * sx, cy], fill=(*INK, 150), width=2)
        d.line([cx, cy, cx, cy + tick * sy], fill=(*INK, 150), width=2)
    return img


def painted(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Crop → warm grade → gentle contrast → vignette → plate frame."""
    w, h = img.size
    img = img.crop((int(w * 0.02), int(h * 0.02), int(w * 0.98), int(h * 0.98)))
    img = ImageOps.fit(img, size, Image.LANCZOS, centering=(0.5, 0.22))
    img = ImageOps.autocontrast(img, cutoff=1)
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Color(img).enhance(1.06)
    img = warm_grade(img)

    # Paper-tinted vignette — the edges fall back to the page.
    vig = Image.new("L", size, 0)
    d = ImageDraw.Draw(vig)
    d.ellipse([-size[0] * 0.25, -size[1] * 0.45, size[0] * 1.25, size[1] * 1.45], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(90))
    paper_img = Image.new("RGB", size, PAPER)
    img = Image.composite(img, paper_img, vig.point(lambda v: min(255, int(v * 1.35))))

    return plate_frame(img)


def main() -> None:
    out = Path("public/figures")
    out.mkdir(parents=True, exist_ok=True)
    generated: list[str] = []
    for key, candidates in CANDIDATES.items():
        time.sleep(6)  # Commons rate-limits bursts
        img = None
        for name in candidates:
            try:
                img = fetch(name)
                print(f"[{key}] using {name}")
                break
            except Exception as e:  # noqa: BLE001
                print(f"[{key}] skip {name}: {e}")
        if img is None:
            print(f"[{key}] FAILED - no candidate fetched, domain omitted")
            continue

        painted(img, COVER).save(out / f"{key}-cover.webp", quality=88, method=6)
        generated.append(key)
        print(f"  -> public/figures/{key}-cover.webp")

    # Manifest consumed by lib/brand/domain-figures.ts — only keys whose
    # cover actually exists resolve to a URL; others fall back to parent.
    manifest = Path("lib/brand/cover-manifest.ts")
    manifest.write_text(
        "/**\n"
        " * Generated by scripts/domain-figures.py — keys whose\n"
        " * public/figures/<key>-cover.webp asset exists.\n"
        " */\n"
        "export const COVER_KEYS = new Set<string>([\n"
        + "".join(f'  "{k}",\n' for k in generated)
        + "]);\n\n"
        + "/** Artwork credit — title, artist+date, venue. */\n"
        + "export const COVER_META: Record<string, { title: string; credit: string }> = {\n"
        + "".join(
            f'  "{k}": {{ title: {META[k][0]!r}, credit: {(META[k][1] + " — " + META[k][2])!r} }},\n'
            for k in generated if k in META
        )
        + "};\n",
        encoding="utf-8",
    )
    print(f"wrote {manifest} - {len(generated)} covers")


if __name__ == "__main__":
    main()
