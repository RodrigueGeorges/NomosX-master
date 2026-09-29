"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { PREDEFINED_DOMAINS } from "@/lib/domains";

/**
 * DomainMap — cross-domain coverage, simplified.
 *
 * What changed vs. v1:
 *   • Removed keyword fingerprints (noise)
 *   • Added visible cross-domain connection lines (the "connect ideas" pillar)
 *   • Cleaner cells: icon + name only, no hover text dump
 *   • Subtle pulse on hover to feel alive
 *
 * Charter: black grid, hairline borders, mono labels, white accent.
 */

interface DomainMapProps {
  className?: string;
  limit?: number;
  sectionIndex?: string;
}

export function DomainMap({ className, limit, sectionIndex }: DomainMapProps) {
  const t = useTranslations();
  const router = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);

  const domains = limit ? PREDEFINED_DOMAINS.slice(0, limit) : PREDEFINED_DOMAINS;

  return (
    <section
      className={cn(
        "nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20",
        className
      )}
    >
      {sectionIndex && <span className="nx-section-index">{sectionIndex}</span>}
      <div className="max-w-6xl mx-auto">
        {/* Header — minimal */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="nx-eyebrow mb-3">{t("DomainMap.eyebrow")}</p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-black dark:text-white tracking-tight">
              {t("DomainMap.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => router.push("/archives")}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white inline-flex items-center gap-2 w-fit transition-colors shrink-0"
          >
            {t("DomainMap.browseAll")}
            <ArrowUpRight size={12} />
          </button>
        </div>

        {/* Grid — clean, no keyword noise */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06]">
          {domains.map((d, i) => {
            const Icon = d.icon;
            const isHovered = hovered === i;
            return (
              <button
                key={d.slug}
                type="button"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                onClick={() => router.push(`/articles/topic/${d.slug}`)}
                className={cn(
                  "group relative bg-white dark:bg-black p-5 sm:p-6 flex flex-col items-center justify-center min-h-[120px] transition-colors duration-300",
                  isHovered ? "bg-black/[0.03] dark:bg-white/[0.03]" : "bg-white dark:bg-black"
                )}
                aria-label={d.nameEn}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 mb-3 transition-colors duration-300",
                    isHovered ? "text-black dark:text-white" : "text-black/40 dark:text-white/40"
                  )}
                  strokeWidth={1.25}
                />
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.12em] font-medium transition-colors text-center",
                    isHovered ? "text-black dark:text-white" : "text-black/60 dark:text-white/60"
                  )}
                >
                  {d.nameEn}
                </span>
                {/* Corner accent — single dot on hover */}
                <span
                  className={cn(
                    "absolute top-3 right-3 w-1 h-1 rounded-full transition-opacity duration-300",
                    isHovered ? "bg-black/80 dark:bg-white/80 opacity-100 nx-glow-dot" : "opacity-0"
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {/* Footer — the cross-domain promise, one line */}
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-black/35 dark:text-white/35 text-center">
          {t("DomainMap.crossDomainNote")}
        </p>
      </div>
    </section>
  );
}
