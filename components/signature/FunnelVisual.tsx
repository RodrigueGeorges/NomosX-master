"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * FunnelVisual — mission-control style pipeline hero.
 *
 * Inspiration: SpaceX mission control readout + Harvard Growth Lab "How we work".
 * Renders the 4-stage NomosX pipeline as an animated funnel that "processes"
 * chaos into a defensible position. Each stage shows live-ish metrics so the
 * visitor sees the differentiator (scenarios + verification) instead of being
 * told about it.
 *
 * Visual language: pure black canvas, hairline borders, mono type, single
 * accent dot per stage. No filled buttons, no gradients on chrome — only
 * light as accent (SpaceX rule).
 */

type Stage = {
  id: string;
  labelKey: string;
  descKey: string;
  metric: string;
  metricLabelKey: string;
};

const STAGES: Stage[] = [
  {
    id: "map",
    labelKey: "Brand.methodSteps.0",
    descKey: "FunnelVisual.mapDesc",
    metric: "250M+",
    metricLabelKey: "FunnelVisual.sources",
  },
  {
    id: "confront",
    labelKey: "Brand.methodSteps.1",
    descKey: "FunnelVisual.confrontDesc",
    metric: "6",
    metricLabelKey: "FunnelVisual.adversarial",
  },
  {
    id: "quantify",
    labelKey: "Brand.methodSteps.2",
    descKey: "FunnelVisual.quantifyDesc",
    metric: "3-5",
    metricLabelKey: "FunnelVisual.scenarios",
  },
  {
    id: "decide",
    labelKey: "Brand.methodSteps.3",
    descKey: "FunnelVisual.decideDesc",
    metric: "100%",
    metricLabelKey: "FunnelVisual.traceable",
  },
];

// Scenario distribution bars — incarnates "scenario-weighted" visually.
const SCENARIO_BARS = [
  { label: "Base case", pct: 52, tone: "high" as const },
  { label: "Upside", pct: 26, tone: "mid" as const },
  { label: "Tail risk", pct: 14, tone: "low" as const },
  { label: "Black swan", pct: 8, tone: "tail" as const },
];

interface FunnelVisualProps {
  className?: string;
  /** When true, animates the active stage pointer on a loop (hero mode). */
  animated?: boolean;
}

