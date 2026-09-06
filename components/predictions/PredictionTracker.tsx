"use client";

import { useState } from "react";
import type { PredictionWithBrief } from "@/lib/queries/predictions";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "border-blue-500/30 text-blue-400 bg-blue-500/5",
  CONFIRMED: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5",
  REFUTED: "border-red-500/30 text-red-400 bg-red-500/5",
  EXPIRED: "border-amber-500/30 text-amber-400 bg-amber-500/5",
  SUPERSEDED: "border-purple-500/30 text-purple-400 bg-purple-500/5",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  ESTABLISHED: "text-emerald-400",
  SUPPORTED: "text-blue-400",
  EMERGING: "text-amber-400",
  SPECULATIVE: "text-orange-400",
};

interface PredictionTrackerProps {
  predictions: PredictionWithBrief[];
  stats: {
    total: number;
    open: number;
    confirmed: number;
    refuted: number;
    expired: number;
    superseded: number;
    accuracy: number;
  };
}

export function PredictionTracker({ predictions, stats }: PredictionTrackerProps) {
  const [filter, setFilter] = useState<string>("ALL");

  const filtered = filter === "ALL" ? predictions : predictions.filter((p) => p.status === filter);

  const filters = [
    { key: "ALL", label: "All", count: stats.total },
    { key: "OPEN", label: "Open", count: stats.open },
    { key: "CONFIRMED", label: "Confirmed", count: stats.confirmed },
    { key: "REFUTED", label: "Refuted", count: stats.refuted },
    { key: "EXPIRED", label: "Expired", count: stats.expired },
    { key: "SUPERSEDED", label: "Superseded", count: stats.superseded },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-black/[0.08] bg-black/25 p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-black/40">Total Predictions</p>
          <p className="text-2xl font-mono text-black mt-1">{stats.total}</p>
        </div>
        <div className="border border-black/[0.08] bg-black/25 p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-black/40">Resolved</p>
          <p className="text-2xl font-mono text-black mt-1">{stats.confirmed + stats.refuted}</p>
        </div>
        <div className="border border-black/[0.08] bg-black/25 p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-black/40">Accuracy</p>
          <p className="text-2xl font-mono text-black mt-1">
            {stats.confirmed + stats.refuted > 0 ? `${(stats.accuracy * 100).toFixed(0)}%` : "—"}
          </p>
        </div>
        <div className="border border-black/[0.08] bg-black/25 p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-black/40">Still Open</p>
          <p className="text-2xl font-mono text-black mt-1">{stats.open}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 text-[10px] font-mono uppercase tracking-wider border transition-colors",
              filter === f.key
                ? "border-black/30 text-black bg-black/5"
                : "border-black/[0.08] text-black/50 hover:border-black/20"
            )}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="border border-black/[0.08] bg-black/25 p-8 text-center">
          <p className="text-sm text-black/50 font-mono">No predictions in this category.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((pred) => (
            <div
              key={pred.id}
              className="border border-black/[0.08] bg-black/25 p-5 hover:border-black/[0.15] transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-sm text-black leading-relaxed">{pred.claim}</p>
                <span
                  className={cn(
                    "shrink-0 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border",
                    STATUS_STYLES[pred.status] || "border-black/[0.08] text-black/50"
                  )}
                >
                  {pred.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-wider text-black/40">
                <span>Horizon: <span className="text-black/70">{pred.horizon}</span></span>
                <span className={CONFIDENCE_STYLES[pred.confidence] || "text-black/50"}>
                  {pred.confidence}
                </span>
                {pred.probability !== null && (
                  <span>P: <span className="text-black/70">{(pred.probability * 100).toFixed(0)}%</span></span>
                )}
                <span>{new Date(pred.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
              </div>

              {pred.status !== "OPEN" && pred.outcome && (
                <div className="mt-3 pt-3 border-t border-black/[0.06]">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-black/40 mb-1">Outcome</p>
                  <p className="text-xs text-black/60 leading-relaxed">{pred.outcome}</p>
                </div>
              )}

              <details className="mt-3 group">
                <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-wider text-black/40 hover:text-black/60 transition-colors">
                  Resolution criteria & falsification conditions
                </summary>
                <div className="mt-2 space-y-2 text-xs text-black/50 leading-relaxed">
                  <p><span className="text-black/40">Confirm if:</span> {pred.resolutionCriteria}</p>
                  <p><span className="text-black/40">Falsify if:</span> {pred.whatWouldFalsify}</p>
                </div>
              </details>

              {pred.brief && (
                <a
                  href={pred.brief.publicId ? `/inquiry/${pred.brief.publicId}` : `/inquiry/${pred.brief.id}`}
                  className="inline-block mt-3 text-[10px] font-mono uppercase tracking-wider text-black/40 hover:text-black/70 transition-colors"
                >
                  → Source brief
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
