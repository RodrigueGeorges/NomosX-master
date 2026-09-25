"use client";

import React, { useEffect, useState } from "react";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { Trophy, Brain, Swords, Users, Globe, RefreshCw, TrendingUp, AlertTriangle, Zap, Link2 } from "lucide-react";

type DashboardData = {
  summary: {
    prmSteps: number;
    prmTrainingExamples: number;
    selfPlayRounds: number;
    moaRuns: number;
    worldModelDomains: number;
    crossDomainLinks: number;
    lookbackDays: number;
  };
  prm: {
    trainingExamples: number;
    avgReward: number | null;
    topFeatures: Array<{ feature: string; weight: number }>;
    recentSteps: Array<{ phase: string; reward: number; timestamp: string }>;
  };
  selfPlay: {
    totalRounds: number;
    totalAttacks: number;
    succeededAttacks: number;
    successRate: number | null;
    avgRobustness: number | null;
    weaknessCategories: Record<string, number>;
    recentRounds: Array<{ query: string; attacks: number; succeeded: number; robustness: number; lessons: number }>;
  };
  moa: {
    totalRuns: number;
    avgConfidence: number | null;
    agentUsage: Record<string, number>;
    latestWeights: Record<string, { weight: number; reliability: number; usageCount: number }> | null;
    recentRuns: Array<{ query: string; agentCount: number; consensus: number; controversies: number; confidence: number }>;
  };
  worldModel: {
    domainCount: number;
    totalConcepts: number;
    totalPositions: number;
    totalControversies: number;
    totalSources: number;
    totalRuns: number;
    domains: Array<{ domain: string; concepts: number; positions: number; controversies: number; sources: number; runCount: number }>;
    crossDomainLinks: Array<{ conceptA: string; domainA: string; conceptB: string; domainB: string; connection: string; strength: number }>;
  };
};

const agentLabels: Record<string, string> = {
  methodology: "Methodology",
  bias: "Bias",
  evidence: "Evidence",
  synthesis: "Synthesis",
  skeptic: "Skeptic",
  temporal: "Temporal",
  stakeholder: "Stakeholder",
  uncertainty: "Uncertainty",
};

