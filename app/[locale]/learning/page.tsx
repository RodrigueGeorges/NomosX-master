"use client";

import React, { useEffect, useState } from "react";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { Brain, TrendingUp, AlertCircle, CheckCircle, XCircle, Lightbulb, RefreshCw } from "lucide-react";

type Lesson = {
  id: string;
  agent: string;
  lesson: string;
  category: string;
  severity: string;
  source: string;
  successRate: number;
  weight: number;
  appliedCount: number;
  timestamp: string;
};

type Correction = {
  id: string;
  agent: string;
  section: string;
  correctionType: string;
  comment: string;
  timestamp: string;
};

type SelfCorrection = {
  id: string;
  agent: string;
  phase: string;
  originalScore: number;
  finalScore: number;
  retries: number;
  improved: boolean;
  timestamp: string;
};

type DashboardData = {
  period: { days: number; since: string };
  summary: {
    totalLessons: number;
    humanLessons: number;
    autoLessons: number;
    totalCorrections: number;
    totalSelfCorrections: number;
    selfCorrectionImprovementRate: number;
  };
  byAgent: Record<string, { lessons: number; corrections: number; selfCorrections: number; avgSuccessRate: number }>;
  lessons: Lesson[];
  corrections: Correction[];
  selfCorrections: SelfCorrection[];
};

export default function LearningDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/learning?days=${d}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || "Failed to load learning data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(days);
  }, [days]);

  const severityColor = (sev: string) => {
    switch (sev) {
      case "critical": return "text-red-400 bg-red-500/10 border-red-500/30";
      case "high": return "text-orange-400 bg-orange-500/10 border-orange-500/30";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
      default: return "text-blue-400 bg-blue-500/10 border-blue-500/30";
    }
  };

  const sourceBadge = (source: string) => {
    return source === "HUMAN_CORRECTION" ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30">
        <Lightbulb className="w-3 h-3" /> Humain
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-500/10 text-slate-400 border border-slate-500/30">
        <Brain className="w-3 h-3" /> Auto
      </span>
    );
  };

  return (
    <PublicPageShell>
      <PageHeader
        title="Tableau de bord d'apprentissage"
        description="Comment le système apprend, se corrige et s'améliore"
      />

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Controls */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-400">Période :</label>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200"
          >
            <option value={7}>7 jours</option>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
          </select>
          <button
            onClick={() => fetchData(days)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Actualiser
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Chargement...
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={<Brain className="w-5 h-5" />}
                label="Leçons apprises"
                value={data.summary.totalLessons}
                sub={`${data.summary.humanLessons} humaines / ${data.summary.autoLessons} auto`}
                color="blue"
              />
              <StatCard
                icon={<Lightbulb className="w-5 h-5" />}
                label="Corrections humaines"
                value={data.summary.totalCorrections}
                sub="Vos corrections manuelles"
                color="purple"
              />
              <StatCard
                icon={<RefreshCw className="w-5 h-5" />}
                label="Self-corrections"
                value={data.summary.totalSelfCorrections}
                sub="Corrections automatiques dans le run"
                color="cyan"
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Taux d'amélioration"
                value={`${Math.round(data.summary.selfCorrectionImprovementRate * 100)}%`}
                sub="Self-corrections qui ont amélioré le score"
                color="green"
              />
            </div>

            {/* By agent */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Apprentissage par agent</h2>
              <div className="space-y-3">
                {Object.entries(data.byAgent).map(([agent, stats]) => (
                  <div key={agent} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-300 capitalize">{agent}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="text-slate-400 text-xs">Leçons</div>
                        <div className="text-slate-200 font-semibold">{stats.lessons}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-xs">Corrections</div>
                        <div className="text-slate-200 font-semibold">{stats.corrections}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-xs">Self-correct</div>
                        <div className="text-slate-200 font-semibold">{stats.selfCorrections}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-xs">Taux succès</div>
                        <div className={cn(
                          "font-semibold",
                          stats.avgSuccessRate > 0.7 ? "text-green-400" : stats.avgSuccessRate > 0.5 ? "text-yellow-400" : "text-red-400"
                        )}>
                          {Math.round(stats.avgSuccessRate * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {Object.keys(data.byAgent).length === 0 && (
                  <p className="text-slate-500 text-sm py-4 text-center">
                    Aucune donnée d'apprentissage sur cette période. Lancez quelques analyses pour commencer.
                  </p>
                )}
              </div>
            </div>

            {/* Lessons list */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Leçons récentes</h2>
              <div className="space-y-3">
                {data.lessons.map((lesson) => (
                  <div key={lesson.id} className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-slate-400 capitalize">{lesson.agent}</span>
                        {sourceBadge(lesson.source)}
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs border", severityColor(lesson.severity))}>
                          {lesson.severity}
                        </span>
                        <span className="text-xs text-slate-500">{lesson.category}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(lesson.timestamp).toLocaleDateString("fr-FR")}
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{lesson.lesson}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Taux de succès : <span className={cn(
                        "font-medium",
                        lesson.successRate > 0.7 ? "text-green-400" : lesson.successRate > 0.5 ? "text-yellow-400" : "text-red-400"
                      )}>{Math.round(lesson.successRate * 100)}%</span></span>
                      <span>Appliquée {lesson.appliedCount} fois</span>
                      <span>Poids : {lesson.weight.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
                {data.lessons.length === 0 && (
                  <p className="text-slate-500 text-sm py-4 text-center">
                    Aucune leçon extraite pour l'instant.
                  </p>
                )}
              </div>
            </div>

            {/* Self-corrections */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Self-corrections récentes</h2>
              <div className="space-y-2">
                {data.selfCorrections.map((sc) => (
                  <div key={sc.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-800/50">
                    {sc.improved ? (
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm text-slate-300">
                        <span className="capitalize">{sc.agent}</span> — phase <span className="capitalize">{sc.phase}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Score : {sc.originalScore} → {sc.finalScore} ({sc.retries} retry)
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(sc.timestamp).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                ))}
                {data.selfCorrections.length === 0 && (
                  <p className="text-slate-500 text-sm py-4 text-center">
                    Aucune self-correction déclenchée. Le système n'a pas eu besoin de se corriger sur cette période.
                  </p>
                )}
              </div>
            </div>

            {/* Human corrections */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Corrections humaines récentes</h2>
              <div className="space-y-2">
                {data.corrections.map((c) => (
                  <div key={c.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-800/50">
                    <Lightbulb className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm text-slate-300">
                        <span className="capitalize">{c.agent}</span> — section <span className="capitalize">{c.section}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Type : {c.correctionType.replace(/_/g, " ")}
                        {c.comment && ` — "${c.comment.slice(0, 100)}"`}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(c.timestamp).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                ))}
                {data.corrections.length === 0 && (
                  <p className="text-slate-500 text-sm py-4 text-center">
                    Aucune correction humaine enregistrée. Utilisez l'API <code className="text-slate-400 bg-slate-800 px-1 rounded">POST /api/feedback/learn</code> pour soumettre une correction.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </PublicPageShell>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  color: "blue" | "purple" | "cyan" | "green";
}) {
  const colorMap = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/30",
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
    green: "text-green-400 bg-green-500/10 border-green-500/30",
  };
  return (
    <div className={cn("rounded-xl border p-5", colorMap[color])}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <div className="text-3xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}
