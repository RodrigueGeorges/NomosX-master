"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface DebateTranscriptData {
  question: string;
  dominantThesis: string;
  position1: {
    label: string;
    arguments: Array<{
      claim: string;
      evidence: string[];
      strength: string;
      methodology: string;
      limitations: string[];
    }>;
    overallStrength: number;
    proponents: string[];
  };
  position2: {
    label: string;
    arguments: Array<{
      claim: string;
      evidence: string[];
      strength: string;
      methodology: string;
      limitations: string[];
    }>;
    overallStrength: number;
    proponents: string[];
  };
  synthesis: string;
  nuances: string[];
  whatWouldChangeOurMind: string[];
  confidenceInDominant: number;
  debateQuality: {
    evidenceBalance: number;
    steelManStrength: number;
    synthesisQuality: number;
  };
}

interface DebateTranscriptViewerProps {
  debate: DebateTranscriptData;
}

const STRENGTH_STYLES: Record<string, string> = {
  strong: "text-emerald-400 border-emerald-500/30",
  moderate: "text-amber-400 border-amber-500/30",
  weak: "text-red-400 border-red-500/30",
};

export function DebateTranscriptViewer({ debate }: DebateTranscriptViewerProps) {
  const [activePosition, setActivePosition] = useState<1 | 2>(1);
  const pos = activePosition === 1 ? debate.position1 : debate.position2;

  return (
    <div className="space-y-5">
      <div className="border border-white/[0.08] bg-black/25 p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">Research Question</p>
        <p className="text-sm text-white leading-relaxed">{debate.question}</p>
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mt-3 mb-1">Dominant Thesis</p>
        <p className="text-sm text-white/80 leading-relaxed">{debate.dominantThesis}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="border border-white/[0.08] bg-black/25 p-3 text-center">
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">Confidence</p>
          <p className="text-xl font-mono text-white mt-1">{debate.confidenceInDominant}%</p>
        </div>
        <div className="border border-white/[0.08] bg-black/25 p-3 text-center">
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">Steel-Man</p>
          <p className="text-xl font-mono text-white mt-1">{debate.debateQuality.steelManStrength}/100</p>
        </div>
        <div className="border border-white/[0.08] bg-black/25 p-3 text-center">
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">Evidence Balance</p>
          <p className="text-xl font-mono text-white mt-1">{debate.debateQuality.evidenceBalance}/100</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActivePosition(1)}
          className={cn(
            "flex-1 px-4 py-2 text-xs font-mono uppercase tracking-wider border transition-colors text-left",
            activePosition === 1
              ? "border-blue-500/40 text-blue-400 bg-blue-500/5"
              : "border-white/[0.08] text-white/50 hover:border-white/20"
          )}
        >
          <span className="block text-[10px] opacity-60 mb-0.5">Position 1 — {debate.position1.overallStrength}/100</span>
          {debate.position1.label}
        </button>
        <button
          type="button"
          onClick={() => setActivePosition(2)}
          className={cn(
            "flex-1 px-4 py-2 text-xs font-mono uppercase tracking-wider border transition-colors text-left",
            activePosition === 2
              ? "border-orange-500/40 text-orange-400 bg-orange-500/5"
              : "border-white/[0.08] text-white/50 hover:border-white/20"
          )}
        >
          <span className="block text-[10px] opacity-60 mb-0.5">Position 2 (Steel-Man) — {debate.position2.overallStrength}/100</span>
          {debate.position2.label}
        </button>
      </div>

      <div className="border border-white/[0.08] bg-black/25 p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-3">
          Arguments ({pos.arguments.length})
        </p>
        <div className="space-y-4">
          {pos.arguments.map((arg, i) => (
            <div key={i} className="border-l-2 border-white/[0.12] pl-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm text-white leading-relaxed">{arg.claim}</p>
                <span className={cn("shrink-0 px-2 py-0.5 text-[10px] font-mono uppercase border", STRENGTH_STYLES[arg.strength] || "text-white/50 border-white/[0.08]")}>
                  {arg.strength}
                </span>
              </div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">Methodology</p>
              <p className="text-xs text-white/60 leading-relaxed mb-2">{arg.methodology}</p>
              {arg.evidence.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {arg.evidence.map((ref, j) => (
                    <span key={j} className="px-1.5 py-0.5 text-[10px] font-mono text-blue-400/70 bg-blue-500/5 border border-blue-500/20">
                      {ref}
                    </span>
                  ))}
                </div>
              )}
              {arg.limitations.length > 0 && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-wider text-white/40 hover:text-white/60">
                    Limitations ({arg.limitations.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {arg.limitations.map((lim, j) => (
                      <li key={j} className="text-xs text-white/50 leading-relaxed">• {lim}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border border-white/[0.08] bg-black/25 p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">Synthesis</p>
        <p className="text-sm text-white/70 leading-relaxed">{debate.synthesis}</p>
      </div>

      {debate.nuances.length > 0 && (
        <div className="border border-white/[0.08] bg-black/25 p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">Nuances</p>
          <ul className="space-y-1.5">
            {debate.nuances.map((n, i) => (
              <li key={i} className="text-xs text-white/60 leading-relaxed">• {n}</li>
            ))}
          </ul>
        </div>
      )}

      {debate.whatWouldChangeOurMind.length > 0 && (
        <div className="border border-white/[0.08] bg-black/25 p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">What Would Change Our Mind</p>
          <ul className="space-y-1.5">
            {debate.whatWouldChangeOurMind.map((w, i) => (
              <li key={i} className="text-xs text-white/60 leading-relaxed">• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
