"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { PREDEFINED_DOMAINS } from "@/lib/domains";

/**
 * DomainMap — surfaces the cross-domain coverage of NomosX.
 *
 * Inspiration: Harvard Growth Lab "Where we work" + RAND "browse topics".
 * Renders the 8 editorial domains as an interactive grid. Hovering a domain
 * reveals its keyword fingerprint; clicking routes to the topic archive.
 *
 * Visual language: hairline grid, mono labels, single accent dot per cell.
 * No filled chips, no color noise — domains are identified by icon + label,
 * not by brand colors (SpaceX two-color discipline).
 */

interface DomainMapProps {
  className?: string;
  /** Limit the number of domains shown (default: all 8). */
  limit?: number;
  sectionIndex?: string;
}

export function DomainMap({ className, limit, sectionIndex }: DomainMapProps) {
  const t = useTranslations();
  const router = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);

  const domains = (limit ? PREDEFINED_DOMAINS.slice(0, limit) : PREDEFINED_DOMAINS);

  return (
    <section
      className={cn(
        "nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20",
        className
      )}
    >
      {sectionIndex && <span className="nx-section-index">{sectionIndex}</span>}
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="nx-eyebrow mb-3">{t("DomainMap.eyebrow")}</p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              {t("DomainMap.title")}
            </h2>
            <p className="mt-3 text-sm text-white/55 max-w-xl leading-relaxed">
              {t("DomainMap.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/archives")}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/55 hover:text-white inline-flex items-center gap-2 w-fit transition-colors shrink-0"
          >
            {t("DomainMap.browseAll")}
            <ArrowUpRight size={12} />
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06]">
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
                  "group relative bg-black p-5 sm:p-6 text-left flex flex-col min-h-[160px] transition-colors duration-300",
                  isHovered ? "bg-white/[0.03]" : "bg-black"
                )}
                aria-label={d.nameEn}
              >
                {/* Index */}
                <span className="font-mono text-[10px] tabular-nums text-white/30 mb-4">
                  0{i + 1}
                </span>

                {/* Icon */}
                <Icon
                  className={cn(
                    "w-5 h-5 mb-4 transition-colors duration-300",
                    isHovered ? "text-white" : "text-white/45"
                  )}
                  strokeWidth={1.25}
                />

                {/* Name */}
                <span
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-colors",
                    isHovered ? "text-white" : "text-white/70"
                  )}
                >
                  {d.nameEn}
                </span>

                {/* Keyword fingerprint — revealed on hover */}
                <span
                  className={cn(
                    "mt-3 font-mono text-[10px] text-white/40 leading-relaxed transition-opacity duration-300",
                    isHovered ? "opacity-100" : "opacity-0 sm:opacity-0"
                  )}
                >
                  {d.keywords.slice(0, 3).join(" · ")}
                </span>

                {/* Corner accent */}
                <span
                  className={cn(
                    "absolute top-3 right-3 w-1 h-1 rounded-full transition-opacity duration-300",
                    isHovered ? "bg-white/80 opacity-100 nx-glow-dot" : "opacity-0"
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {/* Footer note — the cross-domain promise */}
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35 text-center">
          {t("DomainMap.crossDomainNote")}
        </p>
      </div>
    </section>
  );
}
