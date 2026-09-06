"use client";

import React, { useEffect, useState } from "react";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import {
  Trophy, Brain, Eye, TrendingUp, DollarSign, FileText,
  RefreshCw, ArrowRight, Activity, Target, Zap, Globe, Users,
  Lock, Loader2,
} from "lucide-react";

type MetricsData = {
  period: string;
  briefCount: number;
  briefTypes: { strategic: number; brief: number };
  aggregated: {
    totalCostUsd: number;
    avgCostPerBrief: number;
    styleGatePassRate: number;
    numericalGatePassRate: number;
    totalPredictions: number;
    totalResearchGaps: number;
    deepPlanner: { runs: number; avgNodes: number };
  };
  recent: Array<{ id: string; question: string; kind: string; createdAt: string }>;
};

type MoatSummary = {
  prmSteps: number;
  prmTrainingExamples: number;
  selfPlayRounds: number;
  moaRuns: number;
  worldModelDomains: number;
  crossDomainLinks: number;
};

type WitnessSummary = {
  totalCycleTraces: number;
  totalAnomalies: number;
  totalInterventions: number;
  avgQualityScore: number | null;
  totalRunLearnings: number;
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [moatSummary, setMoatSummary] = useState<MoatSummary | null>(null);
  const [witnessSummary, setWitnessSummary] = useState<WitnessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          setAuthChecked(true);
          return;
        }
        const data = await res.json();
        if (data.user?.role === "admin" || data.user?.role === "superadmin") {
          setIsAdmin(true);
        }
        setAuthChecked(true);
      } catch {
        setAuthChecked(true);
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [metricsRes, moatRes, witnessRes] = await Promise.all([
          fetch("/api/dashboard/metrics"),
          fetch("/api/dashboard/moat"),
          fetch("/api/dashboard/witness"),
        ]);

        if (metricsRes.ok) setMetrics(await metricsRes.json());
        if (moatRes.ok) {
          const moatData = await moatRes.json();
          setMoatSummary(moatData.summary);
        }
        if (witnessRes.ok) {
          const witnessData = await witnessRes.json();
          setWitnessSummary(witnessData.summary);
        }
      } catch (e: any) {
        setError(e.message || "Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [isAdmin]);

  const refresh = () => {
    if (!isAdmin) return;
    setLoading(true);
    Promise.all([
      fetch("/api/dashboard/metrics"),
      fetch("/api/dashboard/moat"),
      fetch("/api/dashboard/witness"),
    ]).then(async ([m, mo, w]) => {
      if (m.ok) setMetrics(await m.json());
      if (mo.ok) setMoatSummary((await mo.json()).summary);
      if (w.ok) setWitnessSummary((await w.json()).summary);
      setLoading(false);
    });
  };

  // ── Loading state ──
  if (!authChecked) {
    return (
      <PublicPageShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-black/40" />
        </div>
      </PublicPageShell>
    );
  }

  // ── Not admin ──
  if (!isAdmin) {
    return (
      <PublicPageShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <Lock className="w-10 h-10 text-black/30 mb-4" />
          <h1 className="text-xl font-semibold text-black/80 mb-2">Accès restreint</h1>
          <p className="text-sm text-black/50 text-center max-w-md">
            Cette page est réservée aux administrateurs. Connectez-vous avec un compte admin.
          </p>
        </div>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell>
      <PageHeader
        title="Dashboard — Pilotage de l'agent"
        description="Vue d'ensemble du système : coûts, qualité, auto-amélioration, monitoring métacognitif."
      />

      <div className="px-6 pb-12 max-w-7xl mx-auto">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Activity className="w-4 h-4" />
            <span>Pilotage de l'agent autonome — accès admin</span>
          </div>
          <button
            onClick={refresh}
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

        {loading && !metrics ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Chargement…
          </div>
        ) : (
          <>
            {/* ── SECTION 1: COÛTS & PRODUCTION ────────────────────────── */}
            <SectionTitle icon={<DollarSign className="w-4 h-4" />} title="Coûts & Production" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<FileText className="w-5 h-5" />}
                label="Publications (30j)"
                value={metrics?.briefCount ?? "—"}
                sublabel={`${metrics?.briefTypes.strategic ?? 0} stratégiques · ${metrics?.briefTypes.brief ?? 0} briefs`}
                color="text-blue-300"
              />
              <StatCard
                icon={<DollarSign className="w-5 h-5" />}
                label="Coût total (30j)"
                value={metrics ? `$${metrics.aggregated.totalCostUsd}` : "—"}
                sublabel={`Moyenne : $${metrics?.aggregated.avgCostPerBrief ?? 0}/publication`}
                color="text-green-300"
              />
              <StatCard
                icon={<Target className="w-5 h-5" />}
                label="Taux style gate"
                value={metrics ? `${Math.round(metrics.aggregated.styleGatePassRate * 100)}%` : "—"}
                sublabel="Validation éditoriale"
                color="text-purple-300"
              />
              <StatCard
                icon={<Target className="w-5 h-5" />}
                label="Taux numerical gate"
                value={metrics ? `${Math.round(metrics.aggregated.numericalGatePassRate * 100)}%` : "—"}
                sublabel="Validation numérique"
                color="text-purple-300"
              />
            </div>

            {/* Publications récentes */}
            <div className="mb-8">
              <div className="text-xs font-mono uppercase tracking-[0.14em] text-black/40 mb-3">
                Publications récentes
              </div>
              <div className="space-y-2">
                {metrics?.recent.slice(0, 5).map((b, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-black/5 border border-black/10">
                    <FileText className="w-4 h-4 text-black/40 shrink-0" />
                    <span className="text-sm text-gray-300 truncate flex-1">{b.question}</span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded shrink-0",
                      b.kind === "strategic" ? "bg-blue-500/20 text-blue-300" : "bg-gray-500/20 text-gray-300"
                    )}>
                      {b.kind}
                    </span>
                    <span className="text-xs text-black/40 shrink-0">
                      {new Date(b.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                )) || <div className="text-sm text-gray-500 py-4 text-center">Aucune publication récente</div>}
              </div>
            </div>

            {/* ── SECTION 2: AUTO-AMÉLIORATION (MOAT) ──────────────────── */}
            <SectionTitle icon={<Trophy className="w-4 h-4" />} title="Auto-amélioration (Moat — 4 piliers)" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon={<Brain className="w-5 h-5" />}
                label="Exemples PRM"
                value={moatSummary?.prmTrainingExamples ?? "—"}
                sublabel={`${moatSummary?.prmSteps ?? 0} étapes scorées`}
                color="text-blue-300"
              />
              <StatCard
                icon={<Zap className="w-5 h-5" />}
                label="Runs Self-Play"
                value={moatSummary?.selfPlayRounds ?? "—"}
                sublabel="Tests adversariaux"
                color="text-red-300"
              />
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="Runs MoA"
                value={moatSummary?.moaRuns ?? "—"}
                sublabel="Mixture of Agents"
                color="text-purple-300"
              />
              <StatCard
                icon={<Globe className="w-5 h-5" />}
                label="Domaines World Model"
                value={moatSummary?.worldModelDomains ?? "—"}
                sublabel={`${moatSummary?.crossDomainLinks ?? 0} liens inter-domaines`}
                color="text-green-300"
              />
            </div>
            <DashboardLink
              href="/moat"
              icon={<Trophy className="w-4 h-4" />}
              label="Dashboard Moat détaillé"
              description="PRM, Self-Play, MoA, World Model — métriques complètes"
            />

            {/* ── SECTION 3: WITNESS (MÉTACOGNITION) ───────────────────── */}
            <SectionTitle icon={<Eye className="w-4 h-4" />} title="Witness — Monitoring métacognitif" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon={<Activity className="w-5 h-5" />}
                label="Traces de cycle"
                value={witnessSummary?.totalCycleTraces ?? "—"}
                sublabel="Étapes observées"
                color="text-cyan-300"
              />
              <StatCard
                icon={<Zap className="w-5 h-5" />}
                label="Anomalies"
                value={witnessSummary?.totalAnomalies ?? "—"}
                sublabel="Détectées par le Witness"
                color="text-red-300"
              />
              <StatCard
                icon={<Target className="w-5 h-5" />}
                label="Interventions"
                value={witnessSummary?.totalInterventions ?? "—"}
                sublabel="Actions correctives"
                color="text-yellow-300"
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Qualité moyenne"
                value={witnessSummary?.avgQualityScore !== null && witnessSummary?.avgQualityScore !== undefined ? `${witnessSummary.avgQualityScore}/100` : "—"}
                sublabel={`${witnessSummary?.totalRunLearnings ?? 0} apprentissages`}
                color="text-green-300"
              />
            </div>
            <DashboardLink
              href="/witness"
              icon={<Eye className="w-4 h-4" />}
              label="Dashboard Witness détaillé"
              description="Anomalies, interventions, apprentissages cross-run"
            />

            {/* ── SECTION 4: LEARNING ──────────────────────────────────── */}
            <SectionTitle icon={<TrendingUp className="w-4 h-4" />} title="Apprentissage & Correction" />
            <DashboardLink
              href="/learning"
              icon={<TrendingUp className="w-4 h-4" />}
              label="Dashboard Learning détaillé"
              description="Auto-correction, retours humains, leçons apprises"
            />

            {/* ── SECTION 5: PRÉDICTIONS & GAPS ────────────────────────── */}
            <SectionTitle icon={<Target className="w-4 h-4" />} title="Prédictions & Gaps de recherche" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<Target className="w-5 h-5" />}
                label="Prédictions"
                value={metrics?.aggregated.totalPredictions ?? "—"}
                sublabel="Émises (30j)"
                color="text-blue-300"
              />
              <StatCard
                icon={<Activity className="w-5 h-5" />}
                label="Gaps de recherche"
                value={metrics?.aggregated.totalResearchGaps ?? "—"}
                sublabel="Identifiés (30j)"
                color="text-orange-300"
              />
              <StatCard
                icon={<Brain className="w-5 h-5" />}
                label="Runs Deep Planner"
                value={metrics?.aggregated.deepPlanner.runs ?? "—"}
                sublabel="Planification hiérarchique"
                color="text-purple-300"
              />
              <StatCard
                icon={<Activity className="w-5 h-5" />}
                label="Nœuds moyens"
                value={metrics?.aggregated.deepPlanner.avgNodes ?? "—"}
                sublabel="Par run Deep Planner"
                color="text-purple-300"
              />
            </div>
          </>
        )}
      </div>
    </PublicPageShell>
  );
}

// ─── UI Components ──────────────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-8 first:mt-0">
      <span className="text-black/40">{icon}</span>
      <h2 className="text-sm font-medium text-black/80 uppercase tracking-[0.14em] font-mono">{title}</h2>
      <div className="flex-1 h-px bg-black/[0.08] ml-2" />
    </div>
  );
}

function StatCard({
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

function DashboardLink({ href, icon, label, description }: { href: string; icon: React.ReactNode; label: string; description: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-4 p-4 rounded-xl bg-black/5 border border-black/10 hover:border-black/20 hover:bg-black/[0.08] transition-all group mb-8"
    >
      <span className="text-black/40 group-hover:text-black/80 transition-colors">{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-medium text-black/80">{label}</div>
        <div className="text-xs text-black/40 mt-0.5">{description}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-black/30 group-hover:text-black/60 transition-colors" />
    </a>
  );
}
