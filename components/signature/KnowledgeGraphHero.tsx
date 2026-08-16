"use client";

import { cn } from "@/lib/utils";

/**
 * KnowledgeGraphHero — atmospheric backdrop for the About mission section.
 *
 * Same visual language as AgenticCore but lighter — a few drifting points
 * and a breathing center, behind the mission text. Not a second hero; an
 * atmosphere. The text is the hero; this is the air it breathes in.
 *
 * No labels, no source names, no agent names. Pure light + motion.
 */

interface KnowledgeGraphHeroProps {
  className?: string;
}

export function KnowledgeGraphHero({ className }: KnowledgeGraphHeroProps) {
  return (
    <div
      className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)}
      aria-hidden="true"
    >
      {/* Radial glow — single light source */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(70%,520px)] aspect-square"
        style={{
          background: "radial-gradient(circle, rgba(240,240,250,0.04) 0%, transparent 60%)",
        }}
      />
      <svg
        className="absolute inset-0 w-full h-full opacity-40"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {(() => {
          // Static scattered points — no animation loop (backdrop, not focal)
          const pts = [
            { x: 28, y: 32, r: 0.6, o: 0.2 },
            { x: 72, y: 28, r: 0.5, o: 0.15 },
            { x: 22, y: 58, r: 0.7, o: 0.18 },
            { x: 78, y: 62, r: 0.5, o: 0.12 },
            { x: 35, y: 75, r: 0.6, o: 0.16 },
            { x: 65, y: 22, r: 0.4, o: 0.14 },
            { x: 45, y: 38, r: 0.5, o: 0.1 },
            { x: 58, y: 68, r: 0.6, o: 0.13 },
          ];
          const center = { x: 50, y: 50 };
          return (
            <>
              {/* Faint convergence lines */}
              {pts.map((p, i) => (
                <line
                  key={`l-${i}`}
                  x1={p.x}
                  y1={p.y}
                  x2={center.x}
                  y2={center.y}
                  stroke="rgba(240,240,250,0.04)"
                  strokeWidth="0.1"
                />
              ))}
              {/* Points */}
              {pts.map((p, i) => (
                <circle
                  key={`p-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={p.r}
                  fill={`rgba(240,240,250,${p.o})`}
                />
              ))}
              {/* Breathing center */}
              <circle
                cx={center.x}
                cy={center.y}
                r="2"
                fill="rgba(240,240,250,0.05)"
                stroke="rgba(240,240,250,0.35)"
                strokeWidth="0.12"
                className="nx-kg-breath"
              />
              <circle
                cx={center.x}
                cy={center.y}
                r="2"
                fill="none"
                stroke="rgba(240,240,250,0.15)"
                strokeWidth="0.08"
                className="nx-kg-emit"
              />
            </>
          );
        })()}
      </svg>
      <style jsx global>{`
        @keyframes nx-kg-breath {
          0%, 100% { stroke-opacity: 0.35; r: 2; }
          50% { stroke-opacity: 0.6; r: 2.5; }
        }
        .nx-kg-breath { animation: nx-kg-breath 4s ease-in-out infinite; }
        @keyframes nx-kg-emit {
          0% { r: 2; stroke-opacity: 0.15; }
          100% { r: 12; stroke-opacity: 0; }
        }
        .nx-kg-emit { animation: nx-kg-emit 6s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .nx-kg-breath, .nx-kg-emit { animation: none; }
        }
      `}</style>
    </div>
  );
}
