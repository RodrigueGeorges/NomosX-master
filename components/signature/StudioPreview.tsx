"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Check } from "lucide-react";

const FOCUS_TAGS = ["Technology", "Economics", "Policy", "Climate", "Security", "Health"];

const DELIVERABLES = [
  "AI inquiry with probabilistic verdict",
  "Multi-agent Foresight (1024+ swarm, GraphRAG)",
  "Adversarial challenge pass",
  "Verified [SRC-N] source export",
];

interface StudioPreviewProps {
  onGetStarted?: () => void;
  onLearnMore?: () => void;
  className?: string;
}

export function StudioPreview({ onGetStarted, onLearnMore, className }: StudioPreviewProps) {
  return (
    <section className={cn("px-6 sm:px-8 py-20 sm:py-28", className)}>
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(240px,280px)] gap-8 lg:gap-6 items-stretch">
        {/* Left — intro */}
        <div className="flex flex-col justify-center lg:pr-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
              NomosX Studio
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent px-2 py-0.5 border border-accent/25 rounded-full">
              Private beta
            </span>
          </div>
          <p className="text-sm text-white/45 leading-relaxed mb-6 max-w-sm">
            Commission custom inquiries with multi-agent simulation, adversarial review,
            and publication-ready deliverables on your timeline.
          </p>
          <button
            type="button"
            onClick={onLearnMore}
            className="text-sm text-accent hover:text-accent font-mono inline-flex items-center gap-1 w-fit"
          >
            Learn more
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Center — interface preview */}
        <div className="rounded-2xl border border-white/[0.07] bg-bg-elevated p-6 sm:p-7 space-y-5 shadow-card">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 mb-2">
              01 · Define question
            </p>
            <div className="rounded-xl border border-white/[0.06] bg-bg px-4 py-3 min-h-[72px]">
              <p className="text-sm text-white/25 italic">
                What policy trajectory is most probable for…
              </p>
              <p className="font-mono text-[10px] text-white/20 mt-2 text-right">0 / 240</p>
            </div>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 mb-2">
              02 · Select focus areas
            </p>
            <div className="flex flex-wrap gap-2">
              {FOCUS_TAGS.map((tag, i) => (
                <span
                  key={tag}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-mono text-[10px] border",
                    i < 3
                      ? "border-accent/30 bg-accent/10 text-accent/90"
                      : "border-white/[0.06] text-white/35"
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 mb-2">
              03 · Delivery & access
            </p>
            <ul className="space-y-2">
              {DELIVERABLES.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-white/50">
                  <Check className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right — CTA card */}
        <div className="rounded-2xl border border-accent/15 bg-bg-elevated p-6 sm:p-8 flex flex-col justify-center shadow-glow">
          <h3 className="font-display text-lg font-semibold text-text mb-2 leading-snug">
            Commission a custom inquiry
          </h3>
          <p className="text-xs text-white/40 mb-8 leading-relaxed">
            Full pipeline · simulation · verified sources
          </p>
          <button
            type="button"
            onClick={onGetStarted}
            className="w-full py-3.5 rounded-xl bg-accent hover:brightness-110 text-bg text-sm font-semibold transition-colors flex items-center justify-center gap-2 group"
          >
            Get started
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </section>
  );
}
