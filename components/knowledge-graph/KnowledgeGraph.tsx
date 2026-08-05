"use client";

import { useState, useMemo } from "react";
import type { KnowledgeGraphData, GraphNode } from "@/lib/queries/knowledge-graph";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  entity: "#6366F1",
  claim: "#EC4899",
  theory: "#F59E0B",
  method: "#10B981",
  finding: "#3B82F6",
  policy: "#EF4444",
  trend: "#8B5CF6",
  controversy: "#F97316",
};

const EDGE_COLORS: Record<string, string> = {
  supports: "rgba(16,185,129,0.3)",
  contradicts: "rgba(239,68,68,0.3)",
  extends: "rgba(59,130,246,0.2)",
  precedes: "rgba(139,92,246,0.2)",
  causes: "rgba(245,158,11,0.3)",
  correlates: "rgba(99,102,241,0.2)",
  part_of: "rgba(148,163,184,0.15)",
  instance_of: "rgba(148,163,184,0.15)",
};

interface KnowledgeGraphProps {
  data: KnowledgeGraphData;
}

export function KnowledgeGraph({ data }: KnowledgeGraphProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  const types = useMemo(() => {
    const set = new Set(data.nodes.map((n) => n.type));
    return Array.from(set);
  }, [data.nodes]);

  const filteredNodes = useMemo(() => {
    if (!filterType) return data.nodes;
    return data.nodes.filter((n) => n.type === filterType);
  }, [data.nodes, filterType]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const visibleEdges = useMemo(() => {
    return data.edges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));
  }, [data.edges, filteredNodeIds]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const count = filteredNodes.length;
    if (count === 0) return map;

    const radius = 38;
    filteredNodes.forEach((node, i) => {
      if (count === 1) {
        map.set(node.id, { x: 50, y: 50 });
      } else {
        const angle = (i / count) * Math.PI * 2;
        map.set(node.id, {
          x: 50 + radius * Math.cos(angle),
          y: 50 + radius * Math.sin(angle),
        });
      }
    });
    return map;
  }, [filteredNodes]);

  if (data.nodes.length === 0) {
    return (
      <div className="border border-white/[0.08] bg-black/25 p-8 text-center">
        <p className="text-sm text-white/50 font-mono">No concepts extracted yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilterType(null)}
          className={cn(
            "px-3 py-1 text-[10px] font-mono uppercase tracking-wider border transition-colors",
            filterType === null
              ? "border-white/30 text-white bg-white/5"
              : "border-white/[0.08] text-white/50 hover:border-white/20"
          )}
        >
          All ({data.nodes.length})
        </button>
        {types.map((t) => {
          const count = data.nodes.filter((n) => n.type === t).length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(filterType === t ? null : t)}
              className={cn(
                "px-3 py-1 text-[10px] font-mono uppercase tracking-wider border transition-colors flex items-center gap-1.5",
                filterType === t
                  ? "border-white/30 text-white bg-white/5"
                  : "border-white/[0.08] text-white/50 hover:border-white/20"
              )}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: TYPE_COLORS[t] || "#888" }}
              />
              {t} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="relative border border-white/[0.08] bg-black/25 min-h-[400px]">
          <svg viewBox="0 0 100 100" className="w-full h-[400px]">
            {visibleEdges.map((edge) => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              if (!from || !to) return null;
              return (
                <line
                  key={edge.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={EDGE_COLORS[edge.type] || "rgba(148,163,184,0.15)"}
                  strokeWidth={Math.max(0.2, edge.strength * 0.8)}
                />
              );
            })}
            {filteredNodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              const color = TYPE_COLORS[node.type] || "#888";
              const r = Math.max(1.5, Math.min(4, 1.5 + node.occurrenceCount * 0.3));
              const isSelected = selectedNode?.id === node.id;
              return (
                <g
                  key={node.id}
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r + (isSelected ? 1.5 : 0)}
                    fill={color}
                    opacity={isSelected ? 1 : 0.7}
                    stroke={isSelected ? "white" : "none"}
                    strokeWidth={isSelected ? 0.3 : 0}
                  />
                  <text
                    x={pos.x}
                    y={pos.y - r - 1}
                    textAnchor="middle"
                    className="fill-white/60"
                    style={{ fontSize: "2px", fontFamily: "monospace" }}
                  >
                    {node.name.length > 18 ? node.name.slice(0, 18) + "…" : node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="border border-white/[0.08] bg-black/25 p-4 min-h-[400px]">
          {selectedNode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[selectedNode.type] || "#888" }}
                />
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                  {selectedNode.type}
                </span>
              </div>
              <h3 className="text-sm font-medium text-white">{selectedNode.name}</h3>
              <p className="text-xs text-white/60 leading-relaxed">{selectedNode.description}</p>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.08]">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">Confidence</p>
                  <p className="text-sm font-mono text-white/80">{selectedNode.confidence}/100</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">Occurrences</p>
                  <p className="text-sm font-mono text-white/80">{selectedNode.occurrenceCount}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-white/40 font-mono text-center">
                Click a node to inspect<br />the concept
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
