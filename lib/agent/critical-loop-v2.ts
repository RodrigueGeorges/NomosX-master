/**
 * NomosX Critical Loop V2 — Iterative Self-Correction
 * 
 * Unlike V1 which only SCORES a draft, V2 actually REWRITES it.
 * 
 * Flow:
 * 1. Run 3 parallel critics (Methodology Judge, Adversarial Reviewer, Decision Calibrator)
 * 2. If composite score < threshold → REWRITE the draft using critic feedback
 * 3. Re-run critics on rewritten draft
 * 4. Max 2 iterations (draft → critique → rewrite → re-critique)
 * 5. Return best version with full audit trail
 * 
 * This mimics academic peer review:
 * - Reviewer 1 (methodology), Reviewer 2 (adversarial), Reviewer 3 (calibration)
 * - Author revises based on feedback
 * - Second round of review
 */

import { callLLM } from '../llm/unified-llm';
import type { LLMFamily } from '../llm/unified-llm';
import { detectNovlangue } from './novlangue-detector';
import { parseJson } from './json-utils';
import { partitionEvidence } from './evidence-partition';
import { aggregateIndependentScores } from './confidence-aggregation';
import Sentry from '@sentry/nextjs';
import { loadCalibratedThresholds } from './orchestrator';
import {
  CriticalLoopResult,
  MethodologyJudgment,
  AdversarialReview,
  CalibrationAssessment,
} from '@/lib/think-tank/types';

// ============================================================================
// TYPES
// ============================================================================

interface CriticalLoopV2Input {
  draftHtml: string;
  sources: any[];
  readings?: any[];
  maxIterations?: number;
  publishThreshold?: number;
  producerFamily?: LLMFamily;
  extraContext?: string;
  /** InfoDelphi (arXiv 2607.01661): partition the corpus into shared + private
   *  slices so each critic holds exclusive evidence — decorrelates panel
   *  errors instead of herding on identical input. Default: on for ≥8
   *  sources, auto-degenerates below that. */
  privateEvidence?: boolean;
}

interface CriticalLoopV2Result extends CriticalLoopResult {
  iterations: number;
  iterationHistory: Array<{
    iteration: number;
    compositeScore: number;
    methodology: number;
    adversarial: number;
    calibration: number;
    rewrote: boolean;
  }>;
  finalHtml: string;
  improvementDelta: number;
  totalCostUsd: number;
  /** Audit trail of the confidence-weighted aggregation per iteration. */
  aggregation?: { iteration: number; weights: number[]; dispersion: number; confWeighted: boolean }[];
}

// ============================================================================
// CRITICS
// ============================================================================

