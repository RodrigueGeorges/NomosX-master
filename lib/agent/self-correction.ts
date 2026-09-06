/**
 * Multi-Phase Self-Correction — NomosX
 *
 * Inspired by:
 * - Reflexion (NeurIPS 2023): verbal reinforcement learning from self-reflections
 * - MASC (ACL 2026): Metacognitive Self-Correction with step-level error detection
 * - Uncertainty-Aware Self-Correction (OpenReview 2026): SAUP for coding agents
 * - Process Reward Models (SWE-PRM): inference-time trajectory correction
 * - Experience Memory Graph (arXiv 2026): graph matching for failure recovery
 *
 * Architecture:
 * - After EACH phase (scout, reader, analyst, critic), evaluate quality
 * - If quality < threshold, trigger self-correction:
 *   1. Identify specific issues
 *   2. Generate a correction strategy
 *   3. Retry the phase with feedback injected into the prompt
 * - Maximum 2 retries per phase
 * - All reflections stored for episodic memory (cross-run learning)
 *
 * Integration:
 * - pipeline-v2.ts: call reflectAndRetry() after each phase
 * - episodic-memory.ts: store reflections as part of episodes
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { reflectOnPhase, recordFailure, type PipelinePhase } from './cross-model-consensus';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PhaseReflection {
  phase: PipelinePhase;
  quality: 'high' | 'medium' | 'low';
  score: number; // 0-100
  issues: string[];
  recommendations: string[];
  shouldRetry: boolean;
  retryStrategy?: string;
  costUsd: number;
}

export interface SelfCorrectionResult {
  phase: PipelinePhase;
  originalScore: number;
  finalScore: number;
  retries: number;
  improved: boolean;
  reflections: PhaseReflection[];
  totalCostUsd: number;
}

// ─── Phase-Specific Assessment ──────────────────────────────────────────────

interface PhaseAssessmentInput {
  phase: PipelinePhase;
  query: string;
  output: string; // JSON string of the phase output
  sourceCount?: number;
  citationCount?: number;
  readings?: Array<{ sourceId: string; claims: string[]; confidence: string }>;
}

/**
 * Assess the quality of a pipeline phase output.
 * Uses phase-specific criteria to determine if a retry is needed.
 */
export async function assessPhaseQuality(input: PhaseAssessmentInput): Promise<PhaseReflection> {
  const { phase, query, output, sourceCount, citationCount, readings } = input;

  // Phase-specific assessment prompts
  const phasePrompts: Record<PipelinePhase, string> = {
    scout: `Evaluate the SCOUT phase output.
- Were enough sources found? (target: 15+)
- Is there provider diversity? (target: 3+ providers)
- Are the sources relevant to the research question?
Sources found: ${sourceCount || 0}`,

    reader: `Evaluate the READER phase output.
- Were claims extracted from most sources?
- Are the claims specific (not vague)?
- Is confidence distribution reasonable (not all "low")?
Readings: ${readings?.length || 0}
Low confidence readings: ${readings?.filter(r => r.confidence === 'low').length || 0}`,

    analyst: `Evaluate the ANALYST phase output.
- Does the analysis address the research question?
- Are citations used properly? (target: 5+ unique citations)
- Is the synthesis non-trivial (not just summarizing)?
- Are disagreements and debate sections substantive?
Citations used: ${citationCount || 0}
Output preview: ${output.slice(0, 1000)}`,

    critic: `Evaluate the CRITIC phase output.
- Were claims properly grounded?
- Were biases identified?
- Is the overall score reasonable?
Output preview: ${output.slice(0, 1000)}`,
  };

  try {
    // Use existing reflectOnPhase from cross-model-consensus
    const reflection = await reflectOnPhase(phase, {
      question: query,
      analysisSummary: output.slice(0, 2000),
      sourceCount: sourceCount || 0,
      citationCount: citationCount || 0,
    });

    // Enhance with phase-specific checks
    const phaseSpecificScore = assessPhaseSpecifics(input);

    // Combine scores
    const combinedScore = Math.round((reflection.score + phaseSpecificScore) / 2);

    return {
      phase,
      quality: combinedScore >= 75 ? 'high' : combinedScore >= 50 ? 'medium' : 'low',
      score: combinedScore,
      issues: reflection.issues,
      recommendations: reflection.recommendations,
      shouldRetry: combinedScore < 50 && reflection.issues.length > 0,
      retryStrategy: reflection.retryStrategy,
      costUsd: reflection.costUsd,
    };
  } catch (error) {
    console.warn(`[SelfCorrection] Assessment failed for ${phase}:`, error instanceof Error ? error.message : String(error));
    return {
      phase,
      quality: 'medium',
      score: 50,
      issues: [],
      recommendations: [],
      shouldRetry: false,
      costUsd: 0,
    };
  }
}

