"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

export interface FeaturedVerdictData {
  question: string;
  verdictPrefix: string;
  verdictBody: string;
  confidence: string;
  simulation: string;
  sources: number;
  objections: number;
  updatedAt: string;
  serialId: string;
  sparkline?: number[];
}

interface FeaturedVerdictCardProps {
  data: FeaturedVerdictData;
  className?: string;
  animate?: boolean;
}

function Sparkline({ points }: { points: number[] }) {
  const w = 80;
  const h = 28;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * w;
      const y = h - ((p - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="opacity-50 text-white" aria-hidden>
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FeaturedVerdictCard({ data, className, animate = true }: FeaturedVerdictCardProps) {
  const [mounted, setMounted] = useState(!animate);
  const sparkline = data.sparkline ?? [52, 58, 61, 68, 72, 74, 73, 74];

  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, [animate]);

  return (
    <article
      className={cn(
        "relative border border-white/[0.1] bg-white/[0.02]",
        "p-6 sm:p-8 transition-all duration-700",
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className
      )}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="nx-scan-sweep bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />
      </div>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">Institute position</p>
      </div>

      <h2 className="font-display text-xl sm:text-2xl font-medium text-white leading-snug mb-4">
        {data.question}
      </h2>

      <p className="text-sm text-white/55 leading-relaxed mb-6">
        <span className="text-white font-medium">{data.verdictPrefix}</span>
        {" — "}
        {data.verdictBody}
      </p>

      <div className="grid grid-cols-2 gap-px bg-white/[0.08] mb-5">
        <div className="bg-black p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30 mb-2">Confidence</p>
          <div className="flex items-end justify-between gap-2">
            <p className="font-mono text-3xl font-light text-white tabular-nums">{data.confidence}</p>
            <Sparkline points={sparkline} />
          </div>
        </div>
        <div className="bg-black p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30 mb-2">Distribution</p>
          <p className="font-mono text-base sm:text-lg text-white tabular-nums leading-tight">{data.simulation}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-5 font-mono text-[11px] text-white/35">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" strokeWidth={1.25} />
          {data.sources} sources
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.25} />
          {data.objections} dissents
        </span>
      </div>

      <div className="flex justify-between pt-4 border-t border-white/[0.08] font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
        <span>Updated {data.updatedAt}</span>
        <span>{data.serialId}</span>
      </div>
    </article>
  );
}
