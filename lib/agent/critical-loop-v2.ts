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
  readings?: any[]
): Promise<MethodologyJudgment & { costUsd: number }> {
  const sourceContext = sources.map((s, i) => {
    const reading = readings?.[i];
    return `[SRC-${i + 1}] ${s.title}
Provider: ${s.provider} | Year: ${s.year || "N/A"} | Quality: ${s.qualityScore || 0}/100 | Citations: ${s.citationCount || 0}
Methods: ${reading?.methods?.join("; ") || "Not extracted"}
Limitations: ${reading?.limitations?.join("; ") || "Not stated"}`;
  }).join("\n\n");

  const response = await callLLM({
    messages: [{
      role: "user",
      content: `You are a methodology expert reviewing research sources for a think tank publication.

SOURCES:
${sourceContext}

Score each dimension 0-100:
1. Study Design: RCT > quasi-experimental > observational > case study > theoretical
2. Sample Size: Adequacy for conclusions drawn
3. Statistical Rigor: Appropriate methods, significance levels
4. Replicability: Can findings be reproduced?
5. Bias Risk: Conflicts of interest, selection bias, publication bias (higher = less bias)

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
    maxTokens: 2000,
    enableCache: true,
  });

  const result = JSON.parse(response.content);
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
      content: `You are an adversarial reviewer. Find the STRONGEST counter-arguments to this analysis. Be rigorous, not charitable.

DRAFT (first 5000 chars):
${draftHtml.slice(0, 5000)}

NUMBER OF SOURCES: ${sources.length}

For each major claim:
1. Find the strongest counter-argument
2. Identify evidence supporting the counter
3. Note blind spots
4. Provide the "steel man" of the opposing view

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
    maxTokens: 3000,
    enableCache: true,
  });

  const result = JSON.parse(response.content);
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

DRAFT (first 5000 chars):
${draftHtml.slice(0, 5000)}

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
  });

  const result = JSON.parse(response.content);
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
  sources: any[]
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
      content: `You are a senior editor at an elite think tank. You must REWRITE the draft to address ALL reviewer feedback while preserving the core analysis and all [SRC-N] citations. Do NOT remove content — improve it. Output the full rewritten HTML.`
    }, {
      role: "user",
      content: `ORIGINAL DRAFT:
${draftHtml.slice(0, 8000)}

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

Return the FULL rewritten HTML. No JSON wrapping — just the HTML.`
    }],
    temperature: 0.25,
    jsonMode: false,
    maxTokens: 8000,
    enableCache: false, // Never cache rewrites
  });

  return {
    html: response.content,
    costUsd: response.costUsd,
  };
}

// ============================================================================
// MAIN: ITERATIVE CRITICAL LOOP
// ============================================================================

export async function runCriticalLoopV2(
  input: CriticalLoopV2Input
): Promise<CriticalLoopV2Result> {
  const maxIterations = input.maxIterations ?? 2;
  // P1-D: Use calibrated threshold from AgentMemory if available
  let publishThreshold = input.publishThreshold ?? 65;
  try {
    const calibrated = await loadCalibratedThresholds();
    if (calibrated.MIN_TRUST_SCORE !== 65) {
      publishThreshold = calibrated.MIN_TRUST_SCORE;
      console.log(`[CriticalLoop V2] Using calibrated threshold: ${publishThreshold} (from AgentMemory)`);
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
      methodologyJudge(input.sources, input.readings),
      adversarialReviewer(currentHtml, input.sources),
      decisionCalibrator(currentHtml),
    ]);

    const iterationCost = methodology.costUsd + adversarial.costUsd + calibration.costUsd;
    totalCost += iterationCost;

    // Compute composite score
    const compositeScore = Math.round(
      methodology.overallScore * 0.35 +
      adversarial.overallScore * 0.35 +
      calibration.overallScore * 0.30
    );

    console.log(`[CriticalLoop V2] Iteration ${iteration} scores: M=${methodology.overallScore} A=${adversarial.overallScore} C=${calibration.overallScore} → Composite=${compositeScore}`);

    // Track best result
    if (!bestResult || compositeScore > bestResult.score) {
      bestResult = { score: compositeScore, html: currentHtml, methodology, adversarial, calibration };
    }

    // Check if we pass threshold
    const passes = compositeScore >= publishThreshold &&
      methodology.passThreshold &&
      adversarial.passThreshold &&
      calibration.passThreshold;

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

    // REWRITE the draft using critic feedback
    console.log(`[CriticalLoop V2] Score ${compositeScore} < ${publishThreshold}, rewriting...`);
    const rewrite = await rewriteDraft(currentHtml, methodology, adversarial, calibration, input.sources);
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
  const needsHumanReview =
    !best.methodology.passThreshold ||
    !best.adversarial.passThreshold ||
    !best.calibration.passThreshold ||
    best.score < publishThreshold;

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
