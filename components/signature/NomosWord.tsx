"use client";

/**
 * NomosWord — "NOMOS" inside the hero tagline.
 *
 * Every ~8-12s a wave of interference sweeps the word: letters flicker
 * and their Greek counterparts break through — NOMOS → ΝΟΜΟΣ — then
 * everything resolves. Chaos under the surface, order on top.
 * On hover the same dissolution plays in full. Click replays the
 * manifesto (nomosx:replay-intro).
 */

import React, { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const GREEK_FOR: Record<string, string> = {
  N: "Ν",
  O: "Ο",
  M: "Μ",
  S: "Σ",
};

export function NomosWord({
  word,
  hint,
  revealDelay = 0,
  className,
}: {
  word: string;
  /** Tooltip + aria-label, e.g. "What is Nomos? — replay the manifesto" */
  hint: string;
  /** Delay (ms) for the entry reveal, to stay in sync with WordReveal stagger. */
  revealDelay?: number;
  className?: string;
}) {
  const [rolling, setRolling] = useState(false);

  const replayManifesto = useCallback(() => {
    window.dispatchEvent(new CustomEvent("nomosx:replay-intro"));
  }, []);

  // Periodic roll — the word turns over into ΝΟΜΟΣ, holds, rolls back.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let scheduleTimer = 0;
    let clearTimer = 0;
    const roll = () => {
      setRolling(true);
      clearTimer = window.setTimeout(() => setRolling(false), 1400);
      scheduleTimer = window.setTimeout(roll, 4000 + Math.random() * 1800);
    };
    scheduleTimer = window.setTimeout(roll, 2800);
    return () => {
      window.clearTimeout(scheduleTimer);
      window.clearTimeout(clearTimer);
    };
  }, []);

  const upper = word.toUpperCase();

  return (
    <button
      type="button"
      onClick={replayManifesto}
      title={hint}
      aria-label={hint}
      className={cn("nx-word nx-nomos-word", rolling && "nx-nomos-rolling", className)}
      style={{ animationDelay: `${revealDelay}ms` }}
    >
      {upper.split("").map((ch, i) => {
        const greek = GREEK_FOR[ch];
        if (!greek) return <React.Fragment key={i}>{ch}</React.Fragment>;
        return (
          <span
            key={i}
            className="nx-nomos-letter"
            style={{ ["--d" as string]: `${i * 60}ms` }}
            aria-hidden="true"
          >
            <span className="nx-nomos-latin">{ch}</span>
            <span className="nx-nomos-greek">{greek}</span>
          </span>
        );
      })}
    </button>
  );
}
