"use client";

import { cn } from "@/lib/utils";
import { BarChart3, GitCompare, Map, Scale } from "lucide-react";

const STEPS = [
  {
    step: "01",
    label: "Map",
    icon: Map,
    desc: "Every angle. Every source.",
  },
  {
    step: "02",
    label: "Confront",
    icon: GitCompare,
    desc: "Your position, stress-tested.",
  },
  {
    step: "03",
    label: "Quantify",
    icon: BarChart3,
    desc: "Multiple futures. Real odds.",
  },
  {
    step: "04",
    label: "Decide",
    icon: Scale,
    desc: "A position worth defending.",
  },
] as const;

interface PipelineStripProps {
  className?: string;
}

export function PipelineStrip({ className }: PipelineStripProps) {
  return (
    <section className={cn("px-6 sm:px-8 py-14 sm:py-16 border-y border-white/[0.06] bg-white/[0.01]", className)}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/25">
            How it works
          </p>
          <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/20">
            <span className="w-1 h-1 rounded-full bg-emerald-400/50 animate-pulse" />
            Live
          </span>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-6 sm:gap-0">
          {STEPS.map(({ step, label, icon: Icon, desc }, i) => (
            <div key={step} className="flex items-start flex-1 min-w-[80px]">
              <div className="flex flex-col items-center text-center flex-1 group">
                <div className="w-10 h-10 border border-white/[0.1] bg-white/[0.02] flex items-center justify-center mb-3 group-hover:border-white/20 group-hover:bg-white/[0.04] transition-all duration-300">
                  <Icon className="w-4 h-4 text-white/40 group-hover:text-white/60 transition-colors duration-300" strokeWidth={1.25} />
                </div>
                <span className="font-mono text-[9px] text-white/20 tabular-nums mb-0.5">{step}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/60 font-medium">
                  {label}
                </span>
                <span className="font-mono text-[9px] text-white/25 mt-1.5 leading-relaxed max-w-[90px]">
                  {desc}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="hidden sm:flex flex-1 items-center justify-center mb-8 max-w-[48px]">
                  <div className="w-full h-px bg-white/[0.08] relative">
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/20" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
