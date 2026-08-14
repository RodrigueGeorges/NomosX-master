"use client";

import { useState } from "react";
import { AlertTriangle, FileText, GitBranch, MessageSquare, Network, Radar, BarChart3 } from "lucide-react";
import type { ForesightBundle } from "@/lib/foresight";
import { FORESIGHT_LAYERS } from "@/lib/foresight";
import { ScenarioMatrix } from "./ScenarioMatrix";
import { SwarmTelemetry } from "./SwarmTelemetry";
import { PersonaChat } from "./PersonaChat";
import { ForesightGraphMini } from "./ForesightGraphMini";

type TabId = "scenarios" | "distribution" | "graph" | "dissent" | "perspectives";

interface ForesightPanelProps {
  foresight: ForesightBundle;
  publicationId: string;
  className?: string;
}

export function ForesightPanel({ foresight, publicationId, className }: ForesightPanelProps) {
  const [tab, setTab] = useState<TabId>("scenarios");

  if (!foresight.available || !foresight.scenarios.length) {
    return null;
  }

  const tabs: { id: TabId; label: string; icon: typeof Radar }[] = [
    { id: "scenarios", label: "Scenarios", icon: Radar },
    { id: "distribution", label: "Distribution", icon: BarChart3 },
    { id: "graph", label: "Evidence graph", icon: Network },
    { id: "dissent", label: "Dissent", icon: AlertTriangle },
    { id: "perspectives", label: "Perspectives", icon: MessageSquare },
  ];

  return (
    <section
      className={`border border-white/[0.08] bg-white/[0.02] overflow-hidden ${className ?? ""}`}
      aria-label="NomosX Prospective Engine"
    >
      <div className="px-5 sm:px-6 py-5 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-1">
              NomosX Prospective Engine
            </div>
            <h2 className="font-display text-xl font-semibold text-text">
              Scenario distributions
            </h2>
            <p className="text-xs text-white/40 mt-1 max-w-2xl leading-relaxed">
              {foresight.telemetry.monteCarloRuns.toLocaleString()} Monte Carlo runs ·{" "}
              {foresight.telemetry.seedRuns} seeds · adversarial gate
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-wider ${
              foresight.telemetry.adversarialValidated
                ? "border-success/25 bg-success/10 text-success"
                : "border-warning/25 bg-warning/10 text-warning"
            }`}
          >
            {foresight.telemetry.adversarialValidated ? "Validated" : "Review"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {FORESIGHT_LAYERS.map((layer) => (
            <span
              key={layer.id}
              title={layer.detail}
              className="px-2 py-0.5 rounded border border-white/[0.08] text-[9px] font-mono text-white/50 uppercase tracking-wider"
            >
              {layer.label}
            </span>
          ))}
        </div>
      </div>

      {foresight.executiveBrief && (
        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.05] bg-black/15">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
            <FileText size={12} />
            Executive synthesis
          </div>
          <p className="text-sm text-white/70 leading-relaxed">{foresight.executiveBrief}</p>
        </div>
      )}

      <div className="px-5 sm:px-6 pt-4 flex gap-1 border-b border-white/[0.05] overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-white text-white"
                  : "border-transparent text-white/40 hover:text-white/60"
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-5 sm:p-6">
        {tab === "scenarios" && <ScenarioMatrix scenarios={foresight.scenarios} />}

        {tab === "distribution" && (
          <div className="space-y-6">
            <SwarmTelemetry telemetry={foresight.telemetry} />
            {foresight.sensitivity.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/50 mb-3">
                  <GitBranch size={12} />
                  Sensitivity matrix
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="text-white/50 border-b border-white/[0.08]">
                        <th className="text-left py-2 pr-4">Variable</th>
                        <th className="text-left py-2 pr-4">Scenario</th>
                        <th className="text-right py-2">Elasticity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {foresight.sensitivity.slice(0, 8).map((row, i) => (
                        <tr key={i} className="border-b border-white/[0.04] text-white/55">
                          <td className="py-2 pr-4">{row.variable}</td>
                          <td className="py-2 pr-4">{row.scenario}</td>
                          <td className="py-2 text-right text-white/70">{row.elasticity.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "graph" && <ForesightGraphMini nodes={foresight.graphNodes} />}

        {tab === "dissent" && (
          <div className="space-y-4">
            {foresight.redTeamChallenge ? (
              <div className="border border-warning/20 bg-warning/[0.04] p-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-warning/80 mb-2">
                  Red team — steel-man counter-scenario
                </div>
                <p className="text-sm text-white/70 leading-relaxed">{foresight.redTeamChallenge}</p>
              </div>
            ) : (
              <p className="text-sm text-white/40 font-mono">No adversarial challenge recorded.</p>
            )}
          </div>
        )}

        {tab === "perspectives" && (
          <PersonaChat
            personas={foresight.personas}
            question={foresight.question ?? ""}
            publicationId={publicationId}
          />
        )}
      </div>

      <div className="px-5 sm:px-6 py-4 border-t border-white/[0.08] bg-black/10">
        <p className="text-[11px] text-white/50 leading-relaxed font-mono">
          Methodological note: displayed probabilities are scenario weightings from calibrated
          prospective runs on academic sources — not predictions. Any decision should cross-reference
          this signal with the cited corpus [SRC-N] and recorded dissent.
        </p>
      </div>
    </section>
  );
}
