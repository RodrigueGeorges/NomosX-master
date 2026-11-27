import { buildEvidenceLedger, extractCitationNumbers } from "./evidence-ledger";
import { getPublicationQualityRule, getAdaptiveMinSourceCount } from "@/lib/publication-visibility";
import { detectNovlangue } from "./novlangue-detector";
import { centralScenarioIssues, type CentralScenarioDecision } from './editorial-types';
import { parseEditorialInquiry } from '@/lib/brand/inquiry-html-parse';
import { isPositionFirstBrief } from './brief-html-extract';
import { diagnoseGateResult, type GateDiagnosis } from './gate-diagnosis';
import { extractHorizonDate } from './question-verifiers';

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
  /** Lot 1 question_substituted: a corpus-derived thesis that answers a
   *  materially different question than the one asked. Hard fail — the
   *  note's probability would certify the wrong claim (v10 failure mode). */
  questionSubstitution?: {
    substituted: boolean;
    reason?: string;
  };
  /** MiniCheck verdicts on the PUBLISHED claims (stats.minicheckPublished).
   *  Present only when NOMOSX_MINICHECK=1 ran the post-render pass.
   *  `unavailable` fails closed — an enabled verifier that cannot answer
   *  cannot certify the artifact. */
  minicheckPublished?: {
    checked?: number;
    not_supported?: number;
    unclear?: number;
    unsupportedRatio?: number;
    unavailable?: boolean;
    maxUnsupportedRatio?: number;
  };
  /** P0-C: real primary-data series fetched by the quant core
   *  (stats.quant.series). Required ≥1 when the run carries a verified
   *  forecastQuestion — a forecast note without a real cited series is
   *  unverifiable. Undefined count = quant never ran → check skipped
   *  (fail-open, matching conditional-check contract). */
  quantSeriesCount?: number;
  requiresQuantSeries?: boolean;
  /** Claude §1.5: statistical numbers still unsourced after the final
   *  deterministic sanitize pass (stats.numericalGate.violations).
   *  Published notes must carry 0 — hard fail when > 0. Undefined when the
   *  numerical gate never ran → check skipped (fail-open). */
  unsourcedNumberCount?: number;
  /** Claude §1.6 step contracts — deterministic pre-publication checks for
   *  forecast notes. Present whenever a verified forecastQuestion reached
   *  the run; every failed contract is a hard-fail motif recorded in
   *  barrierAudit. `questionDisplayed` is renderer-marked (undefined = the
   *  marker did not run → that sub-check is skipped, fail-open). */
  forecastContract?: {
    thesisOrigin?: string;
    probability?: number;
    horizon?: string;
    /** The verified forecast question — checked for display in the shipped
     *  HTML (normalized containment of its leading 120 chars). */
    question?: string;
  };
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
  minQualityScore: 72,
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
  // Claim-citation density must measure the SHIPPED artifact, not reader-side
  // extraction: dbClaims are claims the reader found in sources — they say
  // nothing about whether the published HTML cites them (audit finding:
  // gate reported ~0% uncited while the artifact had uncited claims).
  // dbClaims remains a fallback only when no HTML is available.
  let evidenceLedger: ReturnType<typeof buildEvidenceLedger>;
  if (input.dbClaims && input.dbClaims.length > 0 && !(input.html || "").trim()) {
    // sourceRef is a 1-based index into the run's source list — a ref beyond
    // sourceCount cannot point at a real source and must not count as a
    // citation (fail-closed: out-of-range refs are treated as uncited).
    const dbSourceCount = input.sourceIds?.length || 0;
    const inRange = (r: number | null | undefined): r is number =>
      r != null && r > 0 && (dbSourceCount === 0 || r <= dbSourceCount);
    const citedClaims = input.dbClaims.filter(c => inRange(c.sourceRef));
    const allRefs = input.dbClaims
      .map(c => c.sourceRef)
      .filter(inRange);
    evidenceLedger = {
      claimCount: input.dbClaims.length,
      citedClaimCount: citedClaims.length,
      uncitedClaimCount: input.dbClaims.length - citedClaims.length,
      citationCount: allRefs.length,
      uniqueCitationCount: new Set(allRefs).size,
      claims: input.dbClaims.map((c, i) => ({
        id: `db-claim-${i + 1}`,
        text: c.text,
        citations: inRange(c.sourceRef) ? [c.sourceRef] : [],
        supportStatus: inRange(c.sourceRef) ? "unverified" as const : "unsupported" as const,
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
  // Missing quality must NOT inherit trustScore — that was fail-open: a caller
  // omitting qualityScore got a free pass at trust level (audit finding).
  // Unavailable quality fails the check closed.
  const qualityAvailable = Number.isFinite(input.qualityScore);
  const qualityScore = qualityAvailable ? clampScore(input.qualityScore, 0) : 0;
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
      passed: qualityAvailable && qualityScore >= thresholds.minQualityScore,
      score: qualityScore,
      details: qualityAvailable
        ? `${qualityScore}/100 quality score`
        : `quality score unavailable (fail-closed)`,
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

  // MiniCheck published-claim verification (P0-4): only present when the
  // post-render pass ran (NOMOSX_MINICHECK=1). Fails closed on verifier
  // unavailability or when the unsupported ratio exceeds the recorded cap.
  if (input.minicheckPublished) {
    const mc = input.minicheckPublished;
    const maxRatio = mc.maxUnsupportedRatio ?? 0.4;
    const ratio = mc.unsupportedRatio ?? (mc.checked ? (mc.not_supported ?? 0) / mc.checked : 1);
    const unavailable = mc.unavailable === true || (mc.checked ?? 0) === 0;
    checks.push({
      checkType: "minicheck_support",
      passed: !unavailable && ratio <= maxRatio,
      score: Math.round((1 - ratio) * 100),
      details: unavailable
        ? "MiniCheck enabled but unavailable — published claims unverified (fail-closed)"
        : `${mc.checked} published claims checked — ${Math.round(ratio * 100)}% not_supported (max ${Math.round(maxRatio * 100)}%)`,
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
        // HTML entities survive esc() into the rendered block (&#039;, &amp;,
        // &quot;) while the persisted decision keeps raw characters — decode
        // before comparing or every apostrophe self-fails the equality check.
        .replace(/&(?:#0?39|apos);/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        // Evidence markers render as [E41] (no dash) while source refs use
        // [SRC-41] (dash) — strip BOTH forms, including bracket-comma
        // multi-citations "[SRC-7, SRC-19]" the persisted decision keeps raw.
        .replace(/\[(?:SRC-?|E-?)\d+(?:\s*,\s*(?:SRC-?|E-?)\d+)*\]/g, '')
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
    // Evidence refs live in the scenario narrative (.central-description);
    // .central-rationale is swarm-election provenance (p-values, draw counts)
    // and carries no citations by design. Scanning only the rationale made
    // every swarm-elected scenario fail this check by construction.
    // extractCitationNumbers normalizes rendered <sup class="cite"> links
    // itself — pass the raw block, not tag-stripped text.
    const refs = extractCitationNumbers(blocks[0] ?? '');
    if (!refs.length || refs.some(n => n < 1 || n > sourceCount)) issues.push('Central scenario block lost its evidence references during rendering');
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
  // Question substitution — only evaluated upstream for corpus-derived
  // theses; absent input means the check did not run (registered thesis or
  // no resolvable spec) and is skipped, matching the fail-open contract of
  // the other conditional checks.
  if (input.questionSubstitution) {
    checks.push({
      checkType: 'question_answered',
      passed: input.questionSubstitution.substituted !== true,
      details: input.questionSubstitution.substituted === true
        ? `question_substituted: ${input.questionSubstitution.reason ?? 'thesis answers a different question than asked'}`
        : 'thesis answers the operationalized question',
    });
  }
  // P0-C quantitative core: a forecast note must rest on ≥1 REAL fetched
  // series (DBnomics/FRED/Eurostat/World Bank…), not abstract-only numbers.
  // Only enforced when the run carries a verified forecastQuestion —
  // qualitative non-dispatch runs keep the fail-open contract.
  if (input.requiresQuantSeries === true && typeof input.quantSeriesCount === 'number') {
    checks.push({
      checkType: 'quant_series',
      passed: input.quantSeriesCount >= 1,
      details: input.quantSeriesCount >= 1
        ? `${input.quantSeriesCount} real primary-data series fetched (quant core)`
        : 'no real data series fetched — numeric claims would rest on abstracts alone',
    });
  }
  // Claude §1.5: published notes carry ZERO unsourced statistical numbers.
  // The deterministic sanitizer ran at the last mutation point; whatever
  // remains is a defect no rewrite-on-same-corpus can be trusted to fix.
  if (typeof input.unsourcedNumberCount === 'number') {
    checks.push({
      checkType: 'unsourced_numbers',
      passed: input.unsourcedNumberCount === 0,
      details: input.unsourcedNumberCount === 0
        ? 'all statistical numbers sourced or sanitized'
        : `${input.unsourcedNumberCount} unsourced statistical number(s) remain in the published artifact`,
    });
  }
  // Claude §1.6 — forecast step contracts. A contract failure is a hold
  // with a named motif, never a publication: the note must BE the forecast
  // (origin 'forecast' + probability), the horizon must be a parseable
  // future date within 5 years, p stays inside [0.10, 0.90], the published
  // length respects the 3 500-word cap, and the asked question is displayed.
  if (input.forecastContract) {
    const fc = input.forecastContract;
    const motifs: string[] = [];
    if (fc.thesisOrigin !== 'forecast') motifs.push('thesis_origin_not_forecast');
    if (typeof fc.probability !== 'number' || !Number.isFinite(fc.probability)) {
      motifs.push('probability_missing');
    } else if (fc.probability < 0.1 || fc.probability > 0.9) {
      motifs.push(`probability_out_of_band:${fc.probability.toFixed(2)}`);
    }
    const horizonDate = fc.horizon ? extractHorizonDate(fc.horizon) : null;
    if (!horizonDate) {
      motifs.push('horizon_unparseable');
    } else {
      const horizonMs = horizonDate.getTime();
      const nowMs = Date.now();
      if (horizonMs < nowMs + 30 * 86400000) motifs.push('horizon_not_future');
      else if (horizonMs > nowMs + 5 * 366 * 86400000) motifs.push('horizon_beyond_5y');
    }
    if (wordCount > 3500) motifs.push(`word_cap_exceeded:${wordCount}`);
    if (fc.question) {
      const norm = (s: string) => s.toLowerCase().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const needle = norm(fc.question).slice(0, 120);
      if (needle && !norm(input.html || '').includes(needle)) motifs.push('question_not_displayed');
    }
    checks.push({
      checkType: 'forecast_contract',
      passed: motifs.length === 0,
      score: motifs.length,
      details: motifs.length === 0
        ? 'forecast contracts satisfied (origin/probability/horizon/cap/question)'
        : `forecast contract violations: ${motifs.join(', ')}`,
    });
  }
  const failedChecks = checks.filter((check) => !check.passed);
  // quality_score is advisory when trust_score passes AND quality ≥ 40 — don't treat as hard failure
  // But quality < 40 is always a hard failure (prevents publishing garbage with good trust)
  const hardFailures = failedChecks.filter((check) =>
    ["source_depth", "trust_score", "word_count", "researcher_signoff", "citation_coverage", "central_scenario", "evaluation_freshness", "evaluation_availability", "thesis_adherence", "corpus_core_evidence", "question_answered", "quant_series", "unsourced_numbers", "forecast_contract"].includes(check.checkType)
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
