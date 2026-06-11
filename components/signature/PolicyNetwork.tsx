"use client";

import { cn } from "@/lib/utils";

type NetworkNode = { x: number; y: number; label: string; center?: boolean };

const NODES: NetworkNode[] = [
  { x: 50, y: 48, label: "Policy & Governance", center: true },
  { x: 26, y: 26, label: "AI Infrastructure" },
  { x: 74, y: 28, label: "Sovereignty" },
  { x: 32, y: 68, label: "Economics" },
  { x: 70, y: 65, label: "Security" },
  { x: 18, y: 52, label: "Regulation" },
  { x: 82, y: 50, label: "Markets" },
];

interface PolicyNetworkProps {
  className?: string;
}

/** Faint node-link network — hero backdrop (mockup HaloTrace style) */
export function PolicyNetwork({ className }: PolicyNetworkProps) {
  const center = NODES[0];

  return (
    <div className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)} aria-hidden>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(100%,520px)] aspect-square"
        style={{
          background:
            "radial-gradient(circle, rgba(74,158,255,0.06) 0%, transparent 65%)",
        }}
      />
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.45]"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {NODES.slice(1).map((n, i) => (
          <line
            key={i}
            x1={center.x}
            y1={center.y}
            x2={n.x}
            y2={n.y}
            stroke="rgba(74,158,255,0.12)"
            strokeWidth="0.25"
          />
        ))}
        {NODES.map((n) => (
          <g key={n.label}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.center ? 2.5 : 1.4}
              fill={n.center ? "rgba(74,158,255,0.55)" : "rgba(74,158,255,0.28)"}
              className={n.center ? "animate-breath" : undefined}
            />
            <text
              x={n.x}
              y={n.y + (n.center ? 6 : 5)}
              textAnchor="middle"
              className="fill-white/[0.22]"
              style={{ fontSize: n.center ? "2.8px" : "2.4px", fontFamily: "var(--font-mono), monospace" }}
            >
              {n.label.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
