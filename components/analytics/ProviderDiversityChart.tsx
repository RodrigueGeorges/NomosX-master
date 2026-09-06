"use client";

import { useMemo } from "react";

export interface ProviderDiversityData {
  provider: string;
  count: number;
  qualityAvg: number;
}

interface ProviderDiversityChartProps {
  data: ProviderDiversityData[];
}

const PROVIDER_COLORS: Record<string, string> = {
  openalex: "#3B82F6",
  crossref: "#10B981",
  cia: "#EF4444",
  nara: "#F59E0B",
  "world-bank": "#8B5CF6",
  imf: "#EC4899",
  "un-statistics": "#06B6D4",
  "eu-statistics": "#F97316",
  oecd: "#84CC16",
  who: "#14B8A6",
};

export function ProviderDiversityChart({ data }: ProviderDiversityChartProps) {
  const maxCount = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);
  const total = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);

  if (data.length === 0) {
    return (
      <div className="border border-black/[0.08] bg-black/25 p-6 text-center">
        <p className="text-xs text-black/50 font-mono">No provider data available.</p>
      </div>
    );
  }

  return (
    <div className="border border-black/[0.08] bg-black/25 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-mono uppercase tracking-wider text-black/50">
          Provider Diversity — {data.length} sources
        </p>
        <p className="text-[10px] font-mono text-black/40">{total} total</p>
      </div>
      <div className="space-y-2">
        {data.map((d) => {
          const widthPct = (d.count / maxCount) * 100;
          const color = PROVIDER_COLORS[d.provider] || "#6366F1";
          return (
            <div key={d.provider} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[10px] font-mono uppercase tracking-wider text-black/50 truncate">
                {d.provider}
              </span>
              <div className="flex-1 h-5 bg-black/[0.03] relative overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: color,
                    opacity: 0.7,
                  }}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-black/60">
                  {d.count}
                </span>
              </div>
              {d.qualityAvg > 0 && (
                <span className="w-12 shrink-0 text-right text-[10px] font-mono text-black/40">
                  Q:{d.qualityAvg.toFixed(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