/**
 * Phase-specific heuristic assessment (fast, no LLM call).
 */
function assessPhaseSpecifics(input: PhaseAssessmentInput): number {
  const { phase, output, sourceCount, citationCount, readings } = input;

  switch (phase) {
    case 'scout': {
      if (!sourceCount) return 30;
      let score = 0;
      score += Math.min(sourceCount / 15, 1) * 50; // 15+ sources = full score
      // Check output for provider diversity indicators
      const providerMentions = (output.match(/provider/gi) || []).length;
      score += Math.min(providerMentions / 3, 1) * 25;
      score += 25; // baseline
      return Math.min(score, 100);
    }

    case 'reader': {
      if (!readings || readings.length === 0) return 30;
      let score = 0;
      const totalReadings = readings.length;
      const lowConfidenceRatio = readings.filter(r => r.confidence === 'low').length / totalReadings;
      const claimsExtracted = readings.filter(r => r.claims.length > 0).length / totalReadings;
      score += claimsExtracted * 50; // Most readings have claims
      score += (1 - lowConfidenceRatio) * 30; // Not all low confidence
      score += 20; // baseline
      return Math.min(score, 100);
    }

    case 'analyst': {
      let score = 0;
      // Citation count
      if (citationCount && citationCount >= 5) score += 30;
      else if (citationCount && citationCount >= 1) score += 15;
      // Output length (substantial analysis)
      if (output.length > 2000) score += 25;
      else if (output.length > 500) score += 15;
      // Check for key sections
      const hasDebate = /debate|pro|con|synthesis/i.test(output);
      const hasConsensus = /consensus/i.test(output);
      const hasDisagreements = /disagree|conflict|controvers/i.test(output);
      if (hasDebate) score += 15;
      if (hasConsensus) score += 10;
      if (hasDisagreements) score += 10;
      score += 10; // baseline
      return Math.min(score, 100);
    }

    case 'critic': {
      let score = 50; // baseline
      // Check for grounding verdicts
      if (/grounded|supported|unsupported|contradict/i.test(output)) score += 20;
      // Check for bias detection
      if (/bias|geographic|funding|selection/i.test(output)) score += 15;
      // Check for overall score
      if (/score|verdict/i.test(output)) score += 15;
      return Math.min(score, 100);
    }

    default:
      return 50;
  }
}

/**
 * Generate a correction prompt enhancement based on reflection issues.
 * This is injected into the retry's prompt to guide improvement.
 */
export function buildCorrectionFeedback(reflection: PhaseReflection): string {
  if (reflection.issues.length === 0) return '';

  const lines: string[] = [
    `\n=== SELF-CORRECTION FEEDBACK (previous attempt scored ${reflection.score}/100) ===`,
    `The previous output had these issues:`,
  ];

  for (const issue of reflection.issues) {
    lines.push(`  ⚠ ${issue}`);
  }

  if (reflection.recommendations.length > 0) {
    lines.push(`\nTo improve, address these recommendations:`);
    for (const rec of reflection.recommendations) {
      lines.push(`  → ${rec}`);
    }
  }

  if (reflection.retryStrategy) {
    lines.push(`\nRetry strategy: ${reflection.retryStrategy}`);
  }

  lines.push(`=== END SELF-CORRECTION FEEDBACK ===\n`);

  return lines.join('\n');
}

/**
 * Full self-correction loop for a phase.
 * Assesses quality, retries if needed (max 2 retries), returns final result.
 *
 * DISC enhancement (arXiv 2606.21724):
 * - Binary judgment gate: only retry if a *specific* mistake is found
 * - Evidence-conditioned: feedback targets specific issues, not holistic rewrite
 * - Version buffer: keep original if retry degrades quality (CyberCorrect overshoot rollback)
 * - EIR/ECR stability: stop iterating if corrections don't outpace new errors
 */
