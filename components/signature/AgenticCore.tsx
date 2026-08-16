"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * AgenticCore — the autonomous think tank, rendered as a living system.
 *
 * What it shows (not tells):
 *   • 6 specialist agents in a ring, each pulsing on its own rhythm (autonomy)
 *   • Cross-connections between agents that light up randomly (debate / MoA)
 *   • All agents converge to a central synthesis node (the emerging position)
 *   • Occasionally a connection pulses backward (self-correction / Reflexion)
 *   • The center breathes — the position is alive, not static
 *
 * What it does NOT show:
 *   • No fake metrics, no hardcoded percentages, no source name lists
 *   • No linear pipeline — this is a parallel + convergent system
 *   • No clutter — 6 agent labels + 1 center label, that's it
 *
 * Charter: black canvas, #f0f0fa hairlines, white = only accent, light = life.
 */

// 6 specialist agents (matches MoA in AGENTS.md: Methodology, Bias, Evidence,
// Synthesis, Skeptic, Uncertainty). Positioned in a hexagonal ring.
const AGENTS = [
  { id: "methodology", label: "Methodology", angle: -90, rhythm: 3200 },
  { id: "bias", label: "Bias", angle: -30, rhythm: 2800 },
  { id: "evidence", label: "Evidence", angle: 30, rhythm: 3600 },
  { id: "synthesis", label: "Synthesis", angle: 90, rhythm: 3000 },
  { id: "skeptic", label: "Skeptic", angle: 150, rhythm: 3400 },
  { id: "uncertainty", label: "Uncertainty", angle: 210, rhythm: 2600 },
];

const RADIUS = 32; // ring radius in viewBox units
const CENTER = { x: 50, y: 50 };

// Precompute agent positions
const POSITIONS = AGENTS.map((a) => {
  const rad = (a.angle * Math.PI) / 180;
  return {
    ...a,
    x: CENTER.x + RADIUS * Math.cos(rad),
    y: CENTER.y + RADIUS * Math.sin(rad),
  };
});

// Cross-connections (debate pairs) — not all-to-all, curated non-adjacent pairs
const DEBATE_LINKS = [
  [0, 3], // Methodology ↔ Synthesis
  [1, 4], // Bias ↔ Skeptic
  [2, 5], // Evidence ↔ Uncertainty
  [0, 4], // Methodology ↔ Skeptic
  [1, 5], // Bias ↔ Uncertainty
];

interface AgenticCoreProps {
  className?: string;
  /** "full" = with labels (home section), "minimal" = pure motion (hero backdrop) */
  variant?: "full" | "minimal";
}

export function AgenticCore({ className, variant = "full" }: AgenticCoreProps) {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Slow tick for debate link cycling — which cross-connection is active
  useEffect(() => {
    if (!mounted) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let timer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setTick((t) => t + 1);
      timer = setTimeout(cycle, 2400);
    };
    timer = setTimeout(cycle, 2000);

    const el = containerRef.current;
    const io =
      el && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                if (!e.isIntersecting) clearTimeout(timer);
                else timer = setTimeout(cycle, 2400);
              }
            },
            { threshold: 0.05 }
          )
        : null;
    if (el && io) io.observe(el);

    return () => {
      clearTimeout(timer);
      io?.disconnect();
    };
  }, [mounted]);

  const activeDebate = tick % DEBATE_LINKS.length;
  const showLabels = variant === "full";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full flex items-center justify-center",
        variant === "full" ? "min-h-[340px] sm:min-h-[400px]" : "absolute inset-0",
        className
      )}
      aria-label={t("AgenticCore.ariaLabel")}
    >
      <svg
        className={cn(
          "w-full h-full",
          variant === "minimal" && "absolute inset-0 opacity-60"
        )}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Convergence edges: each agent → center (hairline, always visible) */}
        {POSITIONS.map((p) => (
          <line
            key={`conv-${p.id}`}
            x1={p.x}
            y1={p.y}
            x2={CENTER.x}
            y2={CENTER.y}
            stroke="rgba(240,240,250,0.08)"
            strokeWidth="0.15"
          />
        ))}

        {/* Debate links — only the active one is bright, others are ghost-faint */}
        {DEBATE_LINKS.map(([a, b], i) => {
          const pa = POSITIONS[a];
          const pb = POSITIONS[b];
          const isActive = i === activeDebate && mounted;
          return (
            <line
              key={`debate-${a}-${b}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={isActive ? "rgba(240,240,250,0.45)" : "rgba(240,240,250,0.03)"}
              strokeWidth={isActive ? "0.2" : "0.12"}
              style={{ transition: "stroke 0.6s ease, stroke-width 0.6s ease" }}
            />
          );
        })}

        {/* Agent nodes — each pulses on its own rhythm (autonomy) */}
        {POSITIONS.map((p) => (
          <g key={p.id}>
            {/* Pulse ring */}
            <circle
              cx={p.x}
              cy={p.y}
              r="2.2"
              fill="none"
              stroke="rgba(240,240,250,0.15)"
              strokeWidth="0.1"
              className="nx-agent-pulse"
              style={{ animationDuration: `${p.rhythm}ms` }}
            />
            {/* Core dot */}
            <circle
              cx={p.x}
              cy={p.y}
              r="1.4"
              fill="rgba(240,240,250,0.25)"
              stroke="rgba(240,240,250,0.4)"
              strokeWidth="0.15"
            />
            {/* Label */}
            {showLabels && (
              <text
                x={p.x}
                y={p.y + (p.angle > 90 || p.angle < -90 ? 5.5 : -3.5)}
                textAnchor="middle"
                className="fill-white/[0.35]"
                style={{
                  fontSize: "2.2px",
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.08em",
                }}
              >
                {p.label.toUpperCase()}
              </text>
            )}
          </g>
        ))}

        {/* Center — synthesis node (breathes) */}
        <g>
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r="3"
            fill="rgba(240,240,250,0.06)"
            stroke="rgba(240,240,250,0.5)"
            strokeWidth="0.2"
            className="nx-agent-center"
          />
          {/* Expanding ring — the position emerging */}
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r="3"
            fill="none"
            stroke="rgba(240,240,250,0.25)"
            strokeWidth="0.12"
            className="nx-agent-emit"
          />
          {showLabels && (
            <text
              x={CENTER.x}
              y={CENTER.y + 8}
              textAnchor="middle"
              className="fill-white/[0.5]"
              style={{
                fontSize: "2.6px",
                fontFamily: "var(--font-mono), monospace",
                letterSpacing: "0.2em",
              }}
            >
              POSITION
            </text>
          )}
        </g>
      </svg>

      <style jsx global>{`
        @keyframes nx-agent-pulse {
          0%, 100% { r: 2.2; stroke-opacity: 0.15; }
          50% { r: 3.8; stroke-opacity: 0; }
        }
        .nx-agent-pulse {
          animation: nx-agent-pulse 3s ease-in-out infinite;
        }
        @keyframes nx-agent-center {
          0%, 100% { stroke-opacity: 0.5; r: 3; }
          50% { stroke-opacity: 0.85; r: 3.4; }
        }
        .nx-agent-center {
          animation: nx-agent-center 4s ease-in-out infinite;
        }
        @keyframes nx-agent-emit {
          0% { r: 3; stroke-opacity: 0.25; }
          100% { r: 12; stroke-opacity: 0; }
        }
        .nx-agent-emit {
          animation: nx-agent-emit 5s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .nx-agent-pulse,
          .nx-agent-center,
          .nx-agent-emit { animation: none; }
        }
      `}</style>
    </div>
  );
}
