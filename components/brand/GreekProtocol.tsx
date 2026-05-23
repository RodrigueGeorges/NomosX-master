"use client";

import React from "react";
import { cn } from "@/lib/utils";

const PROTOCOL = [
  {
    key: "Doxa",
    subtitle: "raw belief",
    body: "The starting thesis, public narrative, or strategic intuition.",
  },
  {
    key: "Elenchus",
    subtitle: "adversarial test",
    body: "Assumptions are exposed, contradictions surfaced, and weak claims challenged.",
  },
  {
    key: "Logos",
    subtitle: "reasoned synthesis",
    body: "Evidence is ranked, cited, and structured into a decision-ready argument.",
  },
  {
    key: "Nomos",
    subtitle: "institutional decision",
    body: "Only what survives the gate becomes policy, memo, or publication.",
  },
];

export function GreekProtocolStrip({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("nx-oracle-panel overflow-hidden", className)}>
      <div className="relative p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="nx-glyph-label">Socratic Protocol</div>
            <div className="mt-1 font-display text-xl font-semibold text-white">Doxa to Nomos</div>
          </div>
          <div className="hidden sm:block text-right text-[10px] uppercase tracking-[0.22em] text-white/30 font-mono">
            verified pipeline
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {PROTOCOL.map((item, index) => (
            <div key={item.key} className="nx-codex-cell group">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] text-white/40">0{index + 1}</span>
                {index < PROTOCOL.length - 1 && (
                  <span className="hidden md:block h-px w-10 bg-gradient-to-r from-[#137CBD]/40 to-transparent" />
                )}
              </div>
              <div className="font-display text-lg font-semibold text-white group-hover:text-[#137CBD] transition-colors">
                {item.key}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/50 font-mono">
                {item.subtitle}
              </div>
              {!compact && (
                <p className="mt-3 text-xs leading-relaxed text-white/45">
                  {item.body}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// OracleSeal removed (2026-05-22) — ornemental, non utilisé, cassait la cohérence DA Palantir.
// Si besoin d'un sceau visuel à l'avenir, repartir sur du noir/blanc/bleu (#137CBD) mono.
