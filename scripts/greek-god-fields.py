#!/usr/bin/env python3
"""Generate lib/brand/god-fields.ts — one luminance matrix per public domain.

Each domain gets a thematically-matched classical figure, fetched from
public-domain Wikimedia Commons imagery, sampled to a luminance matrix that
drives GodField.tsx (the figure rendered in Greek letters).

Domains = the public archives taxonomy (ArchivesClient DOMAIN_FILTERS).
Vertical slugs map onto them via VERTICAL_TO_DOMAIN below.

  technology    → Hephaestus/Vulcan — the god-artisan, builder of automata
  economics     → Hermes — god of commerce
  governance    → Zeus of Otricoli — order of the polis
  geopolitics   → Janus — two faces, thresholds, diplomacy
  climate       → Poseidon — the forces of nature
  health        → Asclepius — medicine
  finance       → Juno Moneta — the temple that coined "money"
  security      → Ares — war
"""

import io
import urllib.parse
import urllib.request
from PIL import Image, ImageOps, ImageEnhance

CANDIDATES: dict[str, list[str]] = {
    "technology": [
        "Wenceslas Hollar - The Greek gods. Vulcan.jpg",
        "Hephaestus at the forge.jpg",
        "Vulcan at his forge behind him a bas-relief of Hercules fighting the Hydra LACMA M.88.91.267.jpg",
        "Vulcanus.jpg",
    ],
    "economics": [
        "Bust of Hermes of Olympia Gilliéron EFA-CEG-734.jpg",
        '"Hermes Ingenui" - Marble Roman 2nd C. BC Copy of Greek Original of 5th C. BC (48465231676).jpg',
        "Hermes Altemps Inv8624.jpg",
        "Hermes Ludovisi.jpg",
    ],
    "governance": [
        "Zeus Otricoli Pio-Clementino Inv257.jpg",
        "Bust of Zeus.jpg",
        "Zeus, Pushkin Museum.jpg",
    ],
    "geopolitics": [
        "Janus-Vatican.jpg",
        "Double herm Chiaramonti Inv1395.jpg",
        "Museos Vaticanos - Galería de los Mapas - Busto de Jano - 001.jpg",
        "Le buste de Janus.jpg",
    ],
    "climate": [
        "Bust of Poseidon.jpg",
        "Marble statue of Poseidon from Melos. 125-100 B.C.jpg",
        "Poseidon sculpture Copenhagen 2005.jpg",
    ],
    "health": [
        "Asklepios Leutari Chiaramonti Inv2023.jpg",
        "Ancient Greece Marble Statue of Asclepius, c. 160 AD Roman Copy of 4th C. BC Greek Original, from Sanctuary of Asclepius at Epidauros.jpg",
        "Young Asclepius, statue, AM Epidauros, Epim13.jpg",
        "Asclépiade - Asclepiades - Asclepius CIPA0722.jpg",
    ],
    "finance": [
        "Head of Juno Ludovisi 03.jpg",
        "Juno Sospita Lanuvium.jpg",
        "Juno Louvre Ma485.jpg",
        "Bust of Fortuna.jpg",
    ],
    "security": [
        "Ares Ludovisi Altemps Inv8602.jpg",
        "Arès Borghèse - Musée du Louvre AGER Ma 866 ; MR 65 ; N 819.jpg",
        "2011AresBorgheseLouvre.jpg",
        "Roman statue of Mars.JPG",
    ],
}

# Think-tank vertical slugs → domain key (VERTICALS in lib/think-tank/verticals.ts)
VERTICAL_TO_DOMAIN = {
    "eu-policy": "governance",
    "climate-industry": "climate",
    "ai-labor": "technology",
    "geopolitics": "geopolitics",
    "finance-regulation": "finance",
}

COLS = 56
ROWS = 72
UA = {"User-Agent": "NomosX-design-tool/1.0 (brand asset generation)"}


def fetch(name: str) -> Image.Image:
    url = (
        "https://commons.wikimedia.org/wiki/Special:FilePath/"
        + urllib.parse.quote(name)
        + "?width=480"
    )
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return Image.open(io.BytesIO(r.read())).convert("L")


