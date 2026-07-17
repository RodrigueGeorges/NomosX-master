"use client";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  weight: number;
}

interface ForesightGraphMiniProps {
  nodes?: GraphNode[];
}

export function ForesightGraphMini({ nodes }: ForesightGraphMiniProps) {
  if (!nodes?.length) {
    return (
      <p className="text-xs text-white/35 font-mono">GraphRAG non disponible pour cette inquiry.</p>
    );
  }

  const display = nodes.slice(0, 14);
  const center = display[0];

  return (
    <div className="relative border border-white/[0.06] bg-black/25 p-4 min-h-[200px]">
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/30 mb-3">
        GraphRAG — {nodes.length} entités
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-48 opacity-80">
        {display.slice(1).map((n, i) => (
          <line
            key={`e-${n.id}`}
            x1={50}
            y1={50}
            x2={20 + (i % 4) * 20}
            y2={15 + Math.floor(i / 4) * 28}
            stroke="rgba(74,158,255,0.15)"
            strokeWidth="0.3"
          />
        ))}
        {display.map((n, i) => {
          const cx = i === 0 ? 50 : 20 + ((i - 1) % 4) * 20;
          const cy = i === 0 ? 50 : 15 + Math.floor((i - 1) / 4) * 28;
          const r = i === 0 ? 3 : 1.2 + n.weight * 2;
          return (
            <g key={n.id}>
              <circle cx={cx} cy={cy} r={r} fill="rgba(74,158,255,0.45)" />
              <text
                x={cx}
                y={cy + 5}
                textAnchor="middle"
                className="fill-white/30"
                style={{ fontSize: "2.5px", fontFamily: "monospace" }}
              >
                {n.label.slice(0, 12).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
      {center && (
        <div className="mt-2 text-[10px] font-mono text-white/40 truncate">
          Hub: {center.label}
        </div>
      )}
    </div>
  );
}
