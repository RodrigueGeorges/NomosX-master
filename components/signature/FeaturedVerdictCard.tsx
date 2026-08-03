"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, BookOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
    <svg width={w} height={h} className="opacity-70 text-white" aria-hidden>
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
  const [meterWidth, setMeterWidth] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const sparkline = data.sparkline ?? [52, 58, 61, 68, 72, 74, 73, 74];

  // Parse the numeric confidence for the meter (e.g. "74%" -> 74)
  const confidenceNum = Math.min(
    100,
    Math.max(0, parseInt(data.confidence.replace(/[^0-9]/g, ""), 10) || 0)
  );

  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, [animate]);

  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => setMeterWidth(confidenceNum), 200);
    return () => clearTimeout(t);
  }, [mounted, confidenceNum]);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--nx-mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--nx-my", `${e.clientY - rect.top}px`);
  };

  return (
    <article
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={cn(
        "nx-spotlight nx-surface nx-border-flow relative",
        "p-5 sm:p-6 transition-all duration-700",
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className
      )}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="nx-scan-sweep bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-white/70 nx-glow-dot" />
        <p className="nx-eyebrow" style={{ letterSpacing: "0.14em" }}>Institute position</p>
      </div>

      <h2 className="font-display text-xl sm:text-2xl font-medium text-white leading-snug mb-3">
        {data.question}
      </h2>

      <p className="text-sm text-white/70 leading-relaxed mb-5">
        <span className="text-white font-medium">{data.verdictPrefix}</span>
        {" — "}
        {data.verdictBody}
      </p>

      <div className="grid grid-cols-2 gap-px bg-white/[0.08] mb-4">
        <div className="bg-black p-4">
          <p className="nx-eyebrow nx-eyebrow--dim mb-3" style={{ fontSize: "11px", letterSpacing: "0.1em" }}>Confidence</p>
          <div className="flex items-end justify-between gap-2 mb-3">
            <p className="font-mono text-2xl font-light text-white tabular-nums">{data.confidence}</p>
            <Sparkline points={sparkline} />
          </div>
          <div className="nx-meter-track">
            <div
              className="nx-meter-fill"
              style={{ width: `${meterWidth}%`, transition: "width 1.2s cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          </div>
        </div>
        <div className="bg-black p-4">
          <p className="nx-eyebrow nx-eyebrow--dim mb-3" style={{ fontSize: "11px", letterSpacing: "0.1em" }}>Distribution</p>
          <p className="font-mono text-base sm:text-lg text-white tabular-nums leading-tight">{data.simulation}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4 font-mono text-xs text-white/50">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-white/55" strokeWidth={1.25} />
          {data.sources} sources
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-white/55" strokeWidth={1.25} />
          {data.objections} dissents
        </span>
      </div>

      <div className="flex justify-between pt-4 border-t border-white/[0.08] font-mono text-[11px] uppercase tracking-[0.1em] text-white/40">
        <span>Updated {data.updatedAt}</span>
        <span>{data.serialId}</span>
      </div>
    </article>
  );
}
