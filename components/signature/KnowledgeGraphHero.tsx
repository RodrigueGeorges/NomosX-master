"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * KnowledgeGraphHero — full-bleed citation network backdrop.
 *
 * The visual DNA of NomosX, made literal: sources (nodes) across domains
 * converge into a single defensible position (the central node). Edges light
 * up sequentially — evidence binding into order. This is "connect ideas across
 * domains" and "the map is the product" rendered as atmosphere, not chrome.
 *
 * Charter discipline (SpaceX two-color rule):
 *   • Black canvas, #f0f0fa hairlines, white = the only accent
 *   • No filled nodes, no gradients on chrome, no blue (PolicyNetwork was off-charter)
 *   • Light as accent: only the active edge + central node glow
 *   • Mono labels, uppercase tracking — instrument-panel readout
 *
 * Pure SVG + CSS animations. No external image, no canvas, no deps.
 * Respects prefers-reduced-motion and pauses when off-screen.
 */

type Node = {
  id: string;
  x: number; // 0-100 viewBox units
  y: number;
  r: number;
  label: string;
  domain: string;
  /** delay (ms) before this node's edge lights up */
  delay: number;
};

// 12 source nodes across 8 domains + 1 central position node.
// Coordinates hand-tuned for a balanced radial composition.
const NODES: Node[] = [
  { id: "n1", x: 22, y: 30, r: 1.6, label: "OpenAlex", domain: "ACADEMIC", delay: 200 },
  { id: "n2", x: 30, y: 18, r: 1.4, label: "arXiv", domain: "PREPRINT", delay: 600 },
  { id: "n3", x: 14, y: 44, r: 1.5, label: "PubMed", domain: "BIOMED", delay: 1000 },
  { id: "n4", x: 26, y: 62, r: 1.7, label: "IMF", domain: "MACRO", delay: 1400 },
  { id: "n5", x: 18, y: 78, r: 1.4, label: "World Bank", domain: "DATA", delay: 1800 },
  { id: "n6", x: 38, y: 84, r: 1.5, label: "OECD", domain: "POLICY", delay: 2200 },
  { id: "n7", x: 62, y: 84, r: 1.4, label: "RAND", domain: "DEFENSE", delay: 2600 },
  { id: "n8", x: 74, y: 78, r: 1.6, label: "Brookings", domain: "POLICY", delay: 3000 },
  { id: "n9", x: 82, y: 62, r: 1.5, label: "Reuters", domain: "WIRE", delay: 3400 },
  { id: "n10", x: 86, y: 44, r: 1.4, label: "NATO", domain: "STRAT", delay: 3800 },
  { id: "n11", x: 70, y: 18, r: 1.5, label: "SSRN", domain: "SOCSCI", delay: 4200 },
  { id: "n12", x: 78, y: 30, r: 1.4, label: "Crunchbase", domain: "MARKET", delay: 4600 },
];

const CENTER = { x: 50, y: 50, r: 3.2, label: "POSITION" };

interface KnowledgeGraphHeroProps {
  className?: string;
  /** Show node labels (default: true on sm+, false on mobile for density) */
  showLabels?: boolean;
}

export function KnowledgeGraphHero({ className, showLabels = true }: KnowledgeGraphHeroProps) {
  const [mounted, setMounted] = useState(false);
  const [cycle, setCycle] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Loop the edge-lighting cycle every ~7s so the convergence replays.
  useEffect(() => {
    if (!mounted) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      setCycle((c) => c + 1);
      timer = setTimeout(loop, 7000);
    };
    timer = setTimeout(loop, 7000);

    const el = containerRef.current;
    const io =
      el && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                if (!e.isIntersecting) clearTimeout(timer);
                else timer = setTimeout(loop, 7000);
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

  // Stable edge keys so React doesn't remount SVG nodes each cycle.
  const edges = useMemo(
    () => NODES.map((n) => ({ from: n, to: CENTER, key: `e-${n.id}` })),
    []
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 pointer-events-none overflow-hidden",
        className
      )}
      aria-hidden="true"
    >
      {/* Faint radial glow at the center — single light source (charter: light as accent) */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(80%,640px)] aspect-square"
        style={{
          background:
            "radial-gradient(circle, rgba(240,240,250,0.05) 0%, transparent 60%)",
        }}
      />

      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Edges — hairline, light up sequentially per cycle */}
        {edges.map(({ from, to, key }) => {
          const active = mounted;
          return (
            <line
              key={`${key}-${cycle}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="rgba(240,240,250,0.10)"
              strokeWidth="0.18"
              className="nx-kg-edge"
              style={{
                animationDelay: `${from.delay}ms`,
                animationPlayState: active ? "running" : "paused",
              }}
            />
          );
        })}

        {/* Source nodes */}
        {NODES.map((n) => (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="rgba(240,240,250,0.22)"
              stroke="rgba(240,240,250,0.30)"
              strokeWidth="0.15"
            />
            {showLabels && (
              <text
                x={n.x}
                y={n.y - n.r - 1.2}
                textAnchor="middle"
                className="fill-white/[0.28]"
                style={{ fontSize: "1.7px", fontFamily: "var(--font-mono), monospace", letterSpacing: "0.05em" }}
              >
                {n.label.toUpperCase()}
              </text>
            )}
          </g>
        ))}

        {/* Central position node — the convergence point */}
        <g>
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r={CENTER.r}
            fill="rgba(240,240,250,0.08)"
            stroke="rgba(240,240,250,0.55)"
            strokeWidth="0.25"
            className="nx-kg-center"
          />
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r={CENTER.r + 1.4}
            fill="none"
            stroke="rgba(240,240,250,0.20)"
            strokeWidth="0.12"
            className="nx-kg-ring"
          />
          {showLabels && (
            <text
              x={CENTER.x}
              y={CENTER.y + CENTER.r + 3.2}
              textAnchor="middle"
              className="fill-white/[0.55]"
              style={{ fontSize: "2.4px", fontFamily: "var(--font-mono), monospace", letterSpacing: "0.18em" }}
            >
              {CENTER.label}
            </text>
          )}
        </g>
      </svg>

      <style jsx global>{`
        @keyframes nx-kg-edge {
          0% { stroke: rgba(240,240,250,0.06); }
          18% { stroke: rgba(240,240,250,0.55); }
          40%, 100% { stroke: rgba(240,240,250,0.10); }
        }
        .nx-kg-edge {
          animation: nx-kg-edge 5s ease-out forwards;
        }
        @keyframes nx-kg-center {
          0%, 100% { stroke-opacity: 0.55; }
          50% { stroke-opacity: 0.9; }
        }
        .nx-kg-center {
          animation: nx-kg-center 4s ease-in-out infinite;
        }
        @keyframes nx-kg-ring {
          0% { transform: scale(1); opacity: 0.2; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .nx-kg-ring {
          transform-origin: 50px 50px;
          transform-box: fill-box;
          animation: nx-kg-ring 3.5s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .nx-kg-edge,
          .nx-kg-center,
          .nx-kg-ring { animation: none; }
        }
      `}</style>
    </div>
  );
}
