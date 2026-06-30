"use client";

import { cn } from "@/lib/utils";
import type { ForesightScenarioOutcome } from "@/lib/foresight";
import { ScenarioSparkline } from "./ScenarioSparkline";

const TRAJECTORY_STYLE: Record<string, { label: string; className: string }> = {
  rising: { label: "↗ Rising", className: "text-white/70" },
  declining: { label: "↘ Declining", className: "text-white/50" },
  volatile: { label: "⚡ Volatile", className: "text-white/60" },
  stable: { label: "→ Stable", className: "text-white/40" },
};

interface ScenarioMatrixProps {
  scenarios: ForesightScenarioOutcome[];
}

export function ScenarioMatrix({ scenarios }: ScenarioMatrixProps) {
  const sorted = [...scenarios].sort((a, b) => b.probability - a.probability);

  return (
    <div className="space-y-4">
      {sorted.map((s, i) => {
        const traj = TRAJECTORY_STYLE[s.trajectory] ?? TRAJECTORY_STYLE.stable;
        const pct = s.probability * 100;
        const ciLow = s.confidenceInterval[0] * 100;
        const ciHigh = s.confidenceInterval[1] * 100;

        return (
          <div
            key={s.name}
            className="nx-public-surface p-4 hover:border-white/15 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-white/25">#{i + 1}</span>
                  {s.sourceGrounded && (
                    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-white/15 text-white/50">
                      SRC
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-medium text-white/90 leading-snug">{s.name}</h4>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-semibold font-mono text-white tabular-nums">
                  {s.probabilityLabel}
                </div>
                <ScenarioSparkline series={s.momentumSeries} className="w-20 h-6 ml-auto mt-1" />
                <div className={cn("text-[10px] font-mono mt-0.5", traj.className)}>{traj.label}</div>
              </div>
            </div>

            <div className="relative h-2 bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="absolute inset-y-0 left-0 bg-white/20"
                style={{ left: `${ciLow}%`, width: `${Math.max(ciHigh - ciLow, 2)}%` }}
              />
              <div
                className="absolute inset-y-0 bg-white"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-white/30 mb-3">
              CI 90%: {s.ciLabel[0]} – {s.ciLabel[1]}
            </div>

            {(s.keyDrivers.length > 0 || s.blockers.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                {s.keyDrivers.length > 0 && (
                  <div>
                    <span className="text-white/25 font-mono uppercase tracking-wider text-[9px]">Drivers</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.keyDrivers.map((d) => (
                        <span key={d} className="px-1.5 py-0.5 border border-white/10 text-white/55 font-mono">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {s.blockers.length > 0 && (
                  <div>
                    <span className="text-white/25 font-mono uppercase tracking-wider text-[9px]">Blockers</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.blockers.map((b) => (
                        <span key={b} className="px-1.5 py-0.5 border border-white/10 text-white/45 font-mono">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {s.cascadeEffects.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/[0.06] text-[11px] text-white/40">
                {s.cascadeEffects.map((c) => (
                  <div key={c} className="font-mono">
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