async function methodologyJudge(
  sources: any[],
  readings?: any[],
  draftHtml?: string,
): Promise<MethodologyJudgment & { costUsd: number; confidence?: number }> {
  const sourceContext = sources.map((s, i) => {
    const reading = readings?.[i];
    // _srcIndex carries the original [SRC-N] number when the critic sees an
    // information-asymmetric subset (privateEvidence) — citations must still
    // resolve against the draft's numbering.
    const srcN = s._srcIndex ?? i + 1;
    return `[SRC-${srcN}] ${s.title}
Provider: ${s.provider} | Year: ${s.year || "N/A"} | Quality: ${s.qualityScore || 0}/100 | Citations: ${s.citationCount || 0}
Methods: ${reading?.methods?.join("; ") || "Not extracted"}
Limitations: ${reading?.limitations?.join("; ") || "Not stated"}`;
  }).join("\n\n");

  const draftExcerpt = draftHtml
    ? draftHtml.length > 24000
      ? draftHtml.slice(0, 12000) + '\n\n[...MIDDLE SECTION OMITTED...]\n\n' + draftHtml.slice(-12000)
      : draftHtml
    : '';

  const response = await callLLM({
    messages: [{
      role: "user",
      content: `You are a senior methodology expert at a top-tier think tank (RAND, Brookings, Bruegel). You review BOTH the draft analysis AND its underlying sources.

DRAFT ANALYSIS:
${draftExcerpt || '[No draft provided — evaluate sources only]'}

SOURCES (${sources.length}):
${sourceContext}

Evaluate the methodology of the ANALYSIS (how well it uses sources, not just source quality):
1. Evidence Utilization: How well does the draft leverage available sources? Are key sources cited?
2. Analytical Rigor: Does the analysis build logical chains from evidence to conclusions?
3. Source Diversity: Are claims supported by multiple independent sources or single-source?
4. Triangulation: Does the analysis cross-reference findings across sources?
5. Limitation Acknowledgment: Does the draft acknowledge methodological limitations of its sources?

Also evaluate source quality:
6. Study Design: RCT > quasi-experimental > observational > case study > theoretical
7. Bias Risk: Conflicts of interest, selection bias (higher = less bias)

Return JSON:
{
  "overallScore": 0-100,
  "breakdown": {
    "studyDesign": 0-100,
    "sampleSize": 0-100,
    "statisticalRigor": 0-100,
    "replicability": 0-100,
    "biasRisk": 0-100
  },
  "concerns": ["specific methodological concern with [SRC-N] reference"],
  "recommendations": ["specific actionable fix for the draft"],
  "confidence": 0-100 (your calibrated confidence in THIS verdict — how sure are you your score is right, given the evidence you were shown?),
  "passThreshold": true/false (score >= 60)
}`
    }],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 4000,
    task: 'fact_check',
    enableCache: true,
  });

  let result: any;
  result = parseJson<any>(response.content);
  if (!result) {
    console.warn('[CriticalLoop V2] methodologyJudge JSON parse failed, using defaults');
    result = { overallScore: 50, breakdown: { studyDesign: 50, sampleSize: 50, statisticalRigor: 50, replicability: 50, biasRisk: 50 }, concerns: [], recommendations: [] };
  }
  return {
    overallScore: result.overallScore || 50,
    breakdown: result.breakdown || { studyDesign: 50, sampleSize: 50, statisticalRigor: 50, replicability: 50, biasRisk: 50 },
    concerns: result.concerns || [],
    recommendations: result.recommendations || [],
    confidence: typeof result.confidence === 'number' ? Math.min(100, Math.max(0, result.confidence)) : undefined,
    passThreshold: (result.overallScore || 50) >= 60,
    costUsd: response.costUsd,
  };
}

async function adversarialReviewer(
  draftHtml: string,
  sources: any[],
  extraContext?: string,
  privateEvidence?: string,
): Promise<AdversarialReview & { costUsd: number; confidence?: number }> {
  const contextBlock = extraContext
    ? `\n\nCROSS-AGENT FINDINGS (from upstream agents — use to focus your review):\n${extraContext}\n`
    : '';
  // InfoDelphi: this critic alone saw these sources — it is the only reviewer
  // positioned to challenge the draft on this evidence.
  const privateBlock = privateEvidence
    ? `\n\nPRIVATE EVIDENCE (exclusive to your review — no other critic saw these sources; your unique job is to check whether the draft survives them):\n${privateEvidence}\n`
    : '';
  const response = await callLLM({
    messages: [{
      role: "user",
      content: `You are a senior adversarial reviewer at a top think tank. Your role is balanced: identify counter-arguments AND acknowledge analytical strengths. Be rigorous but fair.

DRAFT (full text):
${draftHtml.length > 24000 ? draftHtml.slice(0, 12000) + '\n\n[...MIDDLE SECTION OMITTED FOR BREVITY...]\n\n' + draftHtml.slice(-12000) : draftHtml}

NUMBER OF SOURCES: ${sources.length}${contextBlock}${privateBlock}

Evaluate the analysis on:
1. Counter-arguments: Find the strongest counter-arguments to major claims
2. Evidence support: Are claims well-supported by cited sources?
3. Analytical balance: Does the analysis acknowledge uncertainty and alternative explanations?
4. Blind spots: What perspectives or evidence are missing?
5. Steel man: Provide the strongest version of the opposing view
6. Strengths: What does the analysis do well? (acknowledge solid reasoning, good evidence use)

Score interpretation:
- 90-100: Analysis is bulletproof — counter-arguments are weak, evidence is strong, balanced
- 70-89: Analysis is strong — minor counter-arguments but well-handled
- 55-69: Analysis is adequate — some counter-arguments need addressing
- Below 55: Analysis has significant gaps

Return JSON:
{
  "overallScore": 0-100,
  "counterArguments": [
    {
      "targetClaim": "the claim being challenged",
      "counterArgument": "the strongest counter",
      "strength": "strong|moderate|weak",
      "sourceSupport": ["SRC-N if counter has evidence"],
      "fixSuggestion": "how to address this in the draft"
    }
  ],
  "blindSpots": ["perspectives not considered"],
  "steelManVersion": "strongest version of opposing view",
  "recommendations": ["specific rewrite instructions"],
  "confidence": 0-100 (your calibrated confidence in THIS verdict — how sure are you your score is right, given the evidence you were shown?),
  "passThreshold": true/false (score >= 55)
}`
    }],
    temperature: 0.3,
    jsonMode: true,
    maxTokens: 4000,
    enableCache: true,
    task: 'elenchus',
  });

  let result: any;
  result = parseJson<any>(response.content);
  if (!result) {
    console.warn('[CriticalLoop V2] adversarialReviewer JSON parse failed, using defaults');
    result = { overallScore: 60, counterArguments: [], blindSpots: [], steelManVersion: '', recommendations: [] };
  }
  return {
    overallScore: result.overallScore || 60,
    counterArguments: result.counterArguments || [],
    blindSpots: result.blindSpots || [],
    steelManVersion: result.steelManVersion || "",
    recommendations: result.recommendations || [],
    confidence: typeof result.confidence === 'number' ? Math.min(100, Math.max(0, result.confidence)) : undefined,
    passThreshold: (result.overallScore || 60) >= 55,
    costUsd: response.costUsd,
  };
}

