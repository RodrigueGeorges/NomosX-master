"use client";

import { cn } from "@/lib/utils";
import { BarChart3, GitCompare, Map, Scale } from "lucide-react";
import { useTranslations } from "next-intl";

const STEPS = [
  {
    step: "01",
    labelKey: "Pipeline.map",
    icon: Map,
    descKey: "Pipeline.mapDesc",
  },
  {
    step: "02",
    labelKey: "Pipeline.confront",
    icon: GitCompare,
    descKey: "Pipeline.confrontDesc",
  },
  {
    step: "03",
    labelKey: "Pipeline.quantify",
    icon: BarChart3,
    descKey: "Pipeline.quantifyDesc",
  },
  {
    step: "04",
    labelKey: "Pipeline.decide",
    icon: Scale,
    descKey: "Pipeline.decideDesc",
  },
] as const;

interface PipelineStripProps {
  className?: string;
}

export function PipelineStrip({ className }: PipelineStripProps) {
  const t = useTranslations();
  return (
    <section className={cn("nx-section-divide relative px-6 sm:px-8 py-12 sm:py-14 bg-black/[0.01] dark:bg-white/[0.01]", className)}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <p className="nx-eyebrow">{t("Pipeline.howItWorks")}</p>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-black/45 dark:text-white/45">
            <span className="w-1 h-1 rounded-full bg-black/70 dark:bg-white/70 nx-glow-dot" />
            {t("Pipeline.live")}
          </span>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-6 sm:gap-0">
          {STEPS.map(({ step, labelKey, descKey, icon: Icon }, i) => (
            <div key={step} className="flex items-start flex-1 min-w-[80px]">
              <div className="nx-pipeline-step flex flex-col items-center text-center flex-1 group">
                <div className="nx-pipeline-icon w-10 h-10 border border-black/[0.1] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-center mb-3 group-hover:border-black/30 dark:group-hover:border-white/20 group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04] transition-all duration-300">
                  <Icon className="w-4 h-4 text-black/45 dark:text-white/45 group-hover:text-black/75 dark:group-hover:text-white/75 transition-colors duration-300" strokeWidth={1.25} />
                </div>
                <span className="font-mono text-[10px] text-black/50 dark:text-white/50 tabular-nums mb-0.5">{step}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-black/75 dark:text-white/75 font-medium">
                  {t(labelKey)}
                </span>
                <span className="font-mono text-[10px] text-black/40 dark:text-white/40 mt-2 leading-relaxed max-w-[110px]">
                  {t(descKey)}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="hidden sm:flex flex-1 items-center justify-center mb-8 max-w-[48px]">
                  <div className="w-full h-px bg-black/[0.08] dark:bg-white/[0.08] relative">
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-black/25 dark:bg-white/25" />
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
