"use client";

import { cn } from "@/lib/utils";
import { BarChart3, GitCompare, Map, Scale } from "lucide-react";

const STEPS = [
  { step: "01", label: "Map", icon: Map },
  { step: "02", label: "Confront", icon: GitCompare },
  { step: "03", label: "Quantify", icon: BarChart3 },
  { step: "04", label: "Decide", icon: Scale },
] as const;

interface PipelineStripProps {
  className?: string;
}

export function PipelineStrip({ className }: PipelineStripProps) {
  return (
    <section className={cn("px-6 sm:px-8 py-12 sm:py-14 border-y border-white/[0.05]", className)}>
      <div className="max-w-4xl mx-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30 text-center mb-10">
          Method
        </p>
        <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-6 sm:gap-0">
          {STEPS.map(({ step, label, icon: Icon }, i) => (
            <div key={step} className="flex items-center flex-1 min-w-[80px]">
              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-10 h-10 border border-white/[0.08] bg-white/[0.02] flex items-center justify-center mb-2.5">
                  <Icon className="w-4 h-4 text-white/45" strokeWidth={1.25} />
                </div>
                <span className="font-mono text-[9px] text-white/30 tabular-nums">{step}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/50 mt-0.5">
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="hidden sm:block flex-1 h-px bg-white/[0.06] mx-2 mb-8 max-w-[48px]" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
