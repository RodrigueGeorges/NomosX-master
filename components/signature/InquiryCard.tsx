"use client";

import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

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
}

interface InquiryCardProps {
  inquiry: InquiryCardData;
  href?: string;
  className?: string;
}

function Watermark({ type }: { type: InquiryWatermark }) {
  if (type === "none") return null;

  const base = "absolute right-4 bottom-4 w-24 h-24 opacity-[0.07] pointer-events-none";

  if (type === "map") {
    return (
      <svg className={cn(base, "text-white")} viewBox="0 0 100 100" aria-hidden>
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
      <svg className={cn(base, "text-white")} viewBox="0 0 100 60" aria-hidden>
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
    <svg className={cn(base, "text-white")} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <ellipse cx="50" cy="50" rx="38" ry="14" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <ellipse cx="50" cy="50" rx="14" ry="38" fill="none" stroke="currentColor" strokeWidth="0.6" />
    </svg>
  );
}

export function InquiryCard({ inquiry, href, className }: InquiryCardProps) {
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

  return (
    <Link
      href={target}
      className={cn(
        "group relative flex flex-col overflow-hidden",
        "p-6 sm:p-8 min-h-[220px]",
        "border border-white/[0.08] bg-white/[0.02]",
        "transition-all duration-300 ease-out",
        "hover:border-white/20 hover:bg-white/[0.04]",
        className
      )}
    >
      <Watermark type={watermark} />

      <div className="relative z-[1] flex items-center justify-between mb-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
          {domain}
        </span>
        <div className="flex items-center gap-2">
          {inquiry.hasForesight && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-white/15 text-white/45">
              Foresight
            </span>
          )}
          <span className="font-mono text-[10px] text-white/30">
            {new Date(publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      <h3 className="relative z-[1] font-display text-lg font-medium text-text leading-snug tracking-tight mb-3 group-hover:text-white transition-colors line-clamp-2">
        {title}
      </h3>

      {summary && (
        <p className="relative z-[1] text-xs text-white/40 leading-relaxed line-clamp-2 mb-4 flex-1">
          {summary}
        </p>
      )}

      <div className="relative z-[1] mt-auto flex items-end justify-between gap-4 pt-2">
        {verdict ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">
              {verdict.label}
            </span>
            <span className="font-mono text-xl font-light text-white tabular-nums">
              {verdict.value}
            </span>
          </div>
        ) : (
          <span className="font-mono text-[10px] text-white/30">
            {sourceCount} sources{readTime ? ` · ${readTime} min` : ""}
          </span>
        )}

        <div className="w-8 h-8 border border-white/[0.1] flex items-center justify-center group-hover:border-white/30 transition-colors">
          <ArrowUpRight className="w-3.5 h-3.5 text-white/30 group-hover:text-white transition-colors" />
        </div>
      </div>
    </Link>
  );
}
