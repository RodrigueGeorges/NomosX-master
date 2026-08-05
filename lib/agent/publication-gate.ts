import { buildEvidenceLedger, extractCitationNumbers } from "./evidence-ledger";
import { getPublicationQualityRule, getAdaptiveMinSourceCount } from "@/lib/publication-visibility";
import { detectNovlangue } from "./novlangue-detector";

export type PublicationGateDecision = "publish" | "revise" | "hold";

export interface PublicationGateThresholds {
  minTrustScore: number;
  minQualityScore: number;
  minCitationCoverage: number;
  minSourceCount: number;
  strategicMinSourceCount: number;
  maxFatalChallenges: number;
  minDevilsAdvocateScore: number;
  maxUncitedClaimRatio: number;
}

export interface PublicationGateInput {
  format?: "brief" | "strategic" | "signal" | string;
  html: string;
  sourceIds: string[];
  trustScore?: number;
  qualityScore?: number;
  citationCoverage?: number;
  devilsAdvocateScore?: number;
  fatalChallenges?: number;
  researcherDecision?: string;
  thresholds?: Partial<PublicationGateThresholds>;
  /** P3.7: If triangular judge overrode DA verdict, skip fatal_challenges hard gate */
  triangularOverride?: boolean;
  /** Domain for adaptive source count threshold */
  domain?: string | null;
}

export interface PublicationGateCheck {
  checkType: string;
  passed: boolean;
  score?: number;
  details: string;
}

export interface PublicationGateResult {
  decision: PublicationGateDecision;
  checks: PublicationGateCheck[];
  reasons: string[];
  warnings: string[];
  metrics: {
    sourceCount: number;
    trustScore: number;
    qualityScore: number;
    citationCoverage: number;
    citationCount: number;
    uniqueCitationCount: number;
    claimCount: number;
    citedClaimCount: number;
    uncitedClaimRatio: number;
    novlangueCount: number;
    novlangueDensity: number;
  };
}

export const DEFAULT_PUBLICATION_GATE_THRESHOLDS: PublicationGateThresholds = {
  minTrustScore: 65,
  minQualityScore: 70,
  minCitationCoverage: 0.60,
  minSourceCount: 5,
  strategicMinSourceCount: 12,
  maxFatalChallenges: 1,
  minDevilsAdvocateScore: 40,
  maxUncitedClaimRatio: 0.30,
};

function clampScore(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value as number)));
}

function normalizeCoverage(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const numeric = value as number;
  return numeric > 1 ? Math.max(0, Math.min(1, numeric / 100)) : Math.max(0, Math.min(1, numeric));
}

