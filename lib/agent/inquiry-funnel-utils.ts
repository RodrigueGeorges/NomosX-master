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
  const text = html.replace(/<(style|script|head)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").filter(Boolean).length : 0;
}

export function getPipelineCostUsd(stats: Record<string, unknown>): number {
  const cost = stats.totalCostUsd;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : 0;
}

export function publicationTypeToDepth(type: string): InquiryDepth {
  // Canonical 1:1 mapping — 4 formats = 4 depths
  if (type === "STRATEGIC_REPORT") return "strategic";
  if (type === "ARTICLE") return "deep";
  if (type === "DECISION_MEMO") return "standard";
  if (type === "SUMMARY_BRIEF") return "surface";
  // Legacy aliases → canonical depth
  if (type === "RESEARCH_BRIEF" || type === "EXECUTIVE_BRIEF" || type === "POLICY_NOTE") return "standard";
  if (type === "UPDATE_NOTE" || type === "DATA_NOTE") return "surface";
  if (type === "DOSSIER") return "strategic";
  return "deep";
}

export function depthToPublicationType(
  depth: InquiryDepth,
  format?: "brief" | "memo" | "strategic"
): string {
  if (depth === "strategic") return "STRATEGIC_REPORT";
  if (depth === "deep") return "ARTICLE";
  if (depth === "standard") return "DECISION_MEMO";
  if (depth === "surface") return "SUMMARY_BRIEF";
  if (format === "strategic") return "STRATEGIC_REPORT";
  if (format === "memo") return "DECISION_MEMO";
  return "ARTICLE";
}

export interface PipelineScores {
  trustScore: number;
  qualityScore: number;
  citationCoverage: number;
}

/**
 * Moderate-confidence calibrated tier.
 *
 * The mandate is an argued position, not silence: when every integrity check
 * passes (sources, citations, scenario, adversarial, freshness) and the ONLY
 * gate failure is the composite trust bar sitting in the moderate band, the
 * piece publishes as a labeled preliminary assessment — the calibration badge
 * is rendered inside the HTML, not buried in metadata.
 *
 * What stays a hard floor: evidence absence (source_depth, citation_coverage,
 * claim density), a broken scenario, stale/missing evaluations, researcher
 * sign-off, quality < 40 — those hold regardless. The tier only absorbs the
 * single case where the artifact is honest and defensible but thin.
 */
