"use client";

/**
 * GodField — a classical Athena bust rendered entirely in Greek letters.
 *
 * The luminance matrix (lib/brand/athena-field.ts, sampled from a
 * public-domain Met Museum photograph) drives per-cell glyph opacity:
 * bright marble becomes dense ink, darkness stays empty. The goddess of
 * wisdom is literally made of letters — From Chaos to Nomos.
 *
 * A gentle shimmer swaps a few glyphs per second so the figure breathes.
 */

import { useEffect, useRef } from "react";
import { ATHENA_COLS, ATHENA_ROWS, ATHENA_FIELD } from "@/lib/brand/athena-field";

const GREEK = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function GodField({
  field = ATHENA_FIELD,
  cols = ATHENA_COLS,
  rows = ATHENA_ROWS,
  cell = 10,
  strength = 1,
  seed = 5,
  shimmer = true,
  fitWidth = false,
  ink = "#0a0a0f",
  className,
}: {
  /** Luminance matrix (0-100 per cell), row-major. */
  field?: number[];
  cols?: number;
  rows?: number;
  /** Cell size in px. */
  cell?: number;
  /** Global ink strength 0-1. */
  strength?: number;
  seed?: number;
  shimmer?: boolean;
  /** Stretch the canvas to 100% width — full-bleed fresco mode. */
  fitWidth?: boolean;
  /** Glyph ink color — e.g. a warm stone sepia for fresco rendering. */
  ink?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cols * cell;
    const H = rows * cell;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = fitWidth ? "100%" : `${W}px`;
    canvas.style.height = fitWidth ? "auto" : `${H}px`;
    ctx.scale(dpr, dpr);

    const heading =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--nx-font-heading")
        .trim() || "serif";
    ctx.font = `${cell}px ${heading}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ink;

    const rand = mulberry32(seed);
    const glyphs = new Uint8Array(cols * rows);
    for (let i = 0; i < glyphs.length; i++) glyphs[i] = Math.floor(rand() * GREEK.length);

    const alphaOf = (d: number) =>
      d < 9 ? 0 : Math.pow(d / 100, 1.45) * strength;

    const drawCell = (i: number) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const a = alphaOf(field[i]);
      ctx.clearRect(c * cell, r * cell, cell, cell);
      if (a <= 0.02) return;
      ctx.globalAlpha = a;
      ctx.fillText(GREEK[glyphs[i]], c * cell + cell / 2, r * cell + cell / 2 + cell * 0.05);
      ctx.globalAlpha = 1;
    };

    for (let i = 0; i < glyphs.length; i++) drawCell(i);

    if (!shimmer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const t = window.setInterval(() => {
      for (let k = 0; k < 10; k++) {
        const i = Math.floor(Math.random() * glyphs.length);
        if (field[i] < 14) continue;
        glyphs[i] = Math.floor(Math.random() * GREEK.length);
        drawCell(i);
      }
    }, 160);
    return () => window.clearInterval(t);
  }, [field, cols, rows, cell, strength, seed, shimmer, fitWidth, ink]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