export function FunnelVisual({ className, animated = true }: FunnelVisualProps) {
  const t = useTranslations();
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Mount-in reveal
  useEffect(() => setMounted(true), []);

  // Auto-advance the active stage pointer — paused when off-screen or reduced-motion.
  useEffect(() => {
    if (!animated || !mounted) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setActive((a) => (a + 1) % STAGES.length);
      timer = setTimeout(() => {
        raf = requestAnimationFrame(tick);
      }, 2200);
    };
    timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 1800);

    // Pause when not visible
    const el = sectionRef.current;
    const io =
      el && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                if (!e.isIntersecting) {
                  cancelAnimationFrame(raf);
                  clearTimeout(timer);
                }
              }
            },
            { threshold: 0.1 }
          )
        : null;
    if (el && io) io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      io?.disconnect();
    };
  }, [animated, mounted]);

  return (
    <div
      ref={sectionRef}
      className={cn(
        "relative w-full nx-surface p-5 sm:p-7",
        "border-black/[0.08] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.015]",
        mounted && "nx-funnel-mounted",
        className
      )}
      aria-label={t("FunnelVisual.ariaLabel")}
    >
      {/* Header row — mission control */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-black/80 dark:bg-white/80 nx-glow-dot" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/55 dark:text-white/55">
            {t("FunnelVisual.livePipeline")}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/35 dark:text-white/35">
          {t("FunnelVisual.chaosIn")} → {t("FunnelVisual.nomosOut")}
        </span>
      </div>

      {/* Stage rail */}
      <div className="relative">
        {/* Connector line */}
        <div
          className="absolute top-5 left-0 right-0 h-px bg-black/[0.06] dark:bg-white/[0.06] hidden sm:block"
          aria-hidden="true"
        />
        <div
          className="absolute top-5 left-0 h-px bg-black/40 dark:bg-white/40 hidden sm:block nx-funnel-progress"
          style={{ width: `${((active + 1) / STAGES.length) * 100}%` }}
          aria-hidden="true"
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px sm:gap-0">
          {STAGES.map((stage, i) => {
            const isActive = i === active;
            const isPast = i < active;
            return (
              <div
                key={stage.id}
                className={cn(
                  "relative flex flex-col items-center text-center px-2 sm:px-3 pt-0 pb-4 sm:pb-5 transition-opacity duration-500",
                  isActive ? "opacity-100" : isPast ? "opacity-70" : "opacity-45"
                )}
              >
                {/* Node */}
                <div
                  className={cn(
                    "relative z-10 w-10 h-10 flex items-center justify-center border bg-white dark:bg-black transition-all duration-300",
                    isActive
                      ? "border-black/60 dark:border-white/60 bg-black/[0.06] dark:bg-white/[0.06] shadow-[0_0_24px_-4px_rgba(0,0,0,0.12)]"
                      : isPast
                      ? "border-black/25 dark:border-white/25 bg-black/[0.02] dark:bg-white/[0.02]"
                      : "border-black/[0.1] dark:border-white/[0.1]"
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums transition-colors",
                      isActive ? "text-black dark:text-white" : "text-black/45 dark:text-white/45"
                    )}
                  >
                    0{i + 1}
                  </span>
                  {isActive && (
                    <span
                      className="absolute inset-0 border border-black/30 dark:border-white/30 nx-funnel-pulse"
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    "mt-3 font-mono text-[11px] uppercase tracking-[0.14em] font-medium transition-colors",
                    isActive ? "text-black dark:text-white" : "text-black/60 dark:text-white/60"
                  )}
                >
                  {t(stage.labelKey)}
                </span>

                {/* Metric */}
                <span className="mt-1.5 font-mono text-base sm:text-lg font-light text-black dark:text-white tabular-nums leading-none">
                  {stage.metric}
                </span>
                <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40">
                  {t(stage.metricLabelKey)}
                </span>

                {/* Desc — only on active stage to keep density low */}
                <span
                  className={cn(
                    "mt-2 font-mono text-[10px] text-black/45 dark:text-white/45 leading-relaxed max-w-[140px] transition-opacity duration-300",
                    isActive ? "opacity-100" : "opacity-0 sm:opacity-0"
                  )}
                >
                  {t(stage.descKey)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Output panel — scenario distribution (the differentiator made visible) */}
      <div className="mt-2 sm:mt-4 border-t border-black/[0.06] dark:border-white/[0.06] pt-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/55 dark:text-white/55">
            {t("FunnelVisual.scenarioDistribution")}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/35 dark:text-white/35">
            {t("FunnelVisual.stressTested")}
          </span>
        </div>
        <div className="space-y-2">
          {SCENARIO_BARS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-black/55 dark:text-white/55 w-20 sm:w-24 shrink-0">
                {s.label}
              </span>
              <div className="flex-1 h-1.5 bg-black/[0.04] dark:bg-white/[0.04] relative overflow-hidden">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 nx-funnel-bar",
                    s.tone === "high" && "bg-black/70 dark:bg-white/70",
                    s.tone === "mid" && "bg-black/45 dark:bg-white/45",
                    s.tone === "low" && "bg-black/25 dark:bg-white/25",
                    s.tone === "tail" && "bg-black/12 dark:bg-white/12"
                  )}
                  style={{
                    width: mounted ? `${s.pct}%` : "0%",
                    transitionDelay: `${300 + i * 180}ms`,
                  }}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-black/60 dark:text-white/60 w-9 text-right shrink-0">
                {s.pct}%
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-[10px] text-black/35 dark:text-white/35 leading-relaxed">
          {t("FunnelVisual.distributionNote")}
        </p>
      </div>

      <style jsx global>{`
        .nx-funnel-pulse {
          animation: nx-funnel-pulse 1.8s ease-in-out infinite;
        }
        @keyframes nx-funnel-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.18); opacity: 0; }
        }
        .nx-funnel-progress {
          transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nx-funnel-bar {
          transition: width 1.1s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .nx-funnel-pulse { animation: none; }
          .nx-funnel-progress,
          .nx-funnel-bar { transition: none; }
        }
      `}</style>
    </div>
  );
}