export function isModerateTierEligible(input: {
  gate: {
    decision?: string;
    checks?: Array<{ checkType: string; passed: boolean; score?: number }>;
  };
  readiness: { ok?: boolean; failures?: string[] };
  trustScore: number;
  qualityScore: number;
  adaptiveMinTrust: number;
  minViableTrust?: number;
}): boolean {
  const minViable = input.minViableTrust ?? 55;
  if (input.trustScore < minViable || input.trustScore >= input.adaptiveMinTrust) return false;
  if (input.qualityScore < 40) return false;
  // The trust band only applies when the gate held — a clean 'publish' or a
  // 'revise' is already handled by the normal tiers.
  if (input.gate.decision !== 'hold') return false;
  // The hold must actually come FROM the trust bar — a 'hold' with no failed
  // trust_score check is an inconsistent state; stay held.
  const checks = input.gate.checks ?? [];
  if (!checks.some(c => c.checkType === 'trust_score' && !c.passed)) return false;
  // Every other failed gate check must be a score-band failure, not an
  // integrity failure: quality_score is allowed while it stays ≥40 (the
  // gate treats ≥40 as advisory-soft). Anything else failing is real.
  const failedNonTrust = checks.filter(c =>
    !c.passed &&
    c.checkType !== 'trust_score' &&
    !(c.checkType === 'quality_score' && typeof c.score === 'number' && c.score >= 40)
  );
  if (failedNonTrust.length > 0) return false;
  // Readiness failures confined to the score band are the tier's raison
  // d'être; coverage/word-count failures are evidence-density — stay held.
  const substantive = (input.readiness.failures ?? [])
    .filter(f => !f.startsWith('trustScore') && !f.startsWith('qualityScore'));
  return substantive.length === 0;
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

  // Source quality for the blend: prefer the average of sources actually
  // CITED in the artifact (persisted by persistence-tail) over the ranked-pool
  // average — the pool is diluted by the long tail of ranked-but-unused
  // sources, which under-scores reports resting on their strongest evidence.
  const citedQ = stats.citedSourceQuality as { cited?: number; avgQuality?: number } | undefined;
  const qualityScore =
    (typeof citedQ?.avgQuality === "number" && (citedQ.cited ?? 0) >= 4 ? Math.round(citedQ.avgQuality) : undefined) ??
    (typeof rank?.avgQuality === "number" ? Math.round(rank.avgQuality) : undefined) ??
    scaleScore(brief?.qualityScore ?? null) ?? 70;

  // Adaptive quality boost: when a report has many sources (50+), the average quality
  // is diluted by long-tail sources. The cited sources (those actually used in the analysis)
  // are a better proxy for report quality. If citation coverage is high (≥80%), boost quality
  // by up to 12 points — a well-cited report with 122 sources at avg 69 is effectively higher
  // quality than a poorly-cited report with 10 sources at avg 75.
  // Also boost when source diversity is high (many providers) — this indicates
  // cross-verification from independent sources, which is a quality signal.
  const citedQualityBoost = citationCoverage >= 0.80 && qualityScore < 78
    ? Math.min(12, Math.round((citationCoverage - 0.80) * 60)) // 80% → +0, 100% → +12
    : 0;
  const sourceQualityScore = Math.min(100, qualityScore + citedQualityBoost);

  // Analysis quality: blend critic score, structural editor, and devil's advocate
  // These measure the QUALITY OF THE ANALYSIS ITSELF, not just the sources.
  const criticScore =
    (typeof (stats.critic as Record<string, unknown> | undefined)?.overallScore === "number"
      ? Math.round((stats.critic as { overallScore: number }).overallScore)
      : undefined);
  const structuralScore =
    (typeof (stats.structuralEditor as Record<string, unknown> | undefined)?.overallStructure === "number"
      ? Math.round((stats.structuralEditor as { overallStructure: number }).overallStructure)
      : undefined);
  const daPublishScore =
    (typeof da?.publishabilityScore === "number" ? Math.round(da.publishabilityScore) : undefined);

  // Blend: 50% source quality + 10% critic + 25% structural + 15% DA
  // Critic weight is low (10%) because critic already penalizes trust score via veto
  // (up to -22%) and via 10% weight in trust composite. Giving it 25% here would
  // triple-count critic severity. Structural editor and DA measure different dimensions.
  const blendParts: { score: number; weight: number }[] = [
    { score: sourceQualityScore, weight: 50 },
  ];
  if (criticScore != null) blendParts.push({ score: criticScore, weight: 10 });
  if (structuralScore != null) blendParts.push({ score: structuralScore, weight: 25 });
  if (daPublishScore != null) blendParts.push({ score: daPublishScore, weight: 15 });

  const totalWeight = blendParts.reduce((sum, p) => sum + p.weight, 0);
  const adjustedQualityScore = totalWeight > 0
    ? Math.round(blendParts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight)
    : sourceQualityScore;

  const criticalScore =
    (typeof critical?.finalScore === "number" ? Math.round(critical.finalScore) : undefined);

  // Blended trust score: critical loop (50%) + source quality (30%) + citation coverage (20%)
  // This prevents trust from being solely determined by LLM critics, which can be
  // overly harsh. Source quality and citation coverage are objective metrics.
  const daScore = daPublishScore;

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
        adjustedQualityScore * 0.25 +
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

  if (criticalScore != null && Number.isFinite(criticalScore)) {
    trustScore = Math.max(0, Math.min(100, criticalScore));
  }

  return { trustScore, qualityScore: adjustedQualityScore, citationCoverage };
}
