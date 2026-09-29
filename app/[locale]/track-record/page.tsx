"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import AuthModal from "@/components/AuthModal";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { nx } from "@/lib/brand/public-ui";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Clock, ArrowRight, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

type Prediction = {
  id: string;
  claim: string;
  horizon: string;
  probability: number | null;
  confidence: string;
  status?: string;
  resolvedAt?: string | null;
  outcome?: string | null;
  resolutionCriteria?: string;
  createdAt: string;
  briefId?: string | null;
};

type TrackRecordData = {
  stats: {
    total: number;
    open: number;
    confirmed: number;
    refuted: number;
    expired: number;
    superseded: number;
    resolved: number;
    accuracyPct: number | null;
    brierScore: number | null;
    quantifiedResolved: number;
  };
  recentResolved: Prediction[];
  openPredictions: Prediction[];
  pagination: {
    page: number;
    limit: number;
    totalResolved: number;
    totalOpen: number;
    totalPagesResolved: number;
    totalPagesOpen: number;
  };
};

function pct(p: number | null): string {
  return p === null ? "—" : `${Math.round(p * 100)}%`;
}

const SITE_URL = typeof window !== "undefined" ? window.location.origin : "https://nomosx.com";

export default function TrackRecordPage() {
  const router = useRouter();
  const t = useTranslations();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [data, setData] = useState<TrackRecordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchData = useCallback((p: number) => {
    setLoading(true);
    setError(null);
    fetch(`/api/public/track-record?page=${p}&limit=${limit}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d?.stats) {
          setData(d);
          setPage(p);
        } else {
          setError("Received invalid data from the server.");
        }
      })
      .catch((err) => {
        setError(`Failed to load track record: ${err.message}. Please try again.`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const stats = data?.stats;
  const pagination = data?.pagination;

  const jsonLdData = stats
    ? {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "NomosX Prediction Track Record",
        description:
          "Falsifiable predictions published by NomosX, each dated with resolution criteria and resolved in public. Includes hit rate and Brier score for calibration.",
        url: `${SITE_URL}/track-record`,
        creator: { "@type": "Organization", name: "NomosX" },
        temporalCoverage: "2024/",
        keywords: ["predictions", "track record", "falsifiable", "Brier score", "think tank"],
        variableMeasured: [
          "prediction claim",
          "horizon",
          "probability",
          "confidence tier",
          "resolution status",
          "outcome",
        ],
        measurementTechnique: "Brier score (mean squared error of probability forecasts)",
      }
    : null;

  return (
    <>
      {jsonLdData && <JsonLd data={jsonLdData} />}
      <PublicPageShell currentPage="home" onSignInClick={() => setShowAuthModal(true)}>
        {/* Section 01 / 03 — Header + Aggregate stats */}
        <PageSection sectionIndex="01 / 03" className="max-w-5xl">
          <PageHeader
            eyebrow={t("TrackRecord.accountability")}
            title={t("TrackRecord.title")}
            description={t("TrackRecord.description")}
            align="center"
          />

          {loading && (
            <div className="flex justify-center py-16" role="status" aria-label="Loading track record">
              <div className={cn("w-8 h-8", nx.spinner)} />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-16" role="alert">
              <AlertCircle size={32} className="mx-auto mb-4 text-amber-400" />
              <p className="text-sm text-black/70 dark:text-white/70 mb-6">{error}</p>
              <button
                type="button"
                onClick={() => fetchData(page)}
                className={cn(nx.btnPrimary, "mx-auto")}
              >
                {t("TrackRecord.retry")}
              </button>
            </div>
          )}

          {!loading && !error && stats && (
            <>
              {/* Aggregate stats */}
              <ScrollReveal stagger>
                <section aria-label="Aggregate prediction statistics" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12">
                  {[
                    { label: t("TrackRecord.predictionsMade"), value: String(stats.total) },
                    { label: t("TrackRecord.resolved"), value: String(stats.resolved) },
                    { label: t("TrackRecord.hitRate"), value: stats.accuracyPct !== null ? `${stats.accuracyPct}%` : "pending" },
                    { label: t("TrackRecord.brierScore"), value: stats.brierScore !== null ? String(stats.brierScore) : "pending" },
                  ].map((s) => (
                    <div key={s.label} className="nx-surface p-4 text-center">
                      <p className="font-mono text-2xl font-light text-black dark:text-white tabular-nums mb-2">{s.value}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-black/50 dark:text-white/50">{s.label}</p>
                    </div>
                  ))}
                </section>
              </ScrollReveal>

              <ScrollReveal>
                <p className="text-xs text-black/40 dark:text-white/40 text-center mb-12 max-w-2xl mx-auto leading-relaxed">
                  {t("TrackRecord.hitRateNote", { expired: stats.expired, superseded: stats.superseded, quantifiedResolved: stats.quantifiedResolved })}
                </p>
              </ScrollReveal>

              {stats.total === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-black/60 dark:text-white/60 mb-6">
                    {t("TrackRecord.noPredictions")}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push(PUBLIC_ROUTES.archives)}
                    className={cn(nx.btnPrimary, "mx-auto")}
                  >
                    {t("TrackRecord.browsePublished")}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </PageSection>

        {/* Section 02 / 03 — Resolved predictions */}
        {!loading && !error && data?.recentResolved && data.recentResolved.length > 0 && (
          <PageSection sectionIndex="02 / 03" className="max-w-5xl">
            <ScrollReveal stagger>
              <section aria-label="Recently resolved predictions" className="mb-12">
                <h2 className={cn(nx.eyebrow, "mb-6")}>{t("TrackRecord.recentlyResolved")}</h2>
                <div className="space-y-3">
                  {data!.recentResolved.map((p) => (
                    <article key={p.id} className="nx-surface p-4">
                      <div className="flex items-start gap-3">
                        {p.status === "CONFIRMED" ? (
                          <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-400" aria-label={t("TrackRecord.confirmed")} />
                        ) : (
                          <XCircle size={16} className="mt-0.5 shrink-0 text-rose-400" aria-label={t("TrackRecord.refuted")} />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm text-black/85 dark:text-white/85 leading-relaxed">{p.claim}</p>
                          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-black/45 dark:text-white/45">
                            {p.status} · horizon {p.horizon} · called {pct(p.probability)} · made {new Date(p.createdAt).toISOString().slice(0, 10)}
                            {p.resolvedAt ? ` · resolved ${new Date(p.resolvedAt).toISOString().slice(0, 10)}` : ""}
                          </p>
                          {p.outcome && <p className="mt-2 text-xs text-black/55 dark:text-white/55 leading-relaxed">{t("TrackRecord.whatHappened", { outcome: p.outcome })}</p>}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {pagination && pagination.totalPagesResolved > 1 && (
                  <PaginationControls
                    current={page}
                    total={pagination.totalPagesResolved}
                    onPage={fetchData}
                    label={t("TrackRecord.recentlyResolved").toLowerCase()}
                  />
                )}
              </section>
            </ScrollReveal>
          </PageSection>
        )}

        {/* Section 03 / 03 — Open predictions */}
        {!loading && !error && data?.openPredictions && data.openPredictions.length > 0 && (
          <PageSection sectionIndex="03 / 03" className="max-w-5xl">
            <ScrollReveal stagger>
              <section aria-label="Open predictions awaiting resolution" className="mb-12">
                <h2 className={cn(nx.eyebrow, "mb-6")}>{t("TrackRecord.openPredictionsHold")}</h2>
                <div className="space-y-3">
                  {data!.openPredictions.map((p) => (
                    <article key={p.id} className="nx-surface p-4">
                      <div className="flex items-start gap-3">
                        <Clock size={16} className="mt-0.5 shrink-0 text-black/40 dark:text-white/40" aria-label={t("TrackRecord.open")} />
                        <div className="min-w-0">
                          <p className="text-sm text-black/85 dark:text-white/85 leading-relaxed">{p.claim}</p>
                          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-black/45 dark:text-white/45">
                            OPEN · horizon {p.horizon} · confidence {p.confidence.toLowerCase()} · called {pct(p.probability)} · made {new Date(p.createdAt).toISOString().slice(0, 10)}
                          </p>
                          {p.resolutionCriteria && (
                            <p className="mt-2 text-xs text-black/55 dark:text-white/55 leading-relaxed">{t("TrackRecord.resolvesWhen", { criteria: p.resolutionCriteria })}</p>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {pagination && pagination.totalPagesOpen > 1 && (
                  <PaginationControls
                    current={page}
                    total={pagination.totalPagesOpen}
                    onPage={fetchData}
                    label={t("TrackRecord.open").toLowerCase()}
                  />
                )}
              </section>
            </ScrollReveal>
          </PageSection>
        )}
      </PublicPageShell>
      {showAuthModal && (
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSignupSuccess={() => setShowAuthModal(false)} />
      )}
    </>
  );
}

function PaginationControls({
  current,
  total,
  onPage,
  label,
}: {
  current: number;
  total: number;
  onPage: (p: number) => void;
  label: string;
}) {
  const t = useTranslations();
  return (
    <nav
      className="flex items-center justify-center gap-4 mt-6"
      aria-label={`Pagination for ${label}`}
    >
      <button
        type="button"
        onClick={() => onPage(Math.max(1, current - 1))}
        disabled={current <= 1}
        className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft size={14} />
        {t("TrackRecord.prev")}
      </button>
      <span className="font-mono text-[11px] text-black/45 dark:text-white/45" aria-live="polite">
        {t("TrackRecord.pageOf", { current, total })}
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(total, current + 1))}
        disabled={current >= total}
        className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Next page"
      >
        {t("TrackRecord.next")}
        <ChevronRight size={14} />
      </button>
    </nav>
  );
}
