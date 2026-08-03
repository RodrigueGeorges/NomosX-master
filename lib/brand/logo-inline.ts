import { LOGO_ACCENT } from "./logo-config";
import { LOGO_GLYPHS, LOGO_LAYOUT, logoHeightFromCap } from "./logo-paths";

function nodeFill(mono: boolean, accent: string): string {
  return mono ? "currentColor" : accent;
}

function glyphPathsHtml(accent?: string): string {
  const xIndex = LOGO_GLYPHS.length - 1;
  return LOGO_GLYPHS.map((g, i) => {
    if (i === xIndex && accent) {
      // Geometric X — two crossing lines + center dot (matches symbol mark)
      return `<g transform="translate(${g.x},0)">
        <line x1="50" y1="700" x2="450" y2="0" stroke="${accent}" stroke-width="88" stroke-linecap="round" fill="none"/>
        <line x1="450" y1="700" x2="50" y2="0" stroke="${accent}" stroke-width="88" stroke-linecap="round" fill="none"/>
        <circle cx="250" cy="350" r="28" fill="${accent}" stroke="none"/>
      </g>`;
    }
    return `<path transform="translate(${g.x},0)" d="${g.d}"/>`;
  }).join("");
}

function wordmarkGroup(x: number, accent?: string): string {
  const V = LOGO_LAYOUT;
  return `<g transform="translate(${x},${V.baselineY}) scale(${V.S},${-V.S})" fill="currentColor">${glyphPathsHtml(accent)}</g>`;
}

function markGroup(node: string): string {
  const V = LOGO_LAYOUT;
  return `<g transform="translate(${V.pad},${V.symY}) scale(${V.symScale})">
  <line x1="7" y1="7" x2="25" y2="25" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
  <line x1="25" y1="7" x2="7" y2="25" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="2.6" fill="${node}"/>
</g>`;
}

export function inlineSymbolSvg(
  capHeight: number,
  opts: { mono?: boolean; accent?: string } = {}
): string {
  const mono = opts.mono ?? true;
  const accent = opts.accent ?? LOGO_ACCENT;
  const s = capHeight * 1.42;
  const node = nodeFill(mono, accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.toFixed(2)}" height="${s.toFixed(2)}" viewBox="0 0 32 32" fill="none" aria-hidden="true" role="img">
  <line x1="7" y1="7" x2="25" y2="25" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
  <line x1="25" y1="7" x2="7" y2="25" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="2.6" fill="${node}"/>
</svg>`;
}

export function inlineWordmarkSvg(capHeight: number, accent?: string): string {
  const V = LOGO_LAYOUT;
  const h = logoHeightFromCap(capHeight);
  const w = (h / V.H) * V.Wwm;
  const ac = accent ?? LOGO_ACCENT;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="0 0 ${V.Wwm} ${V.H}" fill="currentColor" aria-hidden="true" role="img">
  ${wordmarkGroup(V.pad, ac)}
</svg>`;
}

export function inlineLockupSvg(
  capHeight: number,
  opts: { mono?: boolean; accent?: string } = {}
): string {
  const mono = opts.mono ?? true;
  const accent = opts.accent ?? LOGO_ACCENT;
  const V = LOGO_LAYOUT;
  const h = logoHeightFromCap(capHeight);
  const w = (h / V.H) * V.Wlock;
  const node = nodeFill(mono, accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="0 0 ${V.Wlock} ${V.H}" fill="none" aria-label="NomosX" role="img">
  ${markGroup(node)}
  ${wordmarkGroup(V.wordX, accent)}
</svg>`;
}

export function emailLogoHeaderHtml(capHeight = 20): string {
  return `<div style="line-height:0;margin:0 auto 8px;width:fit-content;color:#ffffff;">${inlineWordmarkSvg(capHeight)}</div>`;
}
