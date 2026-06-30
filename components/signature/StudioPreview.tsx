"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Check } from "lucide-react";

const FOCUS_TAGS = ["Technology", "Economics", "Policy", "Climate", "Security", "Health"];

const DELIVERABLES = [
  "Institute position with probabilistic verdict",
  "Prospective distribution & scenario trajectories",
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
    <section className={cn("px-6 sm:px-8 py-24 sm:py-32 border-t border-white/[0.08]", className)}>
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(240px,280px)] gap-8 lg:gap-6 items-stretch">
        <div className="flex flex-col justify-center lg:pr-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">
              NomosX Studio
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45 px-2 py-0.5 border border-white/15">
              Private beta
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold text-white mb-4 tracking-tight">
            Commission on demand.
          </h2>
          <p className="text-sm text-white/40 leading-relaxed mb-6 max-w-sm">
            Probabilistic foresight, adversarial review, publication-ready deliverables on your timeline.
          </p>
          <button
            type="button"
            onClick={onLearnMore}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50 hover:text-white inline-flex items-center gap-2 w-fit transition-colors"
          >
            Learn more
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7 space-y-5">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30 mb-2">
              01 · Define question
            </p>
            <div className="border border-white/[0.08] bg-black px-4 py-3 min-h-[72px]">
              <p className="text-sm text-white/25 italic">
                What policy trajectory is most probable for…
              </p>
              <p className="font-mono text-[10px] text-white/20 mt-2 text-right">0 / 240</p>
            </div>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30 mb-2">
              02 · Select focus areas
            </p>
            <div className="flex flex-wrap gap-2">
              {FOCUS_TAGS.map((tag, i) => (
                <span
                  key={tag}
                  className={cn(
                    "px-2.5 py-1 font-mono text-[10px] border",
                    i < 3
                      ? "border-white/25 bg-white/[0.06] text-white/80"
                      : "border-white/[0.08] text-white/35"
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30 mb-2">
              03 · Delivery
            </p>
            <ul className="space-y-2">
              {DELIVERABLES.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-white/45">
                  <Check className="w-3.5 h-3.5 text-white/50 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border border-white/[0.12] bg-white/[0.03] p-6 sm:p-8 flex flex-col justify-center">
          <h3 className="font-display text-lg font-semibold text-white mb-2 leading-snug">
            Launch a study
          </h3>
          <p className="text-xs text-white/35 mb-8 leading-relaxed uppercase tracking-[0.12em] font-mono">
            Full pipeline · verified sources
          </p>
          <button
            type="button"
            onClick={onGetStarted}
            className="w-full py-3.5 bg-white text-black text-[11px] font-semibold uppercase tracking-[0.14em] hover:bg-white/90 transition-colors flex items-center justify-center gap-2 group"
          >
            Get started
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </section>
  );
}
