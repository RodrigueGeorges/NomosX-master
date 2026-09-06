"use client";

import { cn } from "@/lib/utils";
import { BarChart3, GitCompare, Map, Scale } from "lucide-react";

const STEPS = [
  {
    step: "01",
    label: "Map",
    icon: Map,
    desc: "Cartographier, pas accumuler.",
  },
  {
    step: "02",
    label: "Confront",
    icon: GitCompare,
    desc: "Forcer la collision des domaines.",
  },
  {
    step: "03",
    label: "Quantify",
    icon: BarChart3,
    desc: "Le chaos devient scénario.",
  },
  {
    step: "04",
    label: "Decide",
    icon: Scale,
    desc: "Une position vérifiable.",
  },
] as const;

interface PipelineStripProps {
  className?: string;
}

export function PipelineStrip({ className }: PipelineStripProps) {
  return (
    <section className={cn("nx-section-divide relative px-6 sm:px-8 py-12 sm:py-14 bg-black/[0.01]", className)}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <p className="nx-eyebrow">How it works</p>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-black/45">
            <span className="w-1 h-1 rounded-full bg-black/70 nx-glow-dot" />
            Live
          </span>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-6 sm:gap-0">
          {STEPS.map(({ step, label, icon: Icon, desc }, i) => (
            <div key={step} className="flex items-start flex-1 min-w-[80px]">
              <div className="nx-pipeline-step flex flex-col items-center text-center flex-1 group">
                <div className="nx-pipeline-icon w-10 h-10 border border-black/[0.1] bg-black/[0.02] flex items-center justify-center mb-3 group-hover:border-black/30 group-hover:bg-black/[0.04] transition-all duration-300">
                  <Icon className="w-4 h-4 text-black/45 group-hover:text-black/75 transition-colors duration-300" strokeWidth={1.25} />
                </div>
                <span className="font-mono text-[10px] text-black/50 tabular-nums mb-0.5">{step}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-black/75 font-medium">
                  {label}
                </span>
                <span className="font-mono text-[10px] text-black/40 mt-2 leading-relaxed max-w-[110px]">
                  {desc}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="hidden sm:flex flex-1 items-center justify-center mb-8 max-w-[48px]">
                  <div className="w-full h-px bg-black/[0.08] relative">
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-black/25" />
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
