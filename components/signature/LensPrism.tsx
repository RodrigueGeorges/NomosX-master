"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { THINKING_LENSES } from "@/lib/brand/thinking-lenses";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { cn } from "@/lib/utils";

/**
 * LensPrism — "One question. Nine ways of knowing."
 * The marketing expression of the lens layer: a single question refracted
 * through nine intellectual traditions. Sexy, not schematic.
 */

function PrismGlyph() {
  // A white beam enters a triangle; nine colored rays leave, fanned.
  const H = 120;
  const apexX = 96;
  const centerY = H / 2;
  return (
    <svg
      viewBox={`0 0 220 ${H}`}
      className="w-56 sm:w-64 h-auto"
      aria-hidden="true"
    >
      {/* incoming beam */}
      <line x1="0" y1={centerY} x2={apexX - 14} y2={centerY} stroke="black" strokeOpacity="0.55" strokeWidth="1.5" />
      {/* prism */}
      <polygon
        points={`${apexX - 12},${centerY - 16} ${apexX + 14},${centerY + 22} ${apexX + 14},${centerY - 22}`}
        fill="none"
        stroke="black"
        strokeOpacity="0.4"
        strokeWidth="1"
      />
      {/* refracted rays */}
      {THINKING_LENSES.map((l, i) => {
        const y = 12 + (i / (THINKING_LENSES.length - 1)) * (H - 24);
        return (
          <line
            key={l.id}
            x1={apexX + 14}
            y1={centerY}
            x2="218"
            y2={y}
            stroke={l.colorHex}
            strokeOpacity="0.7"
            strokeWidth="1.4"
          />
        );
      })}
    </svg>
  );
}

export function LensPrism({
  question,
  sectionIndex,
  className,
}: {
  question?: string;
  sectionIndex?: string;
  className?: string;
}) {
  const t = useTranslations("LensPrism");

  return (
    <section className={cn("nx-section-divide relative px-6 sm:px-8 py-20 sm:py-24 overflow-hidden", className)}>
      {sectionIndex && <span className="nx-section-index">{sectionIndex}</span>}

      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-12 lg:gap-16 items-start">
          {/* Left — the pitch */}
          <div>
            <ScrollReveal>
              <p className="nx-eyebrow mb-6">{t("eyebrow")}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-medium text-black tracking-tight leading-tight mb-4">
                {t("title")}
              </h2>
              <p className="text-sm sm:text-base text-black/55 leading-relaxed mb-8 max-w-md">
                {t("subtitle")}
              </p>
            </ScrollReveal>

            <ScrollReveal delay={120}>
              <div className="flex items-center gap-6">
                <PrismGlyph />
                {question && (
                  <p className="font-display text-sm sm:text-base italic text-black/60 leading-snug max-w-[220px]">
                    “{question}”
                  </p>
                )}
              </div>
              <Link
                href="/researchers"
                className="inline-flex items-center gap-2 mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-black/55 hover:text-black transition-colors"
              >
                {t("meetLenses")}
                <ArrowRight size={13} />
              </Link>
            </ScrollReveal>
          </div>

          {/* Right — the nine lenses */}
          <ScrollReveal stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {THINKING_LENSES.map((lens) => (
              <div
                key={lens.id}
                className="group relative nx-surface p-4 pt-3 transition-all duration-300 hover:-translate-y-0.5"
                style={{ boxShadow: `inset 0 2px 0 0 ${lens.colorHex}` }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] mb-2" style={{ color: lens.colorHex }}>
                  {lens.name}
                </p>
                <p className="text-xs text-black/65 leading-relaxed mb-2">
                  {lens.epithet}
                </p>
                <p className="text-[11px] italic text-black/40 leading-snug opacity-0 max-h-0 overflow-hidden group-hover:opacity-100 group-hover:max-h-16 transition-all duration-500">
                  “{lens.signatureQuestion}”
                </p>
              </div>
            ))}
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