export function evaluatePublicationGate(input: PublicationGateInput): PublicationGateResult {
  const formatType = input.format === "strategic"
    ? "STRATEGIC_REPORT"
    : input.format === "signal"
      ? "SUMMARY_BRIEF"
      : input.format === "brief"
        ? "ARTICLE"
        : input.format;
  const businessRule = getPublicationQualityRule(formatType);
  // Adaptive source count: adjusts based on domain and available evidence
  const adaptiveMinSources = getAdaptiveMinSourceCount(
    formatType || 'ARTICLE',
    input.domain,
    input.sourceIds?.length,
  );
  const thresholds = {
    ...DEFAULT_PUBLICATION_GATE_THRESHOLDS,
    minTrustScore: businessRule.minTrustScore,
    minQualityScore: businessRule.minQualityScore,
    minCitationCoverage: businessRule.minCitationCoverage,
    minSourceCount: adaptiveMinSources,
    strategicMinSourceCount: adaptiveMinSources,
    ...input.thresholds,
  };
  const evidenceLedger = buildEvidenceLedger(input.html || "");
  const allCitationNumbers = extractCitationNumbers(input.html || "");
  const sourceCount = input.sourceIds?.length || 0;
  const derivedCoverage = sourceCount > 0
    ? Math.min(1, allCitationNumbers.filter((n) => n <= sourceCount).length / Math.max(1, sourceCount))
    : 0;

  const trustScore = clampScore(input.trustScore, 0);
  const qualityScore = clampScore(input.qualityScore, trustScore);
  const citationCoverage = normalizeCoverage(input.citationCoverage, derivedCoverage);
  const devilsAdvocateScore = input.devilsAdvocateScore === undefined
    ? undefined
    : clampScore(input.devilsAdvocateScore, 0);
  const fatalChallenges = Math.max(0, input.fatalChallenges || 0);
  const minSources = input.format === "strategic"
    ? thresholds.strategicMinSourceCount
    : thresholds.minSourceCount;
  const wordCount = countWords(input.html || "");
  const uncitedClaimRatio = evidenceLedger.claimCount > 0
    ? evidenceLedger.uncitedClaimCount / evidenceLedger.claimCount
    : 0;

  // Adaptive word count: relax when evidence is scarce (matching evaluatePublicationReadiness)
  const adaptiveMinWordCount = sourceCount < 10
    ? Math.round(businessRule.minWordCount * 0.5)
    : sourceCount < 15
      ? Math.round(businessRule.minWordCount * 0.75)
      : businessRule.minWordCount;

  const checks: PublicationGateCheck[] = [
    {
      checkType: "source_depth",
      passed: sourceCount >= minSources,
      score: sourceCount,
      details: `${sourceCount}/${minSources} sources minimum`,
    },
    {
      checkType: "trust_score",
      passed: trustScore >= thresholds.minTrustScore,
      score: trustScore,
      details: `${trustScore}/100 trust score`,
    },
    {
      checkType: "quality_score",
      passed: qualityScore >= thresholds.minQualityScore,
      score: qualityScore,
      details: `${qualityScore}/100 quality score`,
    },
    {
      checkType: "citation_coverage",
      passed: citationCoverage >= thresholds.minCitationCoverage,
      score: Math.round(citationCoverage * 100),
      details: `${Math.round(citationCoverage * 100)}% citation coverage`,
    },
    {
      checkType: "word_count",
      passed: wordCount >= adaptiveMinWordCount,
      score: wordCount,
      details: `${wordCount}/${adaptiveMinWordCount} words minimum (adaptive: ${sourceCount} sources)`,
    },
    {
      checkType: "claim_citation_density",
      passed: uncitedClaimRatio <= thresholds.maxUncitedClaimRatio,
      score: Math.round((1 - uncitedClaimRatio) * 100),
      details: `${evidenceLedger.uncitedClaimCount}/${evidenceLedger.claimCount} claim-like sentences uncited`,
    },
    {
      checkType: "fatal_challenges",
      passed: input.triangularOverride || fatalChallenges <= thresholds.maxFatalChallenges,
      score: fatalChallenges,
      details: input.triangularOverride
        ? `${fatalChallenges} fatal challenge(s) — triangular judge override active`
        : `${fatalChallenges} fatal challenge(s)`,
    },
  ];

  if (devilsAdvocateScore !== undefined) {
    checks.push({
      checkType: "devils_advocate",
      passed: input.triangularOverride || devilsAdvocateScore >= thresholds.minDevilsAdvocateScore,
      score: devilsAdvocateScore,
      details: input.triangularOverride
        ? `${devilsAdvocateScore}/100 — triangular judge override active`
        : `${devilsAdvocateScore}/100 adversarial publishability score`,
    });
  }

  if (input.researcherDecision) {
    checks.push({
      checkType: "researcher_signoff",
      passed: input.researcherDecision === "approve",
      details: `Researcher decision: ${input.researcherDecision}`,
    });
  }

  // Pillar 6: Novlangue detection — deterministic euphemism scanner.
  // Not a hard failure (blocking publication = censorship), but high density
  // triggers "revise" so the critical loop can rewrite with precise language.
  const novlangue = detectNovlangue(input.html || "");
  const NOVLANGUE_DENSITY_THRESHOLD = 2.0; // matches per 1000 words
  checks.push({
    checkType: "novlangue_density",
    passed: novlangue.density <= NOVLANGUE_DENSITY_THRESHOLD,
    score: Math.round(novlangue.density * 10) / 10,
    details: novlangue.clean
      ? "No novlangue detected — language is precise"
      : `${novlangue.count} novlangue pattern(s) detected (${novlangue.density.toFixed(1)}/1000 words): ${novlangue.matches.slice(0, 3).map((m) => `"${m.term}" → ${m.trueName}`).join("; ")}${novlangue.count > 3 ? "..." : ""}`,
  });

  const failedChecks = checks.filter((check) => !check.passed);
  const hardFailures = failedChecks.filter((check) =>
    ["source_depth", "trust_score", "word_count", "researcher_signoff", "citation_coverage"].includes(check.checkType)
  );
  const decision: PublicationGateDecision = failedChecks.length === 0
    ? "publish"
    : hardFailures.length > 0
      ? "hold"
      : "revise";

  return {
    decision,
    checks,
    reasons: failedChecks.map((check) => `${check.checkType}: ${check.details}`),
    warnings: checks
      .filter((check) => check.passed && typeof check.score === "number" && check.score < 80)
      .map((check) => `${check.checkType}: ${check.details}`),
    metrics: {
      sourceCount,
      trustScore,
      qualityScore,
      citationCoverage,
      citationCount: evidenceLedger.citationCount,
      uniqueCitationCount: evidenceLedger.uniqueCitationCount,
      claimCount: evidenceLedger.claimCount,
      citedClaimCount: evidenceLedger.citedClaimCount,
      uncitedClaimRatio,
      novlangueCount: novlangue.count,
      novlangueDensity: Math.round(novlangue.density * 10) / 10,
    },
  };
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").filter(Boolean).length : 0;
}
