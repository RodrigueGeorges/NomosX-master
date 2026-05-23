"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

export interface FeaturedVerdictData {
  question: string;
  /** e.g. "Yes" */
  verdictPrefix: string;
  /** Explanation after the prefix */
  verdictBody: string;
  confidence: string;
  simulation: string;
  sources: number;
  objections: number;
  updatedAt: string;
  serialId: string;
  /** Optional sparkline points 0–100 */
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
    <svg width={w} height={h} className="opacity-70 text-accent" aria-hidden>
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
        "relative rounded-2xl border border-white/[0.08] bg-bg-elevated",
        "shadow-card p-6 sm:p-8",
        "transition-all duration-700",
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className
      )}
    >
      <div className="absolute top-0 left-8 right-8 h-px bg-accent/35" />

      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35 mb-4">Verdict</p>

      <h2 className="font-serif text-xl sm:text-2xl font-light text-text leading-snug mb-4">
        {data.question}
      </h2>

      <p className="text-sm text-white/55 leading-relaxed mb-6">
        <span className="text-accent font-medium">{data.verdictPrefix}</span>
        {" — "}
        {data.verdictBody}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5">
        <div className="rounded-xl border border-white/[0.06] bg-bg/60 p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent/50 mb-2">
            Confidence
          </p>
          <div className="flex items-end justify-between gap-2">
            <p className="font-mono text-3xl font-light text-text tabular-nums animate-trace">
              {data.confidence}
            </p>
            <Sparkline points={sparkline} />
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-bg/60 p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent/50 mb-2">
            Simulation
          </p>
          <p className="font-mono text-base sm:text-lg text-text tabular-nums leading-tight">
            {data.simulation}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-5 font-mono text-[11px] text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-accent/50" strokeWidth={1.25} />
          {data.sources} sources
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-accent/50" strokeWidth={1.25} />
          {data.objections} strong objections
        </span>
      </div>

      <div className="flex justify-between pt-4 border-t border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
        <span>Last updated {data.updatedAt}</span>
        <span>ID {data.serialId}</span>
      </div>
    </article>
  );
}
