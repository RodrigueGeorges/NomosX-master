"use client";

import { cn } from "@/lib/utils";

/**
 * KnowledgeGraphHero — thin wrapper around AgenticCore (minimal variant).
 *
 * Replaces the old hardcoded source-label network with the unified agentic
 * visual. Same role: full-bleed backdrop for the About mission section.
 * No labels, no source names — pure motion that conveys "autonomous system
 * working." The text floats on top, SpaceX-style.
 */

interface KnowledgeGraphHeroProps {
  className?: string;
}

export function KnowledgeGraphHero({ className }: KnowledgeGraphHeroProps) {
  // Lazy import to avoid circular deps — AgenticCore is the canonical visual.
  // We re-export it here so the About page import doesn't change.
  return (
    <AgenticCoreMinimal className={className} />
  );
}

function AgenticCoreMinimal({ className }: { className?: string }) {
  // Inline minimal version — pure SVG, no labels, no hooks beyond mount.
  // Keeps the About hero lightweight (no tick cycling, just breathing).
  return (
    <div
      className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)}
      aria-hidden="true"
    >
      {/* Faint radial glow — single light source */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(70%,520px)] aspect-square"
        style={{
          background: "radial-gradient(circle, rgba(240,240,250,0.04) 0%, transparent 60%)",
        }}
      />
      <svg
        className="absolute inset-0 w-full h-full opacity-50"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {(() => {
          const RADIUS = 30;
          const cx = 50;
          const cy = 50;
          const agents = Array.from({ length: 6 }, (_, i) => {
            const angle = (-90 + i * 60) * (Math.PI / 180);
            return {
              x: cx + RADIUS * Math.cos(angle),
              y: cy + RADIUS * Math.sin(angle),
              rhythm: 2800 + i * 400,
            };
          });
          return (
            <>
              {/* Convergence lines */}
              {agents.map((a, i) => (
                <line
                  key={`l-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={cx}
                  y2={cy}
                  stroke="rgba(240,240,250,0.06)"
                  strokeWidth="0.12"
                />
              ))}
              {/* Agent nodes */}
              {agents.map((a, i) => (
                <g key={`n-${i}`}>
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r="2"
                    fill="none"
                    stroke="rgba(240,240,250,0.12)"
                    strokeWidth="0.08"
                    className="nx-kg-pulse"
                    style={{ animationDelay: `${i * 400}ms`, animationDuration: `${a.rhythm}ms` }}
                  />
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r="1.2"
                    fill="rgba(240,240,250,0.18)"
                    stroke="rgba(240,240,250,0.3)"
                    strokeWidth="0.1"
                  />
                </g>
              ))}
              {/* Center */}
              <circle
                cx={cx}
                cy={cy}
                r="2.5"
                fill="rgba(240,240,250,0.05)"
                stroke="rgba(240,240,250,0.4)"
                strokeWidth="0.15"
                className="nx-kg-breath"
              />
              <circle
                cx={cx}
                cy={cy}
                r="2.5"
                fill="none"
                stroke="rgba(240,240,250,0.2)"
                strokeWidth="0.1"
                className="nx-kg-emit"
              />
            </>
          );
        })()}
      </svg>
      <style jsx global>{`
        @keyframes nx-kg-pulse {
          0%, 100% { r: 2; stroke-opacity: 0.12; }
          50% { r: 3.5; stroke-opacity: 0; }
        }
        .nx-kg-pulse { animation: nx-kg-pulse 3s ease-in-out infinite; }
        @keyframes nx-kg-breath {
          0%, 100% { stroke-opacity: 0.4; r: 2.5; }
          50% { stroke-opacity: 0.75; r: 2.9; }
        }
        .nx-kg-breath { animation: nx-kg-breath 4s ease-in-out infinite; }
        @keyframes nx-kg-emit {
          0% { r: 2.5; stroke-opacity: 0.2; }
          100% { r: 10; stroke-opacity: 0; }
        }
        .nx-kg-emit { animation: nx-kg-emit 5s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .nx-kg-pulse, .nx-kg-breath, .nx-kg-emit { animation: none; }
        }
      `}</style>
    </div>
  );
}
