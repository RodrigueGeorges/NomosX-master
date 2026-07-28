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
import { parseJson } from './json-utils';
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
}

// ============================================================================
// CRITICS
// ============================================================================

async function methodologyJudge(
  sources: any[],
  readings?: any[],
  draftHtml?: string,
): Promise<MethodologyJudgment & { costUsd: number }> {
  const sourceContext = sources.map((s, i) => {
    const reading = readings?.[i];
    return `[SRC-${i + 1}] ${s.title}
Provider: ${s.provider} | Year: ${s.year || "N/A"} | Quality: ${s.qualityScore || 0}/100 | Citations: ${s.citationCount || 0}
Methods: ${reading?.methods?.join("; ") || "Not extracted"}
Limitations: ${reading?.limitations?.join("; ") || "Not stated"}`;
  }).join("\n\n");

  const draftExcerpt = draftHtml
    ? draftHtml.length > 15000
      ? draftHtml.slice(0, 6000) + '\n\n[...MIDDLE SECTION OMITTED...]\n\n' + draftHtml.slice(-6000)
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
    passThreshold: (result.overallScore || 50) >= 60,
    costUsd: response.costUsd,
  };
}

async function adversarialReviewer(
  draftHtml: string,
  sources: any[]
): Promise<AdversarialReview & { costUsd: number }> {
  const response = await callLLM({
    messages: [{
      role: "user",
      content: `You are a senior adversarial reviewer at a top think tank. Your role is balanced: identify counter-arguments AND acknowledge analytical strengths. Be rigorous but fair.

DRAFT (full text):
${draftHtml.length > 15000 ? draftHtml.slice(0, 6000) + '\n\n[...MIDDLE SECTION OMITTED FOR BREVITY...]\n\n' + draftHtml.slice(-6000) : draftHtml}

NUMBER OF SOURCES: ${sources.length}

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
    passThreshold: (result.overallScore || 60) >= 55,
    costUsd: response.costUsd,
  };
}

async function decisionCalibrator(
  draftHtml: string
): Promise<CalibrationAssessment & { costUsd: number }> {
  const response = await callLLM({
    messages: [{
      role: "user",
      content: `You are a calibration expert. Assess whether confidence levels in this analysis are well-calibrated.

DRAFT (full text):
${draftHtml.length > 15000 ? draftHtml.slice(0, 6000) + '\n\n[...MIDDLE SECTION OMITTED FOR BREVITY...]\n\n' + draftHtml.slice(-6000) : draftHtml}

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
  "passThreshold": true/false (score >= 50)
}`
    }],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 2500,
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

═══ REWRITE INSTRUCTIONS ═══
1. Address EVERY concern raised by reviewers
2. Add hedging language where calibration is off (use "suggests", "indicates", "evidence points to")
3. Acknowledge counter-arguments explicitly — don't ignore them
4. Add methodology caveats where concerns were raised
5. Preserve ALL [SRC-N] citations
6. Maintain the same HTML structure and sections
7. Do NOT add new claims without source support
8. If a blind spot was identified, acknowledge it as a limitation

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

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`[CriticalLoop V2] ─── Iteration ${iteration}/${maxIterations} ───`);

    // Run all 3 critics in parallel
    const [methodology, adversarial, calibration] = await Promise.all([
      methodologyJudge(input.sources, input.readings, currentHtml),
      adversarialReviewer(currentHtml, input.sources),
      decisionCalibrator(currentHtml),
    ]);

    const iterationCost = methodology.costUsd + adversarial.costUsd + calibration.costUsd;
    totalCost += iterationCost;

    // Compute composite score
    let compositeScore = Math.round(
      methodology.overallScore * 0.35 +
      adversarial.overallScore * 0.35 +
      calibration.overallScore * 0.30
    );

    // Grounding veto (Invariant 4): citation coverage below 50% caps composite.
    // A well-structured analysis cannot compensate for null grounding.
    const citedSources = new Set<number>();
    for (const m of currentHtml.matchAll(/\[SRC-(\d+)\]/g)) citedSources.add(parseInt(m[1], 10));
    const coverage = citedSources.size / Math.max(1, input.sources.length);
    if (coverage < 0.50) {
      const capped = Math.min(compositeScore, 40);
      console.log(`[CriticalLoop V2] Grounding veto: ${citedSources.size}/${input.sources.length} sources cited (${Math.round(coverage * 100)}%) — capping composite ${compositeScore} → ${capped}`);
      compositeScore = capped;
    }

    console.log(`[CriticalLoop V2] Iteration ${iteration} scores: M=${methodology.overallScore} A=${adversarial.overallScore} C=${calibration.overallScore} → Composite=${compositeScore}`);

    // Track best result
    if (!bestResult || compositeScore > bestResult.score) {
      bestResult = { score: compositeScore, html: currentHtml, methodology, adversarial, calibration };
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
  };
}