def to_matrix(img: Image.Image) -> list[list[int]]:
    img = ImageOps.autocontrast(img, cutoff=2)
    img = ImageEnhance.Contrast(img).enhance(1.35)
    w, h = img.size
    target = COLS / ROWS
    crop_h = min(h, int(w / target))
    img = img.crop((0, 0, w, crop_h)).resize((COLS, ROWS), Image.LANCZOS)
    # Glyph density follows luminance — bright becomes ink, dark stays empty.
    # Sources with bright backgrounds (engravings, light backdrops) invert so
    # the *figure* becomes the ink, keeping a consistent "figure in glyphs"
    # language across domains.
    px = img.load()
    grid = [[px[c, r] / 255 for c in range(COLS)] for r in range(ROWS)]
    mean = sum(sum(row) for row in grid) / (COLS * ROWS)
    if mean > 0.5:
        grid = [[1 - v for v in row] for row in grid]
    # Gamma curve — crush mid-tones so the figure reads as a silhouette,
    # not a textured blur of glyphs.
    grid = [[v ** 2.1 for v in row] for row in grid]
    return [[round(v, 2) for v in row] for row in grid]


def main() -> None:
    fields: dict[str, str] = {}
    used: dict[str, str] = {}
    for domain, candidates in CANDIDATES.items():
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
            print(f"[{domain}] FAILED — no candidate fetched, domain omitted")
            continue
        grid = to_matrix(img)
        fields[domain] = ",".join(str(int(v * 100)) for row in grid for v in row)

    lines = [
        "/**",
        " * GodFields — one luminance matrix per public domain, each sampled",
        " * from a public-domain classical figure (Wikimedia Commons).",
        " * Rendered as Greek glyphs by components/signature/GodField.tsx.",
        " * Generated by scripts/greek-god-fields.py.",
        " *",
        " * Sources:",
        *[f" *   {d}: {name}" for d, name in used.items()],
        " */",
        f"export const GOD_COLS = {COLS};",
        f"export const GOD_ROWS = {ROWS};",
        "",
        "export const GOD_FIELDS: Record<string, number[]> = {",
        *[f'  "{d}": [{flat}],' for d, flat in fields.items()],
        "};",
        "",
        "/** Think-tank vertical slug → domain key. */",
        "export const VERTICAL_TO_DOMAIN: Record<string, string> = {",
        *[f'  "{k}": "{v}",' for k, v in VERTICAL_TO_DOMAIN.items()],
        "};",
        "",
        "/** Vertical display names → domain key (publications carry the name, not the slug). */",
        "const VERTICAL_NAME_TO_DOMAIN: Record<string, string> = {",
        '  "eupolicy": "governance",',
        '  "politiqueeuropenne": "governance",',
        '  "climateindustry": "climate",',
        '  "climatindustrie": "climate",',
        '  "ailabor": "technology",',
        '  "iatravail": "technology",',
        '  "geopolitics": "geopolitics",',
        '  "gopolitique": "geopolitics",',
        '  "financeregulation": "finance",',
        '  "financergulation": "finance",',
        "};",
        "",
        "/** French display names — accents are stripped by _norm (é→e is NOT kept). */",
        "const FR_NAME_TO_DOMAIN: Record<string, string> = {",
        '  "technologie": "technology",',
        '  "conomie": "economics",',
        '  "gouvernance": "governance",',
        '  "climat": "climate",',
        '  "sant": "health",',
        '  "scurit": "security",',
        "};",
        "",
        "/** Free-form sub-domain keywords → cover key (\"domain\" or \"domain-sub\").",
        " * Sub keys map to a dedicated artwork; resolveDomainKey strips the suffix",
        " * to the parent domain. Scored by longest matching hint. */",
        "const SUB_DOMAIN_HINTS: [string, string[]][] = [",
        '  ["finance-crypto", ["crypto", "stablecoin", "cbdc", "bitcoin", "token", "blockchain", "ethereum", "defi"]],',
        '  ["health-pandemic", ["pandemic", "epidemic", "virus", "vaccin", "pathogen", "outbreak"]],',
        '  ["health-pharma", ["pharma", "drug", "medicin", "biotech", "clinical", "therapeutic"]],',
        '  ["security-nuclear", ["nuclear", "atomic", "warhead", "proliferation", "deterren"]],',
        '  ["security-war", ["war", "militar", "defen", "conflict", "army", "battle", "missile", "troop", "invasion", "weapon"]],',
        '  ["security-surveil", ["surveil", "espion", "cyber", "spy", "monitor", "tracking", "privacy"]],',
        '  ["climate-energy", ["energy", "renewable", "solar", "wind", "grid", "electric", "oil", "gas"]],',
        '  ["technology-ai", ["artificial", "intellig", "algorithm", "machinelearn", "robot", "neural", "openai", "deepseek", "chatgpt", "llm"]],',
        '  ["technology-space", ["space", "satellite", "orbit", "rocket", "lunar", "launch"]],',
        '  ["technology-infra", ["infrastruct", "construct", "housing", "build", "bridge", "transport"]],',
        '  ["geopolitics-diplomacy", ["diplom", "treaty", "summit", "alliance", "negotiat", "sanction", "ambassador"]],',
        '  ["geopolitics-migration", ["migrat", "border", "refuge", "asylum", "diaspora"]],',
        '  ["economics-trade", ["trade", "supply", "tariff", "commerce", "custom", "export", "import", "shipping"]],',
        '  ["economics-labor", ["labor", "labour", "employ", "worker", "union", "wage", "automat", "job"]],',
        '  ["economics-agriculture", ["agricult", "food", "farm", "hunger", "crop", "grain"]],',
        '  ["governance-law", ["election", "democr", "parliament", "legisl", "court", "justice", "vote", "constitut", "regul"]],',
        '  ["finance", ["financ", "bank", "monetary", "debt", "fiscal", "bond", "capital", "invest", "insur", "currency", "dollar", "payment"]],',
        '  ["health", ["health", "medic", "disease", "hospital", "mental", "care"]],',
        '  ["climate", ["climat", "carbon", "emission", "decarbon", "biodiv", "environ", "green", "methane", "fossil"]],',
        '  ["security", ["secur", "terror", "intel", "nav"]],',
        '  ["technology", ["techn", "software", "comput", "digital", "quantum", "semiconductor", "chip", "model", "data"]],',
        '  ["geopolitics", ["geopolit", "nato", "territ", "foreign", "china", "russia", "ukraine", "taiwan", "influence", "power"]],',
        '  ["economics", ["econom", "inflation", "growth", "market", "industr", "recession", "competition", "antitrust", "productiv"]],',
        '  ["governance", ["govern", "policy", "polic", "institut", "directive", "admin", "public"]],',
        "];",
        "",
        "const _norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');",
        "const _DOMAIN_KEYS = Object.keys(GOD_FIELDS);",
        "",
        "/**",
        " * Resolve a domain slug, vertical slug, display name or free-form topic",
        " * label to its canonical cover key. Order: exact domain key → vertical",
        " * slug → vertical/FR display name → substring match on a domain key →",
        " * sub-domain keyword hints (longest match wins).",
        " */",
        "function _match(key: string | null | undefined): string | undefined {",
        "  if (!key) return undefined;",
        "  const k = _norm(key);",
        "  if (GOD_FIELDS[k]) return k;",
        "  const direct =",
        "    VERTICAL_TO_DOMAIN[key] ??",
        "    VERTICAL_TO_DOMAIN[k] ??",
        "    VERTICAL_NAME_TO_DOMAIN[k] ??",
        "    FR_NAME_TO_DOMAIN[k] ??",
        "    _DOMAIN_KEYS.find((d) => k === d || k.includes(d) || d.includes(k));",
        "  if (direct) return direct;",
        "  let best: string | undefined;",
        "  let bestLen = 0;",
        "  for (const [dom, hints] of SUB_DOMAIN_HINTS) {",
        "    for (const h of hints) {",
        "      if (k.includes(h) && h.length > bestLen) {",
        "        best = dom;",
        "        bestLen = h.length;",
        "      }",
        "    }",
        "  }",
        "  return best;",
        "}",
        "",
        "export function resolveDomainKey(key: string | null | undefined): string | undefined {",
        "  return _match(key)?.split(\"-\")[0];",
        "}",
        "",
        "/** Like resolveDomainKey but keeps the sub-domain suffix — the key whose",
        " * dedicated cover may exist in public/figures/. */",
        "export function resolveCoverKey(key: string | null | undefined): string | undefined {",
        "  return _match(key);",
        "}",
        "",
        "export function godFieldFor(key: string | null | undefined): number[] | undefined {",
        "  const d = resolveDomainKey(key);",
        "  return d ? GOD_FIELDS[d] : undefined;",
        "}",
        "",
    ]

    path = "lib/brand/god-fields.ts"
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"wrote {path} — {len(fields)} fields ({COLS}x{ROWS})")


if __name__ == "__main__":
    main()
