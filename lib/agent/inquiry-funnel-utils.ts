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
  if (type === "RESEARCH_BRIEF" || type === "DOSSIER") return "deep";
  if (type === "SUMMARY_BRIEF" || type === "UPDATE_NOTE" || type === "DATA_NOTE") return "surface";
  return "standard";
}

export function depthToPublicationType(
  depth: InquiryDepth,
  format: "brief" | "strategic"
): string {
  if (format === "strategic" || depth === "strategic") return "STRATEGIC_REPORT";
  if (depth === "deep") return "RESEARCH_BRIEF";
  if (depth === "surface") return "SUMMARY_BRIEF";
  return "EXECUTIVE_BRIEF";
}

export interface PipelineScores {
  trustScore: number;
  qualityScore: number;
  citationCoverage: number;
}

/**
 * Unified score extraction from pipeline stats + brief row.
 * Priority: Devil's Advocate → Critical Loop → brief.trustScore
 */
export function extractPipelineScores(
  stats: Record<string, unknown>,
  lineage: Record<string, unknown>,
  brief?: { trustScore: number | null; qualityScore: number | null }
): PipelineScores {
  const da = (lineage.devilsAdvocate ?? stats.devilsAdvocate) as Record<string, unknown> | undefined;
  const cv = stats.citationVerifier as Record<string, unknown> | undefined;
  const critical = stats.criticalLoop as Record<string, unknown> | undefined;
  const rank = stats.rank as Record<string, unknown> | undefined;

  const scaleScore = (v: number | null | undefined): number | undefined => {
    if (v == null || !Number.isFinite(v)) return undefined;
    return v <= 1 ? Math.round(v * 100) : Math.round(v);
  };

  const trustScore =
    (typeof da?.publishabilityScore === "number" ? Math.round(da.publishabilityScore) : undefined) ??
    (typeof critical?.finalScore === "number" ? Math.round(critical.finalScore) : undefined) ??
    (typeof (lineage.editorialArbiter as Record<string, unknown> | undefined)?.confidence === "number"
      ? Math.round((lineage.editorialArbiter as { confidence: number }).confidence)
      : undefined) ??
    (typeof (stats.editorialArbiter as Record<string, unknown> | undefined)?.confidence === "number"
      ? Math.round((stats.editorialArbiter as { confidence: number }).confidence)
      : undefined) ??
    scaleScore(brief?.trustScore ?? null) ??
    70;

  const qualityScore =
    (typeof rank?.avgQuality === "number" ? Math.round(rank.avgQuality) : undefined) ??
    scaleScore(brief?.qualityScore ?? null) ??
    trustScore;

  const integrity =
    (typeof cv?.integrity === "number" ? cv.integrity : undefined) ??
    (typeof cv?.overallIntegrity === "number" ? cv.overallIntegrity : undefined);
  const citationCoverage = integrity != null ? integrity / 100 : 0;

  return { trustScore, qualityScore, citationCoverage };
}
