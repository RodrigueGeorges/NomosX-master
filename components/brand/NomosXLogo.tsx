"use client";

import * as React from "react";
import { LOGO_ACCENT, LOGO_MONO_DEFAULT } from "@/lib/brand/logo-config";
import { LOGO_GLYPHS, LOGO_LAYOUT, logoHeightFromCap, symbolSvgSize } from "@/lib/brand/logo-paths";

type LogoVariant = "lockup" | "symbol" | "wordmark";

export interface NomosXLogoProps {
  variant?: LogoVariant;
  /** Cap height in px. Default: 28. */
  size?: number;
  /** Node uses currentColor instead of accent. */
  mono?: boolean;
  accent?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

const V = LOGO_LAYOUT;

/** Favicon glyph (32x32: lines 9→23, stroke 2.4, dot r=2.5) placed in SVG coords. */
function FaviconX({ cx, cy, scale, accent }: {
  cx: number; cy: number; scale: number; accent: string;
}) {
  // Center the 32x32 favicon glyph at (cx, cy) with given scale
  const x1 = cx - 7 * scale;   // 16-9 = 7
  const y1 = cy - 7 * scale;
  const x2 = cx + 7 * scale;   // 23-16 = 7
  const y2 = cy + 7 * scale;
  const strokeW = 2.4 * scale;
  const dotR = 2.5 * scale;
  return (
    <g style={{ filter: `drop-shadow(0 0 4px rgba(0,0,0,0.25)) drop-shadow(0 0 2px rgba(0,0,0,0.15))` }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={accent} strokeWidth={strokeW} strokeLinecap="round" />
      <line x1={x2} y1={y1} x2={x1} y2={y2}
        stroke={accent} strokeWidth={strokeW} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={dotR} fill={accent} stroke="none" />
    </g>
  );
}

function Wordmark({ x, accent }: { x: number; accent?: string }) {
  const xIndex = LOGO_GLYPHS.length - 1; // X is the last glyph
  const xGlyph = LOGO_GLYPHS[xIndex];

  // Center the favicon glyph where the X letter center would be
  // X glyph center in font coords: x = xGlyph.x + 250, y = 350 (mid cap)
  const xCenterFont = xGlyph.x + 250;
  const yCenterFont = 350;
  // Convert to SVG coords (font → svg: x_svg = x + xFont * S, y_svg = baselineY - yFont * S)
  const xCenterSvg = x + xCenterFont * V.S;
  const yCenterSvg = V.baselineY - yCenterFont * V.S;
  // Scale: favicon is 32 units, cap height is 700 font units = 30 SVG units
  // Use cap height as the favicon size (so favicon is as tall as the letters)
  const favScale = V.capPx / 32;  // 30/32 = 0.9375

  return (
    <>
      {/* "Nomos" — glyphs 0..4 in font coordinates */}
      <g transform={`translate(${x},${V.baselineY}) scale(${V.S},${-V.S})`} fill="currentColor">
        {LOGO_GLYPHS.slice(0, xIndex).map((g, i) => (
          <path key={i} transform={`translate(${g.x},0)`} d={g.d} />
        ))}
      </g>
      {/* Favicon X glyph — centered where X would be, with luminous glow */}
      {accent && (
        <FaviconX cx={xCenterSvg} cy={yCenterSvg} scale={favScale} accent={accent} />
      )}
    </>
  );
}

function Mark({ node }: { node: string }) {
  return (
    <g transform={`translate(${V.pad},${V.symY}) scale(${V.symScale})`}>
      <line x1="7" y1="7" x2="25" y2="25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.2))" }} />
      <line x1="25" y1="7" x2="7" y2="25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.2))" }} />
      <circle cx="16" cy="16" r="2.6" fill={node} />
    </g>
  );
}

export function NomosXLogo({
  variant = "lockup",
  size = 28,
  mono = LOGO_MONO_DEFAULT,
  accent = LOGO_ACCENT,
  className,
  style,
  title = "NomosX",
}: NomosXLogoProps) {
  const node = mono ? "currentColor" : accent;
  const xAccent = accent;
  const h = logoHeightFromCap(size);
  const common = {
    className,
    style: { display: "inline-block", color: "currentColor", ...style } as React.CSSProperties,
    role: "img" as const,
    "aria-label": title,
  };

  if (variant === "symbol") {
    const s = symbolSvgSize(size);
    return (
      <svg {...common} width={s} height={s} viewBox="0 0 32 32">
        <line x1="7" y1="7" x2="25" y2="25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.2))" }} />
        <line x1="25" y1="7" x2="7" y2="25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.2))" }} />
        <circle cx="16" cy="16" r="2.6" fill={node} />
      </svg>
    );
  }

  if (variant === "wordmark") {
    return (
      <svg {...common} height={h} viewBox={`0 0 ${V.Wwm} ${V.H}`}>
        <Wordmark x={V.pad} accent={xAccent} />
      </svg>
    );
  }

  return (
    <svg {...common} height={h} viewBox={`0 0 ${V.Wlock} ${V.H}`}>
      <Mark node={node} />
      <Wordmark x={V.wordX} accent={xAccent} />
    </svg>
  );
}
