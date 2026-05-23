"use client";

import { useState } from "react";
import { AlertTriangle, FileText, GitBranch, MessageSquare, Network, Radar, Users } from "lucide-react";
import type { ForesightBundle } from "@/lib/foresight";
import { FORESIGHT_LAYERS } from "@/lib/foresight";
import { ScenarioMatrix } from "./ScenarioMatrix";
import { SwarmTelemetry } from "./SwarmTelemetry";
import { PersonaChat } from "./PersonaChat";
import { ForesightGraphMini } from "./ForesightGraphMini";

type TabId = "scenarios" | "swarm" | "graph" | "dissent" | "agents";

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
    { id: "scenarios", label: "Scénarios", icon: Radar },
    { id: "swarm", label: "Swarm", icon: Users },
    { id: "graph", label: "GraphRAG", icon: Network },
    { id: "dissent", label: "Dissent", icon: AlertTriangle },
    { id: "agents", label: "Agents", icon: MessageSquare },
  ];

  return (
    <section
      className={`rounded-2xl border border-accent/20 bg-gradient-to-b from-accent/[0.04] to-transparent overflow-hidden ${className ?? ""}`}
      aria-label="NomosX Foresight Engine"
    >
      <div className="px-5 sm:px-6 py-5 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent/80 mb-1">
              NomosX Foresight Engine
            </div>
            <h2 className="font-display text-xl font-semibold text-text">
              Simulation prospective institutionnelle
            </h2>
            <p className="text-xs text-white/40 mt-1 max-w-2xl leading-relaxed">
              GraphRAG académique · swarm {foresight.telemetry.swarmSize.toLocaleString()}+ · dual-channel
              social · Monte Carlo multi-seed · gate adversarial
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full border text-[10px] font-mono ${
              foresight.telemetry.adversarialValidated
                ? "border-success/25 bg-success/10 text-success"
                : "border-warning/25 bg-warning/10 text-warning"
            }`}
          >
            {foresight.telemetry.adversarialValidated ? "VALIDÉ" : "REVIEW"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {FORESIGHT_LAYERS.map((layer) => (
            <span
              key={layer.id}
              title={layer.detail}
              className="px-2 py-0.5 rounded border border-white/[0.06] text-[9px] font-mono text-white/35 uppercase tracking-wider"
            >
              {layer.label}
            </span>
          ))}
        </div>
      </div>

      {foresight.executiveBrief && (
        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.05] bg-black/15">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-accent/70 mb-2">
            <FileText size={12} />
            Synthèse exécutive
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
                  ? "border-accent text-accent"
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

        {tab === "swarm" && (
          <div className="space-y-6">
            <SwarmTelemetry telemetry={foresight.telemetry} />
            {foresight.sensitivity.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/30 mb-3">
                  <GitBranch size={12} />
                  Matrice de sensibilité
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="text-white/30 border-b border-white/[0.06]">
                        <th className="text-left py-2 pr-4">Variable</th>
                        <th className="text-left py-2 pr-4">Scénario</th>
                        <th className="text-right py-2">Élasticité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {foresight.sensitivity.slice(0, 8).map((row, i) => (
                        <tr key={i} className="border-b border-white/[0.04] text-white/55">
                          <td className="py-2 pr-4">{row.variable}</td>
                          <td className="py-2 pr-4">{row.scenario}</td>
                          <td className="py-2 text-right text-accent/80">{row.elasticity.toFixed(3)}</td>
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
              <div className="rounded-xl border border-warning/20 bg-warning/[0.04] p-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-warning/80 mb-2">
                  Red Team — contre-scenario steel-man
                </div>
                <p className="text-sm text-white/70 leading-relaxed">{foresight.redTeamChallenge}</p>
              </div>
            ) : (
              <p className="text-sm text-white/40 font-mono">Aucun challenge adversarial enregistré.</p>
            )}
          </div>
        )}

        {tab === "agents" && (
          <PersonaChat
            personas={foresight.personas}
            question={foresight.question ?? ""}
            publicationId={publicationId}
          />
        )}
      </div>

      <div className="px-5 sm:px-6 py-4 border-t border-white/[0.05] bg-black/10">
        <p className="text-[11px] text-white/35 leading-relaxed font-mono">
          Note méthodologique (France Stratégie) : les probabilités affichées sont des pondérations de
          scénarios issues d&apos;une simulation multi-agent calibrée sur sources académiques — pas des
          prédictions. Toute décision doit croiser ce signal avec le corpus cité [SRC-N] et le dissent
          enregistré.
        </p>
      </div>
    </section>
  );
}
