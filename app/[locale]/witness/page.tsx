"use client";

import React, { useEffect, useState } from "react";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { Eye, AlertTriangle, Shield, TrendingUp, Activity, Zap, RefreshCw, CheckCircle, XCircle, Lightbulb } from "lucide-react";

type Anomaly = {
  type: string;
  severity: string;
  description: string;
  pipelineStep: string;
  timestamp: string;
};

type Intervention = {
  type: string;
  pipelineStep: string;
  reason: string;
  approved: boolean;
  result: string;
  rejectionReason: string;
  timestamp: string;
};

type Learning = {
  runId: string;
  query: string;
  qualityScore: number;
  recommendsChanges: boolean;
  promptMods: number;
  thresholdAdjustments: number;
  recurringAnomalies: string[];
  timestamp: string;
};

type PromptMod = {
  agentId: string;
  currentFragment: string;
  suggestedFragment: string;
  reason: string;
  confidence: number;
};

type ThresholdAdj = {
  thresholdName: string;
  currentValue: number;
  suggestedValue: number;
  reason: string;
  confidence: number;
};

type DashboardData = {
  summary: {
    totalCycleTraces: number;
    totalAnomalies: number;
    totalInterventions: number;
    approvedInterventions: number;
    deniedInterventions: number;
    totalRunLearnings: number;
    avgQualityScore: number | null;
    lookbackDays: number;
  };
  anomalyTypeCounts: Record<string, number>;
  anomalySeverityCounts: Record<string, number>;
  interventionTypeCounts: Record<string, number>;
  stepAnomalyCounts: Record<string, number>;
  healthTrend: Array<{ step: string; onTrack: boolean; severity: string; anomalies: number; intervened: boolean }>;
  recentAnomalies: Anomaly[];
  recentInterventions: Intervention[];
  recentLearnings: Learning[];
  promptModifications: PromptMod[];
  thresholdAdjustments: ThresholdAdj[];
};

const severityColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  none: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

const anomalyTypeLabels: Record<string, string> = {
  cost_overrun: "Cost Overrun",
  latency_spike: "Latency Spike",
  quality_drop: "Quality Drop",
  hallucination_risk: "Hallucination Risk",
  citation_gap: "Citation Gap",
  loop_stuck: "Loop Stuck",
  budget_depletion: "Budget Depletion",
  contradiction: "Contradiction",
  empty_output: "Empty Output",
  rate_limit: "Rate Limit",
  refusal: "Refusal",
};

const interventionTypeLabels: Record<string, string> = {
  force_synthesis: "Force Synthesis",
  abort_step: "Abort Step",
  adjust_threshold: "Adjust Threshold",
  modify_prompt: "Modify Prompt",
  switch_provider: "Switch Provider",
  reduce_scope: "Reduce Scope",
  request_human_review: "Request Human Review",
  skip_optional_step: "Skip Optional Step",
  add_step: "Add Step",
  retry_with_feedback: "Retry with Feedback",
  log_only: "Log Only",
};

