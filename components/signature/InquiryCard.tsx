"use client";

import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { useTranslations } from "next-intl";

export type InquiryWatermark = "map" | "chart" | "globe" | "none";

export interface InquiryCardData {
  id: string;
  slug: string;
  title: string;
  domain: string;
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
}

interface InquiryCardProps {
  inquiry: InquiryCardData;
  href?: string;
  className?: string;
}

function Watermark({ type }: { type: InquiryWatermark }) {
  if (type === "none") return null;

  const base = "nx-watermark absolute right-4 bottom-4 w-24 h-24 pointer-events-none opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-500";

  if (type === "map") {
    return (
      <svg className={cn(base, "text-black")} viewBox="0 0 100 100" aria-hidden>
        {Array.from({ length: 8 }).map((_, row) =>
          Array.from({ length: 12 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={8 + col * 8}
              cy={10 + row * 11}
              r={1.2}
              fill="currentColor"
              opacity={0.3 + ((row + col) % 3) * 0.2}
            />
          ))
        )}
      </svg>
    );
  }

  if (type === "chart") {
    return (
      <svg className={cn(base, "text-black")} viewBox="0 0 100 60" aria-hidden>
        <polyline
          points="0,45 15,38 30,42 45,28 60,32 75,18 90,22 100,12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg className={cn(base, "text-black")} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <ellipse cx="50" cy="50" rx="38" ry="14" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <ellipse cx="50" cy="50" rx="14" ry="38" fill="none" stroke="currentColor" strokeWidth="0.6" />
    </svg>
  );
}

export function InquiryCard({ inquiry, href, className }: InquiryCardProps) {
  const t = useTranslations();
  const {
    slug,
    title,
    domain,
    summary,
    watermark = "none",
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
        "group nx-spotlight nx-surface relative flex flex-col cursor-pointer",
        "p-5 sm:p-6 min-h-[220px]",
        className
      )}
    >
      <Watermark type={watermark} />

      <div className="relative z-[1] flex items-center gap-2 mb-4 flex-wrap">
        {inquiry.formatLabel && (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 border border-black/30 text-black/90 bg-black/[0.06]">
            {inquiry.formatLabel}
          </span>
        )}
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/45">
          {domain}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {inquiry.hasForesight && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-black/30 text-black/80 bg-black/5">
              {t("InquiryCard.scenarios")}
            </span>
          )}
          <span className="font-mono text-[10px] text-black/45">
            {new Date(publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      <h3 className="relative z-[1] font-display text-lg font-medium text-text leading-snug tracking-tight mb-4 group-hover:text-black transition-colors line-clamp-2">
        {title}
      </h3>

      {summary && (
        <p className="relative z-[1] text-xs text-black/55 leading-relaxed line-clamp-2 mb-3 flex-1">
          {summary}
        </p>
      )}

      <div className="relative z-[1] mt-auto flex items-end justify-between gap-4 pt-3 border-t border-black/[0.08]">
        <div className="flex flex-col gap-1">
          {verdict && (
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-light text-black/80 tabular-nums">
                {verdict.value}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/40">
                {verdict.label}
              </span>
            </div>
          )}
          <span className="font-mono text-[11px] text-black/40">
            {readTime ? t("InquiryCard.sourcesReadTime", { count: sourceCount, readTime }) : t("InquiryCard.sources", { count: sourceCount })}
          </span>
        </div>

        <div className="w-10 h-10 border border-black/[0.12] flex items-center justify-center group-hover:border-black/40 group-hover:bg-black/5 transition-all duration-300">
          <ArrowUpRight className="w-4 h-4 text-black/45 group-hover:text-black transition-colors" />
        </div>
      </div>
    </Link>
  );
}
