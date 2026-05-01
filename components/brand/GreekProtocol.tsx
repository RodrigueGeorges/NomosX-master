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
          <div className="hidden sm:block text-right text-[10px] uppercase tracking-[0.22em] text-white/20">
            verified oracle
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {PROTOCOL.map((item, index) => (
            <div key={item.key} className="nx-codex-cell group">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] text-amber-100/45">0{index + 1}</span>
                {index < PROTOCOL.length - 1 && (
                  <span className="hidden md:block h-px w-10 bg-gradient-to-r from-amber-200/35 to-transparent" />
                )}
              </div>
              <div className="font-display text-lg font-semibold text-white group-hover:text-amber-100 transition-colors">
                {item.key}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-indigo-200/45">
                {item.subtitle}
              </div>
              {!compact && (
                <p className="mt-3 text-xs leading-relaxed text-white/35">
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

export function OracleSeal({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex h-48 w-48 items-center justify-center", className)} aria-hidden="true">
      <div className="absolute inset-0 rounded-full border border-amber-200/15" />
      <div className="absolute inset-5 rounded-full border border-indigo-300/20 animate-ring" />
      <div className="absolute inset-10 rounded-full border border-amber-200/20 animate-ring-rev" />
      <div className="absolute h-px w-full bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />
      <div className="absolute h-full w-px bg-gradient-to-b from-transparent via-indigo-200/25 to-transparent" />
      <div className="absolute h-24 w-24 rotate-45 border border-white/10" />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-amber-200/20 bg-black/30 shadow-[0_0_50px_rgba(212,175,55,0.10)]">
        <span className="font-display text-3xl font-semibold text-amber-100">NX</span>
      </div>
    </div>
  );
}