export default function WitnessDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/witness`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || "Failed to load Witness data");
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
        title="Witness — Observateur métacognitif"
        description="Le Witness observe le pipeline, détecte les anomalies, intervient si nécessaire, et apprend entre les runs."
      />

      <div className="px-6 pb-12 max-w-7xl mx-auto">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Eye className="w-4 h-4" />
            <span>Couche métacognitive — pattern Sakshi Witness</span>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
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
            Loading Witness data...
          </div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <SummaryCard
                icon={<Activity className="w-5 h-5" />}
                label="Traces de cycle"
                value={data.summary.totalCycleTraces}
                color="text-blue-300"
              />
              <SummaryCard
                icon={<AlertTriangle className="w-5 h-5" />}
                label="Anomalies"
                value={data.summary.totalAnomalies}
                color="text-orange-300"
              />
              <SummaryCard
                icon={<Shield className="w-5 h-5" />}
                label="Interventions"
                value={`${data.summary.approvedInterventions}/${data.summary.totalInterventions}`}
                sublabel={`${data.summary.deniedInterventions} refusées`}
                color="text-purple-300"
              />
              <SummaryCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Qualité moyenne"
                value={data.summary.avgQualityScore !== null ? `${data.summary.avgQualityScore}/100` : "—"}
                sublabel={`${data.summary.totalRunLearnings} runs`}
                color="text-green-300"
              />
            </div>

            {/* Two-column: Anomalies + Interventions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Anomaly Distribution */}
              <Panel title="Distribution des anomalies" icon={<AlertTriangle className="w-4 h-4" />}>
                {Object.keys(data.anomalyTypeCounts).length === 0 ? (
                  <EmptyState text="Aucune anomalie détectée" />
                ) : (
                  <div className="space-y-2">
                    {Object.entries(data.anomalyTypeCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">
                            {anomalyTypeLabels[type] || type}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-orange-400/60 rounded-full"
                                style={{ width: `${Math.min(100, (count / data.summary.totalAnomalies) * 100)}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-400 w-8 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Severity breakdown */}
                {Object.keys(data.anomalySeverityCounts).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="text-xs text-gray-500 mb-2">Par sévérité</div>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(data.anomalySeverityCounts).map(([sev, count]) => (
                        <span
                          key={sev}
                          className={cn("px-2 py-0.5 text-xs rounded border", severityColors[sev] || severityColors.none)}
                        >
                          {sev}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              {/* Intervention Distribution */}
              <Panel title="Distribution des interventions" icon={<Zap className="w-4 h-4" />}>
                {Object.keys(data.interventionTypeCounts).length === 0 ? (
                  <EmptyState text="Aucune intervention exécutée" />
                ) : (
                  <div className="space-y-2">
                    {Object.entries(data.interventionTypeCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">
                            {interventionTypeLabels[type] || type}
                          </span>
                          <span className="text-sm text-gray-400">{count}</span>
                        </div>
                      ))}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-white/5 flex gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300">{data.summary.approvedInterventions} approved</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-gray-300">{data.summary.deniedInterventions} denied</span>
                  </div>
                </div>
              </Panel>
            </div>

            {/* Per-step anomaly counts */}
            <Panel title="Anomalies par étape du pipeline" icon={<Activity className="w-4 h-4" />} className="mb-8">
              {Object.keys(data.stepAnomalyCounts).length === 0 ? (
                <EmptyState text="Aucune donnée d'anomalie par étape" />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(data.stepAnomalyCounts).map(([step, count]) => (
                    <div key={step} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-gray-500 uppercase tracking-wide">{step}</div>
                      <div className="text-2xl font-bold text-orange-300 mt-1">{count}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Cross-Run Learning: Prompt Modifications */}
            <Panel
              title="Apprentissage cross-run — Modifications de prompts"
              icon={<Lightbulb className="w-4 h-4" />}
              className="mb-8"
            >
              {data.promptModifications.length === 0 ? (
                <EmptyState text="Aucune modification de prompt suggérée" />
              ) : (
                <div className="space-y-3">
                  {data.promptModifications.map((mod, i) => (
                    <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-purple-300">{mod.agentId}</span>
                        <span className="text-xs text-gray-500">
                          confidence: {Math.round(mod.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 mb-1">
                        <span className="text-gray-500">Add: </span>
                        {mod.suggestedFragment}
                      </p>
                      <p className="text-xs text-gray-500">{mod.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Threshold Adjustments */}
            <Panel
              title="Apprentissage cross-run — Ajustements de seuils"
              icon={<TrendingUp className="w-4 h-4" />}
              className="mb-8"
            >
              {data.thresholdAdjustments.length === 0 ? (
                <EmptyState text="Aucun ajustement de seuil suggéré" />
              ) : (
                <div className="space-y-3">
                  {data.thresholdAdjustments.map((adj, i) => (
                    <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-green-300">{adj.thresholdName}</span>
                        <span className="text-xs text-gray-500">
                          confidence: {Math.round(adj.confidence * 100)}%
                        </span>
                      </div>
                      <div className="text-sm text-gray-300 mb-1">
                        <span className="text-gray-500">{adj.currentValue}</span>
                        {" → "}
                        <span className="text-green-300">{adj.suggestedValue}</span>
                      </div>
                      <p className="text-xs text-gray-500">{adj.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Recent Anomalies */}
            <Panel title="Anomalies récentes" icon={<AlertTriangle className="w-4 h-4" />} className="mb-8">
              {data.recentAnomalies.length === 0 ? (
                <EmptyState text="Aucune anomalie récente" />
              ) : (
                <div className="space-y-2">
                  {data.recentAnomalies.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5">
                      <span
                        className={cn(
                          "px-2 py-0.5 text-xs rounded border shrink-0",
                          severityColors[a.severity] || severityColors.none,
                        )}
                      >
                        {a.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-300">
                          <span className="font-medium">{anomalyTypeLabels[a.type] || a.type}</span>
                          {" on "}
                          <span className="text-gray-400">{a.pipelineStep}</span>
                        </div>
                        <div className="text-xs text-gray-500 truncate">{a.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Recent Interventions */}
            <Panel title="Interventions récentes" icon={<Zap className="w-4 h-4" />} className="mb-8">
              {data.recentInterventions.length === 0 ? (
                <EmptyState text="Aucune intervention récente" />
              ) : (
                <div className="space-y-2">
                  {data.recentInterventions.map((int, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5">
                      {int.approved ? (
                        <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-300">
                          <span className="font-medium">{interventionTypeLabels[int.type] || int.type}</span>
                          {" on "}
                          <span className="text-gray-400">{int.pipelineStep}</span>
                          {int.result && (
                            <span className={cn(
                              "ml-2 text-xs",
                              int.result === "success" ? "text-green-400" :
                              int.result === "failed" ? "text-red-400" : "text-yellow-400"
                            )}>
                              {int.result}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{int.reason}</div>
                        {!int.approved && int.rejectionReason && (
                          <div className="text-xs text-red-400/70">Denied: {int.rejectionReason}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Recent Run Learnings */}
            <Panel title="Apprentissages récents des runs" icon={<TrendingUp className="w-4 h-4" />} className="mb-8">
              {data.recentLearnings.length === 0 ? (
                <EmptyState text="Aucun apprentissage — lancez le pipeline avec useWitness:true" />
              ) : (
                <div className="space-y-2">
                  {data.recentLearnings.map((l, i) => (
                    <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300 truncate max-w-md">{l.query}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded",
                            l.qualityScore >= 80 ? "bg-green-500/20 text-green-300" :
                            l.qualityScore >= 60 ? "bg-yellow-500/20 text-yellow-300" :
                            "bg-red-500/20 text-red-300"
                          )}>
                            {l.qualityScore}/100
                          </span>
                          {l.recommendsChanges && (
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              changes recommended
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>{l.promptMods} prompt mods</span>
                        <span>{l.thresholdAdjustments} threshold adjustments</span>
                        {l.recurringAnomalies.length > 0 && (
                          <span>recurring: {l.recurringAnomalies.join(", ")}</span>
                        )}
                      </div>
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
  icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  color: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
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
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("p-5 rounded-xl bg-white/5 border border-white/10", className)}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-sm font-medium text-gray-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-sm text-gray-500 py-4 text-center">{text}</div>;
}
