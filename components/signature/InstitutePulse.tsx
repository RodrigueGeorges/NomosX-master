"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * InstitutePulse — a single rotating line showing the institute is alive.
 * Ambient, poetic, never technical: "Reading 214 sources on …" rather than
 * pipeline internals. Cycles every few seconds with a soft fade.
 */

export function InstitutePulse({
  items,
  intervalMs = 4200,
  className,
}: {
  /** Real activity lines (e.g. derived from the latest briefs). Falls back to curated lines. */
  items?: string[];
  intervalMs?: number;
  className?: string;
}) {
  const t = useTranslations("InstitutePulse");
  // next-intl catalogs don't support arrays — lines live under line0..line4
  const fallback = [0, 1, 2, 3, 4]
    .map((i) => `line${i}`)
    .filter((k) => t.has(k))
    .map((k) => t(k));
  const lines = items && items.length > 0 ? items : fallback;

  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (lines.length < 2) return;
    const id = setInterval(() => {
      setVisible(false);
      const swap = setTimeout(() => {
        setIdx((i) => (i + 1) % lines.length);
        setVisible(true);
      }, 450);
      return () => clearTimeout(swap);
    }, intervalMs);
    return () => clearInterval(id);
  }, [lines.length, intervalMs]);

  if (lines.length === 0) return null;

  return (
    <p
      className={cn(
        "inline-flex items-baseline gap-3 font-display text-sm sm:text-base italic text-black/50 transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
      aria-live="polite"
    >
      <span className="not-italic inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-black/40">
        <span className="w-1 h-1 rounded-full bg-black/60 nx-glow-dot" />
        {t("eyebrow")}
      </span>
      <span key={idx}>{lines[idx] ?? ""}</span>
    </p>
  );
}
