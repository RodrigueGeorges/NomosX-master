"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { MagneticButton } from "@/components/ui/MagneticButton";

const FOCUS_TAGS = ["Technology", "Economics", "Policy", "Climate", "Security", "Health"];

const DELIVERABLES = [
  "A source-verified, scenario-weighted study on your question",
  "Multiple futures, each with a probability",
  "Every assumption challenged, every doubt logged",
  "Sources visible. The map, not just the terrain.",
];

interface StudioPreviewProps {
  onGetStarted?: () => void;
  onLearnMore?: () => void;
  className?: string;
  sectionIndex?: string;
}

export function StudioPreview({ onGetStarted, onLearnMore, className, sectionIndex }: StudioPreviewProps) {
  const [selectedTags, setSelectedTags] = useState<number[]>([0, 1, 2]);

  const toggleTag = (i: number) => {
    setSelectedTags((prev) =>
      prev.includes(i) ? prev.filter((t) => t !== i) : [...prev, i]
    );
  };

  return (
    <section className={cn("nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20", className)}>
      {sectionIndex && <span className="nx-section-index">{sectionIndex}</span>}
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(240px,280px)] gap-6 lg:gap-8 items-stretch">
        <div className="flex flex-col justify-center lg:pr-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="nx-eyebrow">Nomos Engine</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-black/60 dark:text-white/60 px-2 py-0.5 border border-black/20 dark:border-white/20">
              Pay per study
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold text-black dark:text-white mb-3 tracking-tight">
            Your question.<br />A study worth defending.
          </h2>
          <p className="text-sm text-black/55 dark:text-white/55 leading-relaxed mb-5 max-w-sm">
            Ask anything. Get back a verified, multi-scenario study — ready to brief, decide, or act on.
          </p>
          <button
            type="button"
            onClick={onLearnMore}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white inline-flex items-center gap-2 w-fit transition-colors"
          >
            Learn more
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="nx-surface nx-border-flow p-5 sm:p-6 space-y-4">
          <div>
            <p className="nx-eyebrow nx-eyebrow--dim mb-2" style={{ fontSize: "11px", letterSpacing: "0.16em" }}>
              01 · Define question
            </p>
            <div className="border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-black px-4 py-3 min-h-[60px]">
              <p className="text-sm text-black/40 dark:text-white/40 italic">
                What is the most probable trajectory for…
              </p>
              <p className="font-mono text-[11px] text-black/50 dark:text-white/50 mt-2 text-right">0 / 240</p>
            </div>
          </div>

          <div>
            <p className="nx-eyebrow nx-eyebrow--dim mb-2" style={{ fontSize: "11px", letterSpacing: "0.16em" }}>
              02 · Select focus areas
            </p>
            <div className="flex flex-wrap gap-2">
              {FOCUS_TAGS.map((tag, i) => {
                const selected = selectedTags.includes(i);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(i)}
                    className={cn(
                      "px-2.5 py-1 font-mono text-[11px] border transition-all duration-200 cursor-pointer",
                      selected
                        ? "border-black/40 dark:border-white/40 bg-black/[0.08] dark:bg-white/[0.08] text-black/85 dark:text-white/85"
                        : "border-black/[0.1] dark:border-white/[0.1] text-black/45 dark:text-white/45 hover:border-black/25 dark:hover:border-white/25 hover:text-black/70 dark:hover:text-white/70"
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="nx-eyebrow nx-eyebrow--dim mb-2" style={{ fontSize: "11px", letterSpacing: "0.16em" }}>
              03 · Delivery
            </p>
            <ul className="space-y-2">
              {DELIVERABLES.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-black/60 dark:text-white/60">
                  <Check className="w-3.5 h-3.5 text-black/70 dark:text-white/70 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="nx-surface p-5 sm:p-6 flex flex-col justify-center" style={{ borderColor: "rgba(10,10,15,0.10)", background: "rgba(10,10,15,0.02)" }}>
          <h3 className="font-display text-lg font-semibold text-black dark:text-white mb-2 leading-snug">
            Commission a study
          </h3>
          <p className="nx-eyebrow nx-eyebrow--dim mb-6" style={{ fontSize: "11px" }}>
            From €39 · Money-back guarantee
          </p>
          <MagneticButton
            type="button"
            onClick={onGetStarted}
            strength={0.12}
            className="w-full py-3.5 bg-black dark:bg-white text-white dark:text-black text-xs font-semibold uppercase tracking-[0.14em] hover:bg-black/85 dark:hover:bg-white/85 transition-colors flex items-center justify-center gap-2 group"
          >
            Start a study
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
