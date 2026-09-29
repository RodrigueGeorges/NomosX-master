"use client";

import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { DomainCover } from "./DomainCover";

export type InquiryWatermark = "map" | "chart" | "globe" | "none";

export interface InquiryCardData {
  id: string;
  slug: string;
  title: string;
  domain: string;
  /** Free-form sub-domain topics — used to resolve the domain cover. */
  topics?: string[];
  summary?: string;
  watermark?: InquiryWatermark;
  verdict?: {
    value: string;
    label: string;
  };
  sourceCount: number;
  publishedAt: string;
  readTime?: number;
  hasForesight?: boolean;
  formatLabel?: string;
  /** Per-publication commissioned artwork. When present, it replaces the
      generic domain cover as the card's visual. */
  heroImageUrl?: string | null;
}

interface InquiryCardProps {
  inquiry: InquiryCardData;
  href?: string;
  className?: string;
  /** Editorial variant — taller cover, larger title, longer summary */
  featured?: boolean;
}

export function InquiryCard({ inquiry, href, className, featured = false }: InquiryCardProps) {
  const t = useTranslations();
  const {
    slug,
    title,
    domain,
    summary,
    verdict,
    sourceCount,
    publishedAt,
    readTime,
  } = inquiry;
  const target = href ?? `/inquiry/${slug}`;
  const cardRef = useRef<HTMLAnchorElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--nx-mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--nx-my", `${e.clientY - rect.top}px`);
  };

  return (
    <Link
      ref={cardRef}
      href={target}
      onMouseMove={handleMouseMove}
      className={cn(
        "group nx-spotlight nx-surface relative flex cursor-pointer overflow-hidden",
        featured ? "flex-col md:flex-row" : "flex-col",
        className
      )}
    >
      {/* Generative cover */}
      <div className={cn(
        "relative overflow-hidden border-black/[0.08] dark:border-white/[0.08]",
        featured
          ? "w-full h-44 md:h-auto md:w-2/5 md:min-h-[240px] border-b md:border-b-0 md:border-r"
          : "w-full h-24 border-b"
      )}>
        {/* Commissioned per-publication artwork when available —
            the domain plate is the identity fallback. */}
        {inquiry.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={inquiry.heroImageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover filter brightness-[0.92] dark:brightness-[0.80] contrast-[1.05]"
          />
        ) : (
          <DomainCover domain={domain} domains={inquiry.topics} variant="sm" />
        )}
        <div className="absolute top-3 left-4 right-4 flex items-center gap-2">
          {inquiry.formatLabel && (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 border border-black/30 dark:border-white/30 text-black/90 dark:text-white/90 bg-white/80 dark:bg-black/80">
              {inquiry.formatLabel}
            </span>
          )}
          {inquiry.hasForesight && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-black/30 dark:border-white/30 text-black/80 dark:text-white/80 bg-white/80 dark:bg-black/80">
              {t("InquiryCard.scenarios")}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-black/45 dark:text-white/45 bg-white/70 dark:bg-black/70 px-1.5 py-0.5">
            {new Date(publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      <div className="relative z-[1] flex flex-col flex-1 p-5 sm:p-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/45 dark:text-white/45 mb-3">
          {domain}
        </span>

        <h3
          className={cn(
            "font-display font-medium text-text leading-snug tracking-tight mb-3 group-hover:text-black dark:group-hover:text-white transition-colors",
            featured ? "text-xl sm:text-2xl line-clamp-3" : "text-lg line-clamp-2"
          )}
        >
          {title}
        </h3>

        {summary && (
          <p className={cn("text-xs text-black/55 dark:text-white/55 leading-relaxed mb-3 flex-1", featured ? "line-clamp-3" : "line-clamp-2")}>
            {summary}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-4 pt-3 border-t border-black/[0.08] dark:border-white/[0.08]">
          <div className="flex flex-col gap-1">
            {verdict && (
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-light text-black/80 dark:text-white/80 tabular-nums">
                  {verdict.value}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/40 dark:text-white/40">
                  {verdict.label}
                </span>
              </div>
            )}
            <span className="font-mono text-[11px] text-black/40 dark:text-white/40">
              {readTime ? t("InquiryCard.sourcesReadTime", { count: sourceCount, readTime }) : t("InquiryCard.sources", { count: sourceCount })}
            </span>
          </div>

          <div className="w-10 h-10 border border-black/[0.12] dark:border-white/[0.12] flex items-center justify-center group-hover:border-black/40 dark:group-hover:border-white/40 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition-all duration-300">
            <ArrowUpRight className="w-4 h-4 text-black/45 dark:text-white/45 group-hover:text-black dark:group-hover:text-white transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  );
}