async function decisionCalibrator(
  draftHtml: string
): Promise<CalibrationAssessment & { costUsd: number; confidence?: number }> {
  const response = await callLLM({
    messages: [{
      role: "user",
      content: `You are a calibration expert. Assess whether confidence levels in this analysis are well-calibrated.

DRAFT (full text):
${draftHtml.length > 24000 ? draftHtml.slice(0, 12000) + '\n\n[...MIDDLE SECTION OMITTED FOR BREVITY...]\n\n' + draftHtml.slice(-12000) : draftHtml}

CALIBRATION RULES:
- Single source claim: max 60% confidence
- 2-3 sources agreeing: max 75% confidence
- 4+ sources agreeing: max 85% confidence
- Meta-analysis: max 90% confidence
- Never 100% for empirical claims

For each major claim, assess stated vs calibrated confidence.

Return JSON:
{
  "overallScore": 0-100,
  "claimAssessments": [
    {
      "claim": "the claim text",
      "statedConfidence": 0-100,
      "calibratedConfidence": 0-100,
      "gap": -100 to 100,
      "reasoning": "why",
      "fixSuggestion": "how to fix hedging"
    }
  ],
  "uncertaintyQuantification": {
    "adequate": true/false,
    "missing": ["what uncertainty is not addressed"],
    "recommendations": ["specific rewrite instructions"]
  },
  "hedgingQuality": {
    "score": 0-100,
    "overHedged": ["claims too cautious"],
    "underHedged": ["claims needing more caution"]
  },
  "confidence": 0-100 (your calibrated confidence in THIS verdict — how sure are you your score is right?),
  "passThreshold": true/false (score >= 50)
}`
    }],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 4000,
    enableCache: true,
    task: 'fact_check',
  });

  let result: any;
  result = parseJson<any>(response.content);
  if (!result) {
    console.warn('[CriticalLoop V2] decisionCalibrator JSON parse failed, using defaults');
    result = { overallScore: 60, claimAssessments: [], uncertaintyQuantification: { adequate: true, missing: [], recommendations: [] }, hedgingQuality: { score: 60, overHedged: [], underHedged: [] } };
  }
  return {
    overallScore: result.overallScore || 60,
    claimAssessments: result.claimAssessments || [],
    uncertaintyQuantification: result.uncertaintyQuantification || { adequate: true, missing: [], recommendations: [] },
    hedgingQuality: result.hedgingQuality || { score: 60, overHedged: [], underHedged: [] },
    confidence: typeof result.confidence === 'number' ? Math.min(100, Math.max(0, result.confidence)) : undefined,
    passThreshold: (result.overallScore || 60) >= 50,
    costUsd: response.costUsd,
  };
}

