"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface CausalLinkData {
  id: string;
  linkIndex: number;
  claim: string;
  evidence: string;
  warrant: string;
  temporalStatus: string;
  derivesFrom: number | null;
  sourceRef: number | null;
  unsupported: boolean;
}

interface CausalChainDAGProps {
  links: CausalLinkData[];
}

const STATUS_COLORS: Record<string, string> = {
  established: "#10B981",
  emerging: "#3B82F6",
  projected: "#8B5CF6",
  contested: "#F97316",
};

export function CausalChainDAG({ links }: CausalChainDAGProps) {
  const [selected, setSelected] = useState<CausalLinkData | null>(null);

  const sorted = useMemo(() => [...links].sort((a, b) => a.linkIndex - b.linkIndex), [links]);

  const positions = useMemo(() => {
    const map = new Map<number, { x: number; y: number; depth: number }>();
    if (sorted.length === 0) return map;

    const childrenOf = new Map<number | null, number[]>();
    for (const link of sorted) {
      const parent = link.derivesFrom;
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(link.linkIndex);
    }

    const depthCache = new Map<number, number>();
    function getDepth(idx: number): number {
      if (depthCache.has(idx)) return depthCache.get(idx)!;
      const link = sorted.find((l) => l.linkIndex === idx);
      if (!link || link.derivesFrom === null) {
        depthCache.set(idx, 0);
        return 0;
      }
      const d = getDepth(link.derivesFrom) + 1;
      depthCache.set(idx, d);
      return d;
    }

    const byDepth = new Map<number, number[]>();
    for (const link of sorted) {
      const d = getDepth(link.linkIndex);
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(link.linkIndex);
    }

    const maxDepth = Math.max(...byDepth.keys(), 0);
    for (const [depth, indices] of byDepth) {
      const xStep = 80 / Math.max(indices.length, 1);
      indices.forEach((idx, i) => {
        map.set(idx, {
          x: 10 + xStep * (i + 0.5),
          y: 10 + (maxDepth === 0 ? 40 : (depth / maxDepth) * 70),
          depth,
        });
      });
    }
    return map;
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <div className="border border-black/[0.08] bg-black/25 p-8 text-center">
        <p className="text-sm text-black/50 font-mono">No causal chain extracted for this brief.</p>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <div className="relative border border-black/[0.08] bg-black/25 min-h-[400px]">
        <div className="absolute top-3 left-3 text-[10px] font-mono uppercase tracking-wider text-black/40">
          Causal Chain — {sorted.length} links
        </div>
        <svg viewBox="0 0 100 100" className="w-full h-[400px]" preserveAspectRatio="xMidYMid meet">
          {sorted.map((link) => {
            const pos = positions.get(link.linkIndex);
            if (!pos) return null;
            const parentPos = link.derivesFrom !== null ? positions.get(link.derivesFrom) : null;
            return (
              <g key={link.id}>
                {parentPos && (
                  <path
                    d={`M ${parentPos.x} ${parentPos.y} C ${(parentPos.x + pos.x) / 2} ${parentPos.y}, ${(parentPos.x + pos.x) / 2} ${pos.y}, ${pos.x} ${pos.y}`}
                    fill="none"
                    stroke={link.unsupported ? "rgba(239,68,68,0.2)" : "rgba(99,102,241,0.2)"}
                    strokeWidth="0.3"
                    strokeDasharray={link.unsupported ? "1,1" : undefined}
                  />
                )}
              </g>
            );
          })}
          {sorted.map((link) => {
            const pos = positions.get(link.linkIndex);
            if (!pos) return null;
            const color = link.unsupported ? "#EF4444" : (STATUS_COLORS[link.temporalStatus] || "#6366F1");
            const isSelected = selected?.id === link.id;
            return (
              <g
                key={link.id}
                onClick={() => setSelected(isSelected ? null : link)}
                className="cursor-pointer"
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected ? 3 : 2.2}
                  fill={color}
                  opacity={isSelected ? 1 : 0.75}
                  stroke={isSelected ? "white" : "none"}
                  strokeWidth={isSelected ? 0.4 : 0}
                />
                <text
                  x={pos.x}
                  y={pos.y - 3.5}
                  textAnchor="middle"
                  className="fill-white/50"
                  style={{ fontSize: "1.8px", fontFamily: "monospace" }}
                >
                  {link.claim.length > 22 ? link.claim.slice(0, 22) + "…" : link.claim}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="border border-black/[0.08] bg-black/25 p-4 min-h-[400px]">
        {selected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selected.unsupported ? "#EF4444" : (STATUS_COLORS[selected.temporalStatus] || "#6366F1") }}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-black/50">
                {selected.unsupported ? "unsupported" : selected.temporalStatus}
              </span>
              {selected.sourceRef !== null && (
                <span className="text-[10px] font-mono text-black/40">[SRC-{selected.sourceRef}]</span>
              )}
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-black/40 mb-1">Claim</p>
              <p className="text-sm text-black leading-relaxed">{selected.claim}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-black/40 mb-1">Evidence</p>
              <p className="text-xs text-black/60 leading-relaxed">{selected.evidence}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-black/40 mb-1">Warrant</p>
              <p className="text-xs text-black/60 leading-relaxed">{selected.warrant}</p>
            </div>
            {selected.derivesFrom !== null && (
              <p className="text-[10px] font-mono text-black/40 pt-2 border-t border-black/[0.06]">
                Derives from link #{selected.derivesFrom}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-black/40 font-mono text-center">
              Click a node to inspect<br />the causal link
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
