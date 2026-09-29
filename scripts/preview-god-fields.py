"""Render the generated god-fields matrices to preview PNGs.

Approximates components/signature/GodField.tsx: each luminance cell becomes a
Greek glyph whose opacity follows luminance. Output: preview/god-<domain>.png
"""
import json
import random
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

GREEK = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ"
CELL = 6
DOMAIN_COLORS = {
    "technology": "#0EA5E9",
    "economics": "#6366F1",
    "governance": "#8B5CF6",
    "geopolitics": "#EF4444",
    "climate": "#14B8A6",
    "health": "#10B981",
    "finance": "#F97316",
    "security": "#F59E0B",
}

src = Path("lib/brand/god-fields.ts").read_text(encoding="utf-8")
fields = {
    m.group(1): json.loads(f"[{m.group(2)}]")
    for m in re.finditer(r'"(\w+)": \[([\d,]+)\]', src)
}

cols, rows = 56, 72
out = Path("preview")
out.mkdir(exist_ok=True)

font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", CELL)

for domain, flat in fields.items():
    rng = random.Random(len(domain) * 7)
    img = Image.new("RGB", (cols * CELL, rows * CELL), "white")
    draw = ImageDraw.Draw(img, "RGBA")
    color = DOMAIN_COLORS[domain]
    for i, v in enumerate(flat):
        d = v / 100
        if d < 0.09:
            continue
        alpha = int(255 * (d ** 1.45) * 0.85)
        r, c = divmod(i, cols)
        draw.text(
            (c * CELL, r * CELL - 1),
            rng.choice(GREEK),
            font=font,
            fill=color + f"{alpha:02x}",
        )
    img.save(out / f"god-{domain}.png")
    print(f"preview/god-{domain}.png")

# Contact sheet
sheet = Image.new("RGB", (cols * CELL * 4, rows * CELL * 2), "white")
for i, domain in enumerate(fields):
    tile = Image.open(out / f"god-{domain}.png")
    sheet.paste(tile, ((i % 4) * cols * CELL, (i // 4) * rows * CELL))
sheet.save(out / "god-fields-all.png")
print("preview/god-fields-all.png")
