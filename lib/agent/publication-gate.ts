import { buildEvidenceLedger, extractCitationNumbers } from "./evidence-ledger";

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
  };
}

export const DEFAULT_PUBLICATION_GATE_THRESHOLDS: PublicationGateThresholds = {
  minTrustScore: 75,
  minQualityScore: 70,
  minCitationCoverage: 0.72,
  minSourceCount: 5,
  strategicMinSourceCount: 12,
  maxFatalChallenges: 0,
  minDevilsAdvocateScore: 70,
  maxUncitedClaimRatio: 0.35,
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
  const thresholds = { ...DEFAULT_PUBLICATION_GATE_THRESHOLDS, ...input.thresholds };
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
  const uncitedClaimRatio = evidenceLedger.claimCount > 0
    ? evidenceLedger.uncitedClaimCount / evidenceLedger.claimCount
    : 0;

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
      checkType: "claim_citation_density",
      passed: uncitedClaimRatio <= thresholds.maxUncitedClaimRatio,
      score: Math.round((1 - uncitedClaimRatio) * 100),
      details: `${evidenceLedger.uncitedClaimCount}/${evidenceLedger.claimCount} claim-like sentences uncited`,
    },
    {
      checkType: "fatal_challenges",
      passed: fatalChallenges <= thresholds.maxFatalChallenges,
      score: fatalChallenges,
      details: `${fatalChallenges} fatal challenge(s)`,
    },
  ];

  if (devilsAdvocateScore !== undefined) {
    checks.push({
      checkType: "devils_advocate",
      passed: devilsAdvocateScore >= thresholds.minDevilsAdvocateScore,
      score: devilsAdvocateScore,
      details: `${devilsAdvocateScore}/100 adversarial publishability score`,
    });
  }

  if (input.researcherDecision) {
    checks.push({
      checkType: "researcher_signoff",
      passed: input.researcherDecision === "approve",
      details: `Researcher decision: ${input.researcherDecision}`,
    });
  }

  const failedChecks = checks.filter((check) => !check.passed);
  const hardFailures = failedChecks.filter((check) =>
    ["source_depth", "fatal_challenges", "devils_advocate", "researcher_signoff"].includes(check.checkType)
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
    },
  };
}
