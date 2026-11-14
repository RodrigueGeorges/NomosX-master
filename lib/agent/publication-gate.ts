import { buildEvidenceLedger, extractCitationNumbers } from "./evidence-ledger";
import { getPublicationQualityRule, getAdaptiveMinSourceCount } from "@/lib/publication-visibility";
import { detectNovlangue } from "./novlangue-detector";
import { centralScenarioIssues, type CentralScenarioDecision } from './editorial-types';
import { parseEditorialInquiry } from '@/lib/brand/inquiry-html-parse';
import { isPositionFirstBrief } from './brief-html-extract';
import { diagnoseGateResult, type GateDiagnosis } from './gate-diagnosis';

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
  format?: "brief" | "memo" | "strategic" | "signal" | string;
  html: string;
  sourceIds: string[];
  centralScenario?: CentralScenarioDecision;
  requireCentralScenario?: boolean;
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
  /** Structured claims from READER agent (Claim table). When provided, used instead of HTML heuristics. */
  dbClaims?: Array<{ text: string; sourceRef?: number | null; evidenceCount?: number }>;
  /** P0/1: names of verdict-bearing evaluations tagged stale (attached to a
   * replaced artifact version) — the gate must not consume them. */
  staleEvaluations?: string[];
  failedEvaluations?: string[];
  /** Thesis-binding verdict (stats.thesisBinding). Present whenever a bound
   *  thesis exists — the shipped verdict must stay inside the evidence
   *  ceiling the corpus contracted upstream. An unavailable adherence check
   *  cannot certify; it fails closed like any required evaluator. */
  thesisAdherence?: {
    adhered?: boolean;
    evaluationComplete: boolean;
    reason?: string;
  };
  /** Sources scoring ≥2 on the semantic relevance screen
   *  (stats.relevanceScreen.coreCount). Undefined when screening never ran
   *  (fixed-corpus replay, classifier outage) — the check is then skipped,
   *  matching the screen's fail-open contract. */
  coreSourceCount?: number;
  /** Minimum core-evidence sources required to publish. Default 8. */
  minCoreSources?: number;
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
  /** SEVA-style typed diagnoses for every failed check — category, severity,
   *  stable code, actionable fix. Deterministic; consumed by the escalation
   *  feedback (buildFailureFeedback) and the run-regression harness. Optional:
   *  consumers building gate-like results by hand needn't fabricate it. */
  diagnoses?: GateDiagnosis[];
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
  minCitationCoverage: 0.50,
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
      : input.format === "memo"
        ? "DECISION_MEMO"
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
  // Use structured claims from READER agent when available, otherwise parse HTML
  let evidenceLedger: ReturnType<typeof buildEvidenceLedger>;
  if (input.dbClaims && input.dbClaims.length > 0) {
    const citedClaims = input.dbClaims.filter(c => c.sourceRef != null && c.sourceRef > 0);
    const allRefs = input.dbClaims
      .map(c => c.sourceRef)
      .filter((r): r is number => r != null && r > 0);
    evidenceLedger = {
      claimCount: input.dbClaims.length,
      citedClaimCount: citedClaims.length,
      uncitedClaimCount: input.dbClaims.length - citedClaims.length,
      citationCount: allRefs.length,
      uniqueCitationCount: new Set(allRefs).size,
      claims: input.dbClaims.map((c, i) => ({
        id: `db-claim-${i + 1}`,
        text: c.text,
        citations: c.sourceRef ? [c.sourceRef] : [],
        supportStatus: c.sourceRef ? "unverified" as const : "unsupported" as const,
      })),
    };
  } else {
    evidenceLedger = buildEvidenceLedger(input.html || "");
  }
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
  // Evidence-mass floor: tangential sources may pad the corpus count, but a
  // publishable note needs a minimum of semantically core sources. Only
  // enforced when the relevance screen actually produced a count.
  if (typeof input.coreSourceCount === 'number') {
    const minCore = input.minCoreSources ?? 8;
    checks.push({
      checkType: "corpus_core_evidence",
      passed: input.coreSourceCount >= minCore,
      score: input.coreSourceCount,
      details: input.coreSourceCount >= minCore
        ? `${input.coreSourceCount} core sources (≥${minCore} required)`
        : `only ${input.coreSourceCount} core sources after relevance screening — corpus is tangential-heavy (≥${minCore} required)`,
    });
  }

  checks.push({
    checkType: "novlangue_density",
    passed: novlangue.density <= NOVLANGUE_DENSITY_THRESHOLD,
    score: Math.round(novlangue.density * 10) / 10,
    details: novlangue.clean
      ? "No novlangue detected — language is precise"
      : `${novlangue.count} novlangue pattern(s) detected (${novlangue.density.toFixed(1)}/1000 words): ${novlangue.matches.slice(0, 3).map((m) => `"${m.term}" → ${m.trueName}`).join("; ")}${novlangue.count > 3 ? "..." : ""}`,
  });

  if (input.requireCentralScenario || input.centralScenario || isPositionFirstBrief(input.html)) {
    const issues = centralScenarioIssues(input.centralScenario, sourceCount);
    const rendered = parseEditorialInquiry(input.html)?.centralScenario;
    const blocks = input.html.match(/<section\b[^>]*class="nx-block central-scenario"[^>]*>[\s\S]*?<\/section>/gi) ?? [];
    if (blocks.length !== 1 || !rendered?.name || !rendered.description || !rendered.rationale
      || !rendered.horizon || !rendered.confidence || !rendered.implications.length || !rendered.revisionTriggers.length) {
      issues.push('Final HTML must contain exactly one complete central scenario');
    }
    if (rendered && input.centralScenario) {
      // Citation <sup> markup sits between a word and its punctuation in the
      // rendered HTML; stripping it leaves "word ." while the decision keeps
      // "word." — collapse space-before-punctuation and unify typographic
      // quotes so evidence-cited rationales don't self-fail the equality check
      // (observed live: every field mismatched purely on citation-removal
      // whitespace, a guaranteed central_scenario hold on position-first briefs).
      const normalize = (text: string) => text
        // Evidence markers render as [E41] (no dash) while source refs use
        // [SRC-41] (dash) — strip BOTH forms.
        .replace(/\[(?:SRC-?|E-?)\d+\]/g, '')
        .replace(/[\u2018\u2019\u02BC]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+([.,;:!?])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
      const decision = input.centralScenario;
      const pairs = [
        [rendered.name, decision.name], [rendered.description, decision.description],
        [rendered.rationale, decision.rationale], [rendered.horizon, decision.horizon],
        [rendered.implications.join(' '), decision.implications.join(' ')],
        [rendered.revisionTriggers.join(' '), decision.revisionTriggers.join(' ')],
      ];
      if (pairs.some(([actual, expected]) => normalize(actual) !== normalize(expected))) {
        issues.push('Rendered central scenario differs from the persisted decision');
      }
    }
    const rationale = blocks[0]?.match(/<div class="central-rationale"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
    const refs = extractCitationNumbers(rationale);
    if (!refs.length || refs.some(n => n < 1 || n > sourceCount)) issues.push('Central rationale lost its evidence references during rendering');
    checks.push({ checkType: 'central_scenario', passed: issues.length === 0, details: issues.join('; ') || 'Central scenario complete and consistent with final HTML' });
  }

  // P0/1: Evaluation freshness — a verdict-bearing evaluation (critic,
  // criticPanel, devilsAdvocate) attached to a replaced artifact version is
  // invalid: the gate must not consume a verdict that describes other content.
  const staleEvals = input.staleEvaluations ?? [];
  checks.push({
    checkType: "evaluation_freshness",
    passed: staleEvals.length === 0,
    details: staleEvals.length === 0
      ? "All verdict evaluations match the current artifact version"
      : `Stale verdict evaluation(s) attached to a replaced artifact: ${staleEvals.join(", ")}`,
  });

  if (input.failedEvaluations?.length) checks.push({
    checkType: 'evaluation_availability', passed: false,
    details: `Incomplete required evaluations: ${input.failedEvaluations.join(', ')}`,
  });

  // Thesis binding — the verdict was contracted FROM the corpus upstream.
  // A verdict that exceeds it is speculation-as-thesis: hard failure, routed
  // to substance repair/regeneration, never advisory (S39b forensic).
  if (input.thesisAdherence) {
    const ta = input.thesisAdherence;
    checks.push({
      checkType: 'thesis_adherence',
      passed: ta.evaluationComplete === true && ta.adhered === true,
      details: ta.evaluationComplete !== true
        ? 'Adherence evaluation incomplete — verdict not certified against the bound thesis'
        : ta.adhered === true
          ? 'Verdict within the bound thesis'
          : `Verdict exceeds the evidence-bound thesis — ${ta.reason ?? 'overclaims relative to corpus support'}`,
    });
  }
  const failedChecks = checks.filter((check) => !check.passed);
  // quality_score is advisory when trust_score passes AND quality ≥ 40 — don't treat as hard failure
  // But quality < 40 is always a hard failure (prevents publishing garbage with good trust)
  const hardFailures = failedChecks.filter((check) =>
    ["source_depth", "trust_score", "word_count", "researcher_signoff", "citation_coverage", "central_scenario", "evaluation_freshness", "evaluation_availability", "thesis_adherence", "corpus_core_evidence"].includes(check.checkType)
    || (check.checkType === "quality_score" && typeof check.score === "number" && check.score < 40)
  );
  const decision: PublicationGateDecision = failedChecks.length === 0
    ? "publish"
    : hardFailures.length > 0
      ? "hold"
      : "revise";

  return {
    decision,
    checks,
    diagnoses: diagnoseGateResult(checks),
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
