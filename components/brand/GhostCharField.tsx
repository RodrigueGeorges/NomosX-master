/**
 * GhostCharField — faint background grid of Greek letters and binary digits.
 *
 * Design DNA bridge between the cinematic intro (ManifestoCrawl) and the
 * landing page: the chaotic field that the intro "organised" now lives,
 * calm and ordered — or gently drifting — as a decorative backdrop.
 *
 * Rendering is fully deterministic (seeded PRNG) so SSR and client render
 * identical markup — no hydration mismatch.
 */

import type { ReactNode } from "react";

const GREEK_CHARS = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";
const BINARY_CHARS = "01";

/** mulberry32 — tiny seeded PRNG, deterministic across server/client. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function GhostCharField({
  cols = 12,
  rows = 6,
  seed = 7,
  drift = true,
  className = "",
}: {
  cols?: number;
  rows?: number;
  seed?: number;
  drift?: boolean;
  className?: string;
}) {
  const rand = mulberry32(seed);
  const cells: ReactNode[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isGreek = rand() > 0.4;
      const pool = isGreek ? GREEK_CHARS : BINARY_CHARS;
      const char = pool[Math.floor(rand() * pool.length)];
      const delay = (rand() * 6).toFixed(2);
      const duration = (6 + rand() * 4).toFixed(2);

      cells.push(
        <span
          key={`${r}-${c}`}
          className={`nx-ghost-char ${drift ? "nx-ghost-char--drift" : ""}`}
          style={{
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
            fontFamily: isGreek
              ? "var(--nx-font-heading)"
              : "var(--font-mono), ui-monospace, monospace",
          }}
          aria-hidden="true"
        >
          {char}
        </span>
      );
    }
  }

  return (
    <div
      className={`nx-ghost-field ${className}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
      aria-hidden="true"
    >
      {cells}
    </div>
  );
}
