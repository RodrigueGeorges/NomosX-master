"use client";

import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { domainColor } from "@/lib/brand/domain-colors";

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
  /** Editorial variant — taller cover, larger title, longer summary */
  featured?: boolean;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * CoverArt — generative geometric cover per publication.
 * Deterministic from the brief id + domain color: same piece, same cover.
 * Stripe-Press-adjacent abstract motifs, no stock photos.
 */
export function CoverArt({ id, domain, featured }: { id: string; domain: string; featured?: boolean }) {
  const color = domainColor(domain);
  const seed = hashCode(id);
  const motif = seed % 4;
  const off = (seed % 7) * 3;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 400 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="400" height="120" fill={`${color}0d`} />

      {motif === 0 &&
        // Concentric arcs rising from the corner — "contours"
        Array.from({ length: 9 }).map((_, i) => (
          <circle
            key={i}
            cx={40 + off}
            cy={140}
            r={20 + i * 22}
            fill="none"
            stroke={color}
            strokeOpacity={0.55 - i * 0.05}
            strokeWidth="1"
          />
        ))}

      {motif === 1 &&
        // Layered horizon bands — "strata"
        Array.from({ length: 12 }).map((_, i) => (
          <line
            key={i}
            x1="0"
            y1={12 + i * 9}
            x2={120 + ((i * 53 + seed) % 260)}
            y2={12 + i * 9}
            stroke={color}
            strokeOpacity={0.15 + (i % 4) * 0.08}
            strokeWidth="1.2"
          />
        ))}

      {motif === 2 &&
        // Sparse field of points — "data field"
        Array.from({ length: 6 }).map((_, row) =>
          Array.from({ length: 14 }).map((_, col) => {
            const on = ((row * 14 + col) * seed) % 5 < 3;
            return (
              <circle
                key={`${row}-${col}`}
                cx={20 + col * 28}
                cy={15 + row * 18}
                r={1.4}
                fill={color}
                opacity={on ? 0.45 : 0.08}
              />
            );
          })
        )}

      {motif === 3 &&
        // Signal spikes — "seismograph"
        <polyline
          points={Array.from({ length: 24 })
            .map((_, i) => `${i * 17},${100 - (((i * seed + i * 37) % 61) * 0.9) - 8}`)
            .join(" ")}
          fill="none"
          stroke={color}
          strokeOpacity="0.55"
          strokeWidth="1.3"
        />}

      {/* Baseline rule — everything sits on evidence */}
      <line x1="0" y1="119" x2="400" y2="119" stroke={color} strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  );
}

export function InquiryCard({ inquiry, href, className, featured = false }: InquiryCardProps) {
  const t = useTranslations();
  const {
    id,
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
        "relative overflow-hidden border-black/[0.08]",
        featured
          ? "w-full h-44 md:h-auto md:w-2/5 md:min-h-[240px] border-b md:border-b-0 md:border-r"
          : "w-full h-24 border-b"
      )}>
        <CoverArt id={id} domain={domain} featured={featured} />
        <div className="absolute top-3 left-4 right-4 flex items-center gap-2">
          {inquiry.formatLabel && (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 border border-black/30 text-black/90 bg-white/80">
              {inquiry.formatLabel}
            </span>
          )}
          {inquiry.hasForesight && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-black/30 text-black/80 bg-white/80">
              {t("InquiryCard.scenarios")}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-black/45 bg-white/70 px-1.5 py-0.5">
            {new Date(publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      <div className="relative z-[1] flex flex-col flex-1 p-5 sm:p-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/45 mb-3">
          {domain}
        </span>

        <h3
          className={cn(
            "font-display font-medium text-text leading-snug tracking-tight mb-3 group-hover:text-black transition-colors",
            featured ? "text-xl sm:text-2xl line-clamp-3" : "text-lg line-clamp-2"
          )}
        >
          {title}
        </h3>

        {summary && (
          <p className={cn("text-xs text-black/55 leading-relaxed mb-3 flex-1", featured ? "line-clamp-3" : "line-clamp-2")}>
            {summary}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-4 pt-3 border-t border-black/[0.08]">
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
      </div>
    </Link>
  );
}
