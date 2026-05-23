"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * VerdictCard — Screenshot-able probabilistic verdict display
 * ─────────────────────────────────────────────────────────
 * The single most important visual asset of NomosX.
 * Designed to be shared, screenshotted, embedded.
 *
 * Principles:
 *   • Monospace numbers = data authority
 *   • Generous whitespace = breathing room
 *   • Single accent (#4A9EFF) = focus
 *   • No gradients on numbers = pure signal
 */

interface VerdictCardProps {
  /** Verdict label, e.g. "72%", "HIGH CONFIDENCE", "4.2σ" */
  value: string;
  /** Short label, e.g. "Probability", "Confidence", "Deviation" */
  label?: string;
  /** Contextual subtitle, e.g. "Based on 14 peer-reviewed sources" */
  subtitle?: string;
  /** Visual weight: compact (sidebar) or featured (hero) */
  size?: "compact" | "featured";
  /** Optional className for positioning */
  className?: string;
  /** Whether to animate the number trace-in on mount */
  animate?: boolean;
}

export function VerdictCard({
  value,
  label = "Probability",
  subtitle,
  size = "featured",
  className,
  animate = true,
}: VerdictCardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (animate) {
      const t = setTimeout(() => setMounted(true), 100);
      return () => clearTimeout(t);
    }
    setMounted(true);
  }, [animate]);

  const isCompact = size === "compact";

  return (
    <div
      className={cn(
        "relative inline-flex flex-col items-center justify-center",
        "border border-white/[0.07] bg-bg-elevated",
        isCompact ? "px-6 py-5 rounded-2xl" : "px-10 py-10 rounded-3xl",
        className
      )}
    >
      {/* Subtle top accent line */}
      <div
        className={cn(
          "absolute top-0 left-1/2 -translate-x-1/2 h-[1px] bg-accent/40",
          isCompact ? "w-16" : "w-24"
        )}
      />

      {/* Label */}
      <span
        className={cn(
          "font-mono uppercase tracking-[0.18em] text-accent/70",
          isCompact ? "text-[10px] mb-2" : "text-[11px] mb-3"
        )}
      >
        {label}
      </span>

      {/* Verdict value — monospace, trace-in animation */}
      <span
        className={cn(
          "font-mono font-light text-text tabular-nums tracking-tight",
          "transition-all duration-700",
          mounted ? "opacity-100 blur-0 translate-y-0" : "opacity-30 blur-[2px] translate-y-1",
          isCompact ? "text-3xl" : "text-6xl sm:text-7xl"
        )}
      >
        {value}
      </span>

      {/* Subtitle */}
      {subtitle && (
        <span
          className={cn(
            "text-white/40 font-sans",
            isCompact ? "text-[11px] mt-2" : "text-sm mt-4",
            "transition-all duration-700 delay-150",
            mounted ? "opacity-100" : "opacity-0"
          )}
        >
          {subtitle}
        </span>
      )}

      {/* Bottom micro-line */}
      <div
        className={cn(
          "absolute bottom-0 left-1/2 -translate-x-1/2 h-[1px] bg-white/[0.05]",
          isCompact ? "w-10" : "w-16"
        )}
      />
    </div>
  );
}
