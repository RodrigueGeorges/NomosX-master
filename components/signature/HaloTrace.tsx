"use client";

import { cn } from "@/lib/utils";

/**
 * HaloTrace — Citation chip with ethereal hover glow
 * ───────────────────────────────────────────────────
 * Used inside briefs and analyses for [SRC-N] references.
 * On hover: a faint blue halo breathes around the chip.
 *
 * Principles:
 *   • Monospace = data-native
 *   • Hover halo = living, not static
 *   • Compact = doesn't break reading flow
 */

interface HaloTraceProps {
  /** Citation index, e.g. "1", "7", "12" */
  index: number | string;
  /** Optional click handler (scroll to source) */
  onClick?: () => void;
  /** Additional className */
  className?: string;
}

export function HaloTrace({ index, onClick, className }: HaloTraceProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center",
        "px-1.5 py-0.5 rounded",
        "border border-white/[0.06] bg-white/[0.02]",
        "font-mono text-[11px] font-medium tracking-tight",
        "text-accent/80",
        "transition-all duration-300 ease-out",
        "hover:border-accent/25 hover:bg-accent/[0.04] hover:text-accent",
        "hover:shadow-[0_0_20px_rgba(74,158,255,0.10)]",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/30",
        className
      )}
      aria-label={`Source ${index}`}
    >
      <span className="opacity-50 mr-0.5">[</span>
      <span className="tabular-nums">SRC-{index}</span>
      <span className="opacity-50 ml-0.5">]</span>
    </button>
  );
}

/**
 * HaloTraceGroup — A cluster of citations, space-separated
 */
interface HaloTraceGroupProps {
  indices: number[];
  className?: string;
}

export function HaloTraceGroup({ indices, className }: HaloTraceGroupProps) {
  return (
    <span className={cn("inline-flex flex-wrap gap-1.5", className)}>
      {indices.map((i) => (
        <HaloTrace key={i} index={i} />
      ))}
    </span>
  );
}
