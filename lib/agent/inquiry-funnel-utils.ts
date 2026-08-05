/**
 * Inquiry Funnel — Shared utilities (single source of truth)
 * Used by inquiry-pipeline + inquiry-orchestrator only.
 */

import type { InquiryDepth } from "@/lib/types/inquiry";

/** Normalize topic for dedup comparisons (stable, lowercase, max 120 chars). */
export function normalizeTopicKey(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 120);
}

export function countWordsHtml(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").filter(Boolean).length : 0;
}

export function getPipelineCostUsd(stats: Record<string, unknown>): number {
  const cost = stats.totalCostUsd;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : 0;
}

export function publicationTypeToDepth(type: string): InquiryDepth {
  if (type === "STRATEGIC_REPORT") return "strategic";
  if (type === "ARTICLE" || type === "RESEARCH_BRIEF" || type === "EXECUTIVE_BRIEF" || type === "POLICY_NOTE" || type === "DOSSIER") return "deep";
  if (type === "SUMMARY_BRIEF" || type === "UPDATE_NOTE" || type === "DATA_NOTE") return "surface";
  return "deep";
}

export function depthToPublicationType(
  depth: InquiryDepth,
  format: "brief" | "strategic"
): string {
  if (depth === "strategic") return "STRATEGIC_REPORT";
  if (depth === "deep") return "ARTICLE";
  if (depth === "surface") return "SUMMARY_BRIEF";
  if (format === "strategic") return "STRATEGIC_REPORT";
  return "ARTICLE";
}

export interface PipelineScores {
  trustScore: number;
  qualityScore: number;
  citationCoverage: number;
}

/**
 * Unified score extraction from pipeline stats + brief row.
 * Priority: Critical Loop (composite incl. adversarial) → Devil's Advocate → editorial arbiter → brief.trustScore
 *
 * The critical loop finalScore is a composite of methodology (35%), adversarial (35%),
 * and calibration (30%) — it IS the trust metric. DA publishabilityScore is a
 * publishability gate metric (already passed separately to the publication gate
 * via devilsAdvocateScore + fatalChallenges), not a trust score. Using DA=0 as
 * trust score when the DA finds fatal flaws but the analysis is otherwise sound
 * (critical loop = 58) incorrectly zeroes the trust score.
 */
export function extractPipelineScores(
  stats: Record<string, unknown>,
  lineage: Record<string, unknown>,
  brief?: { trustScore: number | null; qualityScore: number | null }
): PipelineScores {
  const da = (lineage.devilsAdvocate ?? stats.devilsAdvocate) as Record<string, unknown> | undefined;
  const cv = stats.citationVerifier as Record<string, unknown> | undefined;
  const cf = stats.citationFilter as Record<string, unknown> | undefined;
  const critical = stats.criticalLoop as Record<string, unknown> | undefined;
  const rank = stats.rank as Record<string, unknown> | undefined;

  const scaleScore = (v: number | null | undefined): number | undefined => {
    if (v == null || !Number.isFinite(v)) return undefined;
    return v <= 1 ? Math.round(v * 100) : Math.round(v);
  };

  // Citation coverage: prefer citation filter (syntactic coverage) over NLI integrity (semantic)
  // NLI is too strict for gate decisions — it checks if source content supports the claim,
  // which is a quality signal, not a coverage signal. Coverage = "are sources cited at all?"
  const filterCoverage =
    (typeof cf?.coverageAfter === "number" ? cf.coverageAfter : undefined);
  const nliIntegrity =
    (typeof cv?.integrity === "number" ? cv.integrity : undefined) ??
    (typeof cv?.overallIntegrity === "number" ? cv.overallIntegrity : undefined);
  const citationCoverage = filterCoverage != null
    ? filterCoverage / 100
    : nliIntegrity != null
      ? nliIntegrity / 100
      : 0;

  const qualityScore =
    (typeof rank?.avgQuality === "number" ? Math.round(rank.avgQuality) : undefined) ??
    scaleScore(brief?.qualityScore ?? null) ?? 70;

  const criticalScore =
    (typeof critical?.finalScore === "number" ? Math.round(critical.finalScore) : undefined);

  // Blended trust score: critical loop (50%) + source quality (30%) + citation coverage (20%)
  // This prevents trust from being solely determined by LLM critics, which can be
  // overly harsh. Source quality and citation coverage are objective metrics.
  const daScore =
    (typeof da?.publishabilityScore === "number" ? Math.round(da.publishabilityScore) : undefined);

  const editorialScore =
    (typeof (lineage.editorialArbiter as Record<string, unknown> | undefined)?.confidence === "number"
      ? Math.round((lineage.editorialArbiter as { confidence: number }).confidence)
      : undefined) ??
    (typeof (stats.editorialArbiter as Record<string, unknown> | undefined)?.confidence === "number"
      ? Math.round((stats.editorialArbiter as { confidence: number }).confidence)
      : undefined);

  let trustScore: number;
  if (criticalScore != null) {
    if (criticalScore <= 40) {
      // Grounding veto is terminal — no blend can compensate (Invariant 4)
      trustScore = criticalScore;
    } else {
      // Primary: blend critical loop + source quality + citation coverage
      // criticalScore already incorporates citationCoverage, groundedness, diversity, etc.
      // so it gets the highest weight. citationCoverage is double-counted intentionally
      // (it's the most important gate metric) but with reduced weight.
      trustScore = Math.round(
        criticalScore * 0.6 +
        qualityScore * 0.25 +
        (citationCoverage * 100) * 0.15
      );
    }
  } else if (daScore != null) {
    trustScore = daScore;
  } else if (editorialScore != null) {
    trustScore = editorialScore;
  } else {
    trustScore = scaleScore(brief?.trustScore ?? null) ?? 70;
  }

  return { trustScore, qualityScore, citationCoverage };
}