// ============================================================================
// REWRITER — The key V2 addition
// ============================================================================

async function rewriteDraft(
  draftHtml: string,
  methodology: MethodologyJudgment,
  adversarial: AdversarialReview,
  calibration: CalibrationAssessment,
  sources: any[],
  producerFamily?: LLMFamily
): Promise<{ html: string; costUsd: number }> {
  console.log(`[CriticalLoop V2] Rewriting draft based on critic feedback...`);

  // Build structured feedback
  const methodologyFeedback = methodology.concerns.length > 0
    ? `METHODOLOGY CONCERNS:\n${methodology.concerns.map((c, i) => `${i + 1}. ${c}`).join("\n")}\nFIXES:\n${methodology.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
    : "No methodology concerns.";

  const adversarialFeedback = adversarial.counterArguments?.length > 0
    ? `COUNTER-ARGUMENTS TO ADDRESS:\n${adversarial.counterArguments.map((ca: any, i: number) => `${i + 1}. CLAIM: "${ca.targetClaim}"\n   COUNTER: ${ca.counterArgument} (${ca.strength})\n   FIX: ${ca.fixSuggestion || "Address this counter-argument"}`).join("\n\n")}\n\nBLIND SPOTS: ${adversarial.blindSpots?.join("; ") || "None"}\nSTEEL MAN: ${adversarial.steelManVersion || "N/A"}`
    : "No counter-arguments found.";

  const calibrationFeedback = calibration.claimAssessments?.length > 0
    ? `CALIBRATION ISSUES:\n${calibration.claimAssessments.filter((ca: any) => Math.abs(ca.gap) > 15).map((ca: any, i: number) => `${i + 1}. "${ca.claim}"\n   Stated: ${ca.statedConfidence}% → Should be: ${ca.calibratedConfidence}% (gap: ${ca.gap > 0 ? '+' : ''}${ca.gap})\n   FIX: ${ca.fixSuggestion || "Adjust hedging language"}`).join("\n\n")}\n\nUNDER-HEDGED: ${calibration.hedgingQuality?.underHedged?.join("; ") || "None"}\nOVER-HEDGED: ${calibration.hedgingQuality?.overHedged?.join("; ") || "None"}`
    : "Calibration is adequate.";

  // Pillar 6: Novlangue detection — feed euphemism matches to the rewriter
  // so it can replace them with their true names. This is not just a flag;
  // the agent receives the detected term + its true meaning and reinterprets.
  const novlangue = detectNovlangue(draftHtml);
  const novlangueFeedback = novlangue.clean
    ? "No novlangue detected — language is precise."
    : `NOVLANGUE DETECTED — REPLACE EUPHEMISMS WITH TRUE NAMES:\n${novlangue.matches.map((m, i) => `${i + 1}. "${m.term}" → should say: ${m.trueName}\n   Context: "...${m.context}..."`).join("\n")}\n\nThese euphemisms mask violence, obscure accountability, or empty words of meaning. Rewrite each occurrence using the precise, true term. Do not soften — name the thing by its true name.`;

  const response = await callLLM({
    messages: [{
      role: "system",
      content: `You are a senior editor at an elite think tank. You must REWRITE the draft to address ALL reviewer feedback while preserving the core analysis and all [SRC-N] citations. Do NOT remove content — improve it. Output the full rewritten HTML. Do NOT wrap the HTML in markdown code fences — output raw HTML only.`
    }, {
      role: "user",
      content: `ORIGINAL DRAFT:
${draftHtml.length > 40000 ? draftHtml.slice(0, 16000) + '\n\n[...MIDDLE SECTION...]\n\n' + draftHtml.slice(-16000) : draftHtml}

═══ REVIEWER FEEDBACK ═══

${methodologyFeedback}

${adversarialFeedback}

${calibrationFeedback}

${novlangueFeedback}

═══ REWRITE INSTRUCTIONS ═══
1. Address EVERY concern raised by reviewers
2. Add hedging language where calibration is off (use "suggests", "indicates", "evidence points to")
3. Acknowledge counter-arguments explicitly — don't ignore them
4. Add methodology caveats where concerns were raised
5. Preserve ALL [SRC-N] citations
6. Maintain the same HTML structure and sections
7. Do NOT add new claims without source support
8. If a blind spot was identified, acknowledge it as a limitation
9. Replace EVERY novlangue euphemism with its true name — "collateral damage" becomes "civilian deaths", "optimization" becomes "layoffs", etc. Name the thing by its true name. This is non-negotiable.

Return the FULL rewritten HTML. No JSON wrapping, no markdown fences — just raw HTML.`
    }],
    temperature: 0.25,
    jsonMode: false,
    maxTokens: 16000,
    enableCache: false, // Never cache rewrites
    task: 'auto_revision',
    producerFamily,
  });

  let rewritten = response.content;
  // Strip markdown code fences if present
  rewritten = rewritten.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/,'');

  // Safety: if rewrite is too short (truncated), keep original
  if (rewritten.length < draftHtml.length * 0.5) {
    console.warn(`[CriticalLoop V2] Rewrite truncated (${rewritten.length} < 50% of ${draftHtml.length}), keeping original`);
    return { html: draftHtml, costUsd: response.costUsd };
  }

  // Safety: check citation preservation — GLM rewriter can drop [SRC-N] tags
  const originalCitations = new Set<number>();
  for (const m of draftHtml.matchAll(/\[SRC-(\d+)\]/g)) originalCitations.add(parseInt(m[1], 10));
  const rewrittenCitations = new Set<number>();
  for (const m of rewritten.matchAll(/\[SRC-(\d+)\]/g)) rewrittenCitations.add(parseInt(m[1], 10));
  const lostCitations = [...originalCitations].filter(c => !rewrittenCitations.has(c));
  if (lostCitations.length > 0 && rewrittenCitations.size < originalCitations.size * 0.5) {
    console.warn(`[CriticalLoop V2] Rewrite lost ${lostCitations.length}/${originalCitations.size} citations (kept ${rewrittenCitations.size}) — keeping original to preserve grounding`);
    return { html: draftHtml, costUsd: response.costUsd };
  }

  return {
    html: rewritten,
    costUsd: response.costUsd,
  };
}

// ============================================================================
// MAIN: ITERATIVE CRITICAL LOOP
// ============================================================================

export async function runCriticalLoopV2(
  input: CriticalLoopV2Input
): Promise<CriticalLoopV2Result> {
  const maxIterations = input.maxIterations ?? 3;
  // P1-D: Use calibrated threshold from AgentMemory if available
  // But never go below the caller's explicit publishThreshold — calibrated
  // values can raise the bar but should not lower it below the floor.
  let publishThreshold = input.publishThreshold ?? 65;
  try {
    const calibrated = await loadCalibratedThresholds();
    if (calibrated.MIN_TRUST_SCORE !== 65) {
      publishThreshold = Math.max(publishThreshold, calibrated.MIN_TRUST_SCORE);
      console.log(`[CriticalLoop V2] Using calibrated threshold: ${publishThreshold} (max of caller=${input.publishThreshold ?? 65} and calibrated=${calibrated.MIN_TRUST_SCORE})`);
    }
  } catch { /* use static threshold */ }
  let currentHtml = input.draftHtml;
  let totalCost = 0;
  const history: CriticalLoopV2Result['iterationHistory'] = [];
  let bestResult: { score: number; html: string; methodology: MethodologyJudgment; adversarial: AdversarialReview; calibration: CalibrationAssessment } | null = null;

  console.log(`[CriticalLoop V2] Starting iterative review (max ${maxIterations} iterations, threshold ${publishThreshold})...`);

  // ── InfoDelphi (arXiv 2607.01661): designed information asymmetry ──
  // Partition the corpus ONCE (deterministic — a critic's private slice is
  // stable across iterations). Methodology gets slice 0, adversarial slice 1.
  // The calibrator judges hedging on the draft itself — no sources needed.
  // [SRC-N] numbering is preserved via `_srcIndex` so citations still resolve.
  const usePartition = input.privateEvidence !== false && input.sources.length >= 8;
  const partition = usePartition
    ? partitionEvidence(input.sources.map((_, i) => i), 3, { minSources: 8 })
    : null;
  const criticSources = (k: number) =>
    partition ? partition.forParticipant(k).map((i) => ({ ...input.sources[i], _srcIndex: i + 1 })) : input.sources;
  const criticReadings = (k: number) =>
    input.readings && partition ? partition.forParticipant(k).map((i) => input.readings![i]) : input.readings;
  const privateNote = (k: number) =>
    partition && partition.privates[k]?.length
      ? partition.privates[k]
          .map((i) => { const s = input.sources[i]; return `[SRC-${i + 1}] ${s.title} (${s.provider}, ${s.year || 'n.d.'})${s.abstract ? ` — ${String(s.abstract).slice(0, 180)}` : ''}`; })
          .join('\n')
      : undefined;
  if (partition && !partition.degenerate) {
    console.log(`[CriticalLoop V2] InfoDelphi partition: ${partition.shared.length} shared + private slices [${partition.privates.map((p) => p.length).join('/')}]`);
  }
  const aggregationLog: { iteration: number; weights: number[]; dispersion: number; confWeighted: boolean }[] = [];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`[CriticalLoop V2] ─── Iteration ${iteration}/${maxIterations} ───`);

    // Run all 3 critics in parallel — each on its own evidence view
    const [methodology, adversarial, calibration] = await Promise.all([
      methodologyJudge(criticSources(0), criticReadings(0), currentHtml),
      adversarialReviewer(currentHtml, input.sources, input.extraContext, privateNote(1)),
      decisionCalibrator(currentHtml),
    ]);

    const iterationCost = methodology.costUsd + adversarial.costUsd + calibration.costUsd;
    totalCost += iterationCost;

    // Confidence-weighted independent aggregation (KalshiBench oracle study):
    // judges score INDEPENDENTLY on partitioned evidence, then a deterministic
    // combiner merges — no deliberation stage where a confidently-wrong judge
    // can flip correct ones. Falls back to the legacy fixed weights when no
    // judge reports usable confidence.
    const agg = aggregateIndependentScores(
      [
        { score: methodology.overallScore, confidence: (methodology as any).confidence },
        { score: adversarial.overallScore, confidence: (adversarial as any).confidence },
        { score: calibration.overallScore, confidence: (calibration as any).confidence },
      ],
      [0.35, 0.35, 0.30],
    );
    let compositeScore = agg.composite;
    aggregationLog.push({ iteration, weights: agg.weights.map((w) => Math.round(w * 100) / 100), dispersion: agg.dispersion, confWeighted: !agg.fellBackToFixed });
    if (!agg.fellBackToFixed) {
      console.log(`[CriticalLoop V2] Weighted aggregation: weights=[${agg.weights.map((w) => w.toFixed(2)).join('/')}], dispersion=${agg.dispersion}`);
    }

    // DETERMINISTIC ADJUSTMENTS (no LLM — based on measurable facts)

    // 1. Source utilization bonus: citing 84% of available sources is excellent
    //    and should be rewarded, not ignored by LLM judges who see a truncated draft.
    const citedSources = new Set<number>();
    for (const m of currentHtml.matchAll(/\[SRC-(\d+)\]/g)) citedSources.add(parseInt(m[1], 10));
    let coverage = citedSources.size / Math.max(1, input.sources.length);
    if (coverage >= 0.70) {
      const utilizationBonus = Math.min(10, Math.round((coverage - 0.65) * 20));
      compositeScore = Math.min(100, compositeScore + utilizationBonus);
      console.log(`[CriticalLoop V2] Source utilization bonus: +${utilizationBonus} (${Math.round(coverage * 100)}% of sources cited) → composite ${compositeScore}`);
    }

    // 2. Quality floor: if sources are high-quality (avg > 80) and well-cited (coverage > 70%),
    //    the composite should not fall below 50 — the LLM judges see a truncated draft and
    //    cannot fairly assess the full analysis.
    const avgQuality = input.sources.reduce((sum: number, s: any) => sum + (s.qualityScore || 0), 0) / Math.max(1, input.sources.length);
    if (avgQuality > 80 && coverage > 0.70 && compositeScore < 50) {
      console.log(`[CriticalLoop V2] Quality floor: avg source quality ${Math.round(avgQuality)}/100, coverage ${Math.round(coverage * 100)}% — raising composite ${compositeScore} → 50`);
      compositeScore = 50;
    }

    // Grounding veto (Invariant 4): citation coverage below 30% caps composite.
    // A well-structured analysis cannot compensate for null grounding.
    // OT-cleanup: the lexical-similarity citation injection was removed —
    // a paragraph merely mentioning an author name or title fragment is not
    // evidence that the claim is supported by that source. Fabricated
    // citations are worse than an honest veto.
    let groundingVetoed = false;
    if (coverage < 0.30) {
      const capped = Math.min(compositeScore, 40);
      console.log(`[CriticalLoop V2] Grounding veto: ${citedSources.size}/${input.sources.length} sources cited (${Math.round(coverage * 100)}%) — capping composite ${compositeScore} → ${capped}`);
      console.log(`[CriticalLoop V2] Grounding veto is TERMINAL — no rewrite will fix missing citations. Stopping.`);
      compositeScore = capped;
      groundingVetoed = true;
    }

    console.log(`[CriticalLoop V2] Iteration ${iteration} scores: M=${methodology.overallScore} A=${adversarial.overallScore} C=${calibration.overallScore} → Composite=${compositeScore}`);

    // Track best result
    if (!bestResult || compositeScore > bestResult.score) {
      bestResult = { score: compositeScore, html: currentHtml, methodology, adversarial, calibration };
    }

    // Grounding veto: terminal exit — rewriting prose cannot add citations.
    if (groundingVetoed) {
      history.push({
        iteration,
        compositeScore,
        methodology: methodology.overallScore,
        adversarial: adversarial.overallScore,
        calibration: calibration.overallScore,
        rewrote: false,
      });
      break;
    }

    // Check if we pass threshold — composite score is the arbiter
    // (individual sub-scores are informational; composite already weights them)
    const passes = compositeScore >= publishThreshold;

    if (passes || iteration === maxIterations) {
      // We're done — either passed or exhausted iterations
      history.push({
        iteration,
        compositeScore,
        methodology: methodology.overallScore,
        adversarial: adversarial.overallScore,
        calibration: calibration.overallScore,
        rewrote: false,
      });
      break;
    }

    // P2.6: Adaptive stopping — if score is stagnating or degrading, stop early
    const prevScore = history.length > 0 ? history[history.length - 1].compositeScore : null;
    if (prevScore !== null && compositeScore - prevScore < 1) {
      console.log(`[CriticalLoop V2] Convergence detected: improvement < 1 point (${prevScore} → ${compositeScore}), stopping early`);
      history.push({
        iteration,
        compositeScore,
        methodology: methodology.overallScore,
        adversarial: adversarial.overallScore,
        calibration: calibration.overallScore,
        rewrote: false,
      });
      break;
    }

    // REWRITE the draft using critic feedback
    console.log(`[CriticalLoop V2] Score ${compositeScore} < ${publishThreshold}, rewriting...`);
    const rewrite = await rewriteDraft(currentHtml, methodology, adversarial, calibration, input.sources, input.producerFamily);
    totalCost += rewrite.costUsd;
    currentHtml = rewrite.html;

    history.push({
      iteration,
      compositeScore,
      methodology: methodology.overallScore,
      adversarial: adversarial.overallScore,
      calibration: calibration.overallScore,
      rewrote: true,
    });
  }

  // Use best result
  const best = bestResult!;
  const firstScore = history[0]?.compositeScore || 0;
  const finalScore = best.score;
  const improvementDelta = finalScore - firstScore;

  // Determine if human review needed
  const needsHumanReview = best.score < publishThreshold;

  // Collect all recommendations
  const recommendations = [
    ...best.methodology.recommendations,
    ...best.adversarial.recommendations,
    ...best.calibration.uncertaintyQuantification.recommendations,
  ];

  console.log(`[CriticalLoop V2] Complete: ${history.length} iterations, score ${firstScore} → ${finalScore} (Δ${improvementDelta > 0 ? '+' : ''}${improvementDelta}), cost $${totalCost.toFixed(4)}`);

  return {
    compositeScore: best.score,
    methodology: best.methodology,
    adversarial: best.adversarial,
    calibration: best.calibration,
    needsHumanReview,
    recommendations,
    iterations: history.length,
    iterationHistory: history,
    finalHtml: best.html,
    improvementDelta,
    totalCostUsd: totalCost,
    aggregation: aggregationLog,
  };
}
