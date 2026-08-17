"use client";

import { cn } from "@/lib/utils";

/**
 * AgenticCore — mesh gradient, CSS only.
 *
 * The Linear/Stripe/Vercel 2026 approach: layered radial-gradients
 * on a black base, drifting slowly via CSS keyframes. No canvas,
 * no JS animation loop, no particles. Under 1KB of CSS.
 *
 * The gradient is the atmosphere — not the product. It sits at 2-4%
 * above pure black, breathing slowly. You feel it, not see it.
 *
 * Charter: black canvas, #f0f0fa, white = only accent, light = life.
 */

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

export function AgenticCore({ className, variant = "atmosphere" }: AgenticCoreProps) {
  return (
    <div
      className={cn(
        variant === "atmosphere"
          ? "fixed inset-0 pointer-events-none overflow-hidden z-0 nx-mesh-bg"
          : "absolute inset-0 pointer-events-none overflow-hidden nx-mesh-bg",
        className
      )}
      aria-hidden="true"
    />
  );
}