export async function reflectAndRetry(
  phase: PipelinePhase,
  input: PhaseAssessmentInput,
  retryFn: (feedback: string) => Promise<string>,
  options?: { maxRetries?: number; minScore?: number },
): Promise<SelfCorrectionResult> {
  const maxRetries = options?.maxRetries ?? 2;
  const minScore = options?.minScore ?? 50;

  const reflections: PhaseReflection[] = [];
  let totalCost = 0;
  let currentOutput = input.output;
  let retries = 0;
  // Version buffer: keep the best version seen so far (CyberCorrect)
  let bestOutput = input.output;
  let bestScore = 0;

  // Initial assessment
  let reflection = await assessPhaseQuality(input);
  reflections.push(reflection);
  totalCost += reflection.costUsd;
  bestScore = reflection.score;
  bestOutput = input.output;

  // DISC: Check if there's a specific mistake worth correcting
  // If the only issue is "low score" without specific issues, don't retry
  const hasSpecificIssues = reflection.issues.length > 0 && reflection.issues.some(i => i.length > 10);

  // Retry loop — DISC gate: only retry if there are specific, actionable issues
  while (reflection.shouldRetry && retries < maxRetries && hasSpecificIssues) {
    retries++;
    console.log(`[SelfCorrection] ${phase} retry ${retries}/${maxRetries} (score: ${reflection.score})`);

    // Build feedback for retry — evidence-conditioned (targets specific issues only)
    const feedback = buildCorrectionFeedback(reflection);

    // Record failure for cross-run learning
    recordFailure(phase, 'quality', reflection.issues.join('; '), reflection.retryStrategy || 'retry with feedback', input.query.slice(0, 50));

    // Retry the phase
    try {
      currentOutput = await retryFn(feedback);
    } catch (error) {
      console.warn(`[SelfCorrection] ${phase} retry ${retries} failed:`, error instanceof Error ? error.message : String(error));
      break;
    }

    // Re-assess
    reflection = await assessPhaseQuality({ ...input, output: currentOutput });
    reflections.push(reflection);
    totalCost += reflection.costUsd;

    // Version buffer (CyberCorrect): keep the best version
    if (reflection.score > bestScore) {
      bestScore = reflection.score;
      bestOutput = currentOutput;
      console.log(`[SelfCorrection] ${phase} retry ${retries}: improved to ${reflection.score} (new best)`);
    } else {
      console.log(`[SelfCorrection] ${phase} retry ${retries}: ${reflection.score} ≤ best ${bestScore} — keeping best version (overshoot rollback)`);
    }

    // Early stop if score is now good enough
    if (reflection.score >= minScore) {
      console.log(`[SelfCorrection] ${phase} reached ${reflection.score} — stopping retries`);
      break;
    }

    // EIR/ECR stability check: if retry made things worse, stop iterating
    if (reflections.length >= 3) {
      const scores = reflections.map(r => r.score);
      let corrections = 0;
      let introductions = 0;
      for (let i = 1; i < scores.length; i++) {
        const delta = scores[i] - scores[i - 1];
        if (delta > 2) corrections++;
        else if (delta < -2) introductions++;
      }
      if (introductions > corrections) {
        console.log(`[SelfCorrection] ${phase} EIR/ECR: ${introductions} introductions > ${corrections} corrections — stopping (counterproductive)`);
        break;
      }
    }
  }

  const originalScore = reflections[0]?.score || 0;
  const finalScore = bestScore;
  const improved = finalScore > originalScore;

  // Use the best version found (CyberCorrect version buffer)
  if (improved && bestOutput !== currentOutput) {
    console.log(`[SelfCorrection] ${phase}: using best version (${originalScore} → ${finalScore}, rollback from ${reflection.score})`);
  }

  if (improved) {
    console.log(`[SelfCorrection] ${phase}: ${originalScore} → ${finalScore} (+${finalScore - originalScore} after ${retries} retries)`);
  } else if (retries > 0) {
    console.log(`[SelfCorrection] ${phase}: no improvement after ${retries} retries (${originalScore} → ${finalScore})`);
  }

  return {
    phase,
    originalScore,
    finalScore,
    retries,
    improved,
    reflections,
    totalCostUsd: totalCost,
  };
}