export default function MoatDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/moat`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError("Échec du chargement des données moat");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <PublicPageShell>
      <PageHeader
        title="Moat — Auto-amélioration autonome"
        description="Quatre piliers d'avantage compétitif défendable : Process Rewards, Self-Play adversarial, Mixture of Agents, et World Model."
      />

      <div className="px-6 pb-12 max-w-7xl mx-auto">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Trophy className="w-4 h-4" />
            <span>Système moat à 4 piliers — PRM + Self-Play + MoA + World Model</span>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-black/5 hover:bg-black/10 border border-black/10 transition disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Actualiser
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Chargement des données moat…
          </div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <SummaryCard icon={<Brain className="w-5 h-5" />} label="Exemples PRM" value={data.summary.prmTrainingExamples} sublabel={`${data.summary.prmSteps} étapes scorées`} color="text-blue-300" />
              <SummaryCard icon={<Swords className="w-5 h-5" />} label="Sessions Self-Play" value={data.summary.selfPlayRounds} sublabel={`${data.selfPlay.succeededAttacks} faiblesses trouvées`} color="text-red-300" />
              <SummaryCard icon={<Users className="w-5 h-5" />} label="Analyses MoA" value={data.summary.moaRuns} sublabel={data.moa.avgConfidence !== null ? `${(data.moa.avgConfidence * 100).toFixed(0)}% confiance moyenne` : ""} color="text-purple-300" />
              <SummaryCard icon={<Globe className="w-5 h-5" />} label="Domaines World Model" value={data.summary.worldModelDomains} sublabel={`${data.summary.crossDomainLinks} liens inter-domaines`} color="text-green-300" />
            </div>

            {/* PRM Section */}
            <Panel title="Process Reward Model — Poids des features appris" icon={<Brain className="w-4 h-4" />} className="mb-8">
              {data.prm.topFeatures.length === 0 ? (
                <EmptyState text="Aucun modèle de vérification entraîné — les données s'accumuleront au fil des publications" />
              ) : (
                <>
                  <div className="space-y-2 mb-4">
                    {data.prm.topFeatures.map((f, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">{f.feature}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-black/5 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", f.weight >= 0 ? "bg-blue-400/60" : "bg-red-400/60")}
                              style={{ width: `${Math.min(100, Math.abs(f.weight) * 100)}%` }}
                            />
                          </div>
                          <span className={cn("text-sm w-16 text-right", f.weight >= 0 ? "text-blue-300" : "text-red-300")}>
                            {f.weight.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 text-sm text-gray-500 pt-3 border-t border-black/5">
                    <span>Exemples d&apos;entraînement : {data.prm.trainingExamples}</span>
                    {data.prm.avgReward !== null && (
                      <span>Récompense moyenne : {data.prm.avgReward.toFixed(3)}</span>
                    )}
                  </div>
                </>
              )}
            </Panel>

            {/* Self-Play Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Panel title="Self-Play adversarial — Découverte de faiblesses" icon={<Swords className="w-4 h-4" />}>
                {data.selfPlay.totalRounds === 0 ? (
                  <EmptyState text="Aucune session self-play — les données s'accumuleront au fil des analyses" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Metric label="Attaques totales" value={data.selfPlay.totalAttacks} />
                      <Metric label="Réussies" value={data.selfPlay.succeededAttacks} color="text-red-300" />
                      <Metric label="Taux de réussite" value={data.selfPlay.successRate !== null ? `${(data.selfPlay.successRate * 100).toFixed(0)}%` : "—"} />
                      <Metric label="Robustesse moyenne" value={data.selfPlay.avgRobustness !== null ? `${(data.selfPlay.avgRobustness * 100).toFixed(0)}%` : "—"} color="text-green-300" />
                    </div>
                    {Object.keys(data.selfPlay.weaknessCategories).length > 0 && (
                      <div className="pt-3 border-t border-black/5">
                        <div className="text-xs text-gray-500 mb-2">Catégories de faiblesses trouvées</div>
                        <div className="flex gap-2 flex-wrap">
                          {Object.entries(data.selfPlay.weaknessCategories)
                            .sort((a, b) => b[1] - a[1])
                            .map(([cat, count]) => (
                              <span key={cat} className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-300 border border-red-500/30">
                                {cat.replace(/_/g, ' ')}: {count}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Panel>

              <Panel title="Self-Play — Sessions récentes" icon={<TrendingUp className="w-4 h-4" />}>
                {data.selfPlay.recentRounds.length === 0 ? (
                  <EmptyState text="Aucune session récente" />
                ) : (
                  <div className="space-y-2">
                    {data.selfPlay.recentRounds.map((r, i) => (
                      <div key={i} className="p-2 rounded-lg hover:bg-black/5">
                        <div className="text-sm text-gray-300 truncate">{r.query}</div>
                        <div className="flex gap-3 text-xs text-gray-500 mt-1">
                          <span>{r.attacks} attaques</span>
                          <span className="text-red-400">{r.succeeded} réussies</span>
                          <span className={cn(
                            "font-medium",
                            r.robustness >= 0.7 ? "text-green-400" :
                            r.robustness >= 0.5 ? "text-yellow-400" : "text-red-400"
                          )}>
                            {Math.round(r.robustness * 100)}% robuste
                          </span>
                          <span>{r.lessons} leçons</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* MoA Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Panel title="Mixture of Agents — Utilisation des spécialistes" icon={<Users className="w-4 h-4" />}>
                {Object.keys(data.moa.agentUsage).length === 0 ? (
                  <EmptyState text="Aucune analyse multi-agents — les données s'accumuleront au fil des analyses" />
                ) : (
                  <div className="space-y-2">
                    {Object.entries(data.moa.agentUsage)
                      .sort((a, b) => b[1] - a[1])
                      .map(([agent, count]) => (
                        <div key={agent} className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">{agentLabels[agent] || agent}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-black/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-400/60 rounded-full"
                                style={{ width: `${Math.min(100, (count / data.moa.totalRuns) * 100)}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-400 w-8 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {data.moa.latestWeights && (
                  <div className="mt-4 pt-3 border-t border-black/5">
                    <div className="text-xs text-gray-500 mb-2">Poids actuels des agents</div>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(data.moa.latestWeights).map(([agent, info]) => (
                        <span key={agent} className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {agentLabels[agent] || agent}: {(info as any).weight.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title="MoA — Analyses récentes" icon={<TrendingUp className="w-4 h-4" />}>
                {data.moa.recentRuns.length === 0 ? (
                  <EmptyState text="Aucune analyse MoA récente" />
                ) : (
                  <div className="space-y-2">
                    {data.moa.recentRuns.map((r, i) => (
                      <div key={i} className="p-2 rounded-lg hover:bg-black/5">
                        <div className="text-sm text-gray-300 truncate">{r.query}</div>
                        <div className="flex gap-3 text-xs text-gray-500 mt-1">
                          <span>{r.agentCount} agents</span>
                          <span className="text-green-400">{r.consensus} consensus</span>
                          <span className="text-yellow-400">{r.controversies} controverses</span>
                          <span className={cn(
                            "font-medium",
                            r.confidence >= 0.7 ? "text-green-400" :
                            r.confidence >= 0.5 ? "text-yellow-400" : "text-red-400"
                          )}>
                            {(r.confidence * 100).toFixed(0)}% conf
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* World Model Section */}
            <Panel title="World Model — Connaissance persistante" icon={<Globe className="w-4 h-4" />} className="mb-8">
              {data.worldModel.domainCount === 0 ? (
                <EmptyState text="Aucune donnée de modèle du monde — les données s'accumuleront au fil des analyses" />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <Metric label="Domaines" value={data.worldModel.domainCount} />
                    <Metric label="Concepts" value={data.worldModel.totalConcepts} />
                    <Metric label="Positions" value={data.worldModel.totalPositions} color="text-green-300" />
                    <Metric label="Controverses" value={data.worldModel.totalControversies} color="text-yellow-300" />
                    <Metric label="Sources" value={data.worldModel.totalSources} />
                  </div>

                  {/* Domain breakdown */}
                  <div className="pt-3 border-t border-black/5">
                    <div className="text-xs text-gray-500 mb-2">Domaines</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {data.worldModel.domains.map((d, i) => (
                        <div key={i} className="p-2 rounded-lg bg-black/5 border border-black/10">
                          <div className="text-sm font-medium text-gray-200">{d.domain}</div>
                          <div className="flex gap-2 text-xs text-gray-500 mt-1">
                            <span>{d.concepts} concepts</span>
                            <span>{d.positions} pos</span>
                            <span>{d.runCount} analyses</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </Panel>

            {/* Cross-Domain Links */}
            <Panel title="Connexions inter-domaines" icon={<Link2 className="w-4 h-4" />} className="mb-8">
              {data.worldModel.crossDomainLinks.length === 0 ? (
                <EmptyState text="Aucune connexion inter-domaines découverte" />
              ) : (
                <div className="space-y-2">
                  {data.worldModel.crossDomainLinks.map((link, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-black/5">
                      <Link2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-300">
                          <span className="font-medium">{link.conceptA}</span>
                          <span className="text-gray-500"> ({link.domainA})</span>
                          <span className="text-gray-500"> ↔ </span>
                          <span className="font-medium">{link.conceptB}</span>
                          <span className="text-gray-500"> ({link.domainB})</span>
                        </div>
                        <div className="text-xs text-gray-500 truncate">{link.connection}</div>
                      </div>
                      <span className="text-xs text-green-400 shrink-0">{Math.round(link.strength * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </PublicPageShell>
  );
}

// ─── UI Components ──────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, sublabel, color,
}: {
  icon: React.ReactNode; label: string; value: string | number; sublabel?: string; color: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-black/5 border border-black/10">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={cn("text-2xl font-bold", color)}>{value}</div>
      {sublabel && <div className="text-xs text-gray-500 mt-1">{sublabel}</div>}
    </div>
  );
}

function Panel({
  title, icon, children, className,
}: {
  title: string; icon: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("p-5 rounded-xl bg-black/5 border border-black/10", className)}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-sm font-medium text-gray-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="p-3 rounded-lg bg-black/5 border border-black/10">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={cn("text-xl font-bold mt-1", color || "text-gray-200")}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-sm text-gray-500 py-4 text-center">{text}</div>;
}
