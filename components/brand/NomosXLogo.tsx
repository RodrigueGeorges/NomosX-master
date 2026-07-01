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

function Wordmark({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},${V.baselineY}) scale(${V.S},${-V.S})`} fill="currentColor">
      {LOGO_GLYPHS.map((g, i) => (
        <path key={i} transform={`translate(${g.x},0)`} d={g.d} />
      ))}
    </g>
  );
}

function Mark({ node }: { node: string }) {
  return (
    <g transform={`translate(${V.pad},${V.symY}) scale(${V.symScale})`}>
      <line x1="7" y1="7" x2="25" y2="25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="25" y1="7" x2="7" y2="25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
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
        <line x1="7" y1="7" x2="25" y2="25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <line x1="25" y1="7" x2="7" y2="25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="16" cy="16" r="2.6" fill={node} />
      </svg>
    );
  }

  if (variant === "wordmark") {
    return (
      <svg {...common} height={h} viewBox={`0 0 ${V.Wwm} ${V.H}`}>
        <Wordmark x={V.pad} />
      </svg>
    );
  }

  return (
    <svg {...common} height={h} viewBox={`0 0 ${V.Wlock} ${V.H}`}>
      <Mark node={node} />
      <Wordmark x={V.wordX} />
    </svg>
  );
}
