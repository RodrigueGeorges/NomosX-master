/**
 * NomosX Triangular Judging — Dispute arbitration between DA and Analyst
 *
 * Inspired by TriAdReview (arXiv 2025) — when the Devil's Advocate and
 * the Critical Loop disagree on publishability, a third-party judge
 * (different LLM family) arbitrates the dispute.
 *
 * Scenarios:
 * - DA says "reject" but critical loop score >= 65 → arbitrate
 * - DA says "major_revision" but critical loop score >= 75 → arbitrate
 * - Judge can: uphold DA veto, downgrade to "revise", or override DA
 *
 * This prevents a single adversarial agent from blocking publication
 * when the broader quality consensus disagrees.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import type { AdvocateReport } from './devils-advocate';

export type TriangularVerdict =
  | 'uphold_da'       // DA is right — block or revise
  | 'downgrade'       // DA was too harsh — reduce severity
  | 'override_da';    // DA is wrong — allow publication

export interface TriangularJudgment {
  verdict: TriangularVerdict;
  reasoning: string;
  revisedVerdict: AdvocateReport['verdict'];
  confidence: number;
  costUsd: number;
}

/**
 * Determine if triangular judging is needed.
 * Only trigger when DA and critical loop disagree significantly.
 */
export function needsTriangularJudging(
  daVerdict: AdvocateReport['verdict'],
  criticalLoopScore: number,
): boolean {
  if (daVerdict === 'reject' && criticalLoopScore >= 65) return true;
  if (daVerdict === 'major_revision' && criticalLoopScore >= 75) return true;
  return false;
}

/**
 * Run triangular judging — a third-party LLM arbitrates the dispute.
 *
 * @param daReport - The Devil's Advocate report
 * @param criticalLoopScore - The critical loop composite score
 * @param analysisSummary - Brief summary of the analysis for context
 */
export async function runTriangularJudge(
  daReport: AdvocateReport,
  criticalLoopScore: number,
  analysisSummary: string,
): Promise<TriangularJudgment> {
  const fatalChallengesText = daReport.fatalChallenges
    .map((c, i) => `${i + 1}. [${c.severity}] ${c.claim}: ${c.challenge}`)
    .join('\n');

  const majorChallengesText = daReport.majorChallenges
    .map((c, i) => `${i + 1}. ${c.claim}: ${c.challenge}`)
    .join('\n');

  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: `You are a TRIANGULAR JUDGE — an independent arbiter resolving a dispute between two quality assessment systems for a think tank publication.

DISPUTE:
- The Critical Loop (methodology + adversarial + calibration reviewers) scored this publication at ${criticalLoopScore}/100.
- The Devil's Advocate (epistemic challenge) gave a verdict of "${daReport.verdict}" with ${daReport.fatalChallenges.length} fatal and ${daReport.majorChallenges.length} major challenges.

DEVIL'S ADVOCATE FATAL CHALLENGES:
${fatalChallengesText || 'None'}

DEVIL'S ADVOCATE MAJOR CHALLENGES:
${majorChallengesText || 'None'}

ANALYSIS SUMMARY (first 500 chars):
${analysisSummary.slice(0, 500)}

DEVIL'S ADVOCATE STRENGTHS FOUND:
${daReport.strengths.join('; ') || 'None listed'}

YOUR TASK:
As an independent judge, determine who is right. Consider:
1. Are the "fatal" challenges truly fatal, or are they overstated?
2. Does the critical loop score accurately reflect quality?
3. Would a senior editor at Brookings/RAND publish this with revisions, or reject it?

Return JSON:
{
  "verdict": "uphold_da|downgrade|override_da",
  "reasoning": "Your detailed reasoning",
  "revisedVerdict": "publish|revise|major_revision|reject",
  "confidence": 0-100
}`
      }],
      temperature: 0.15,
      jsonMode: true,
      maxTokens: 1500,
      task: 'editorial_arbiter',
    });

    const result = parseJson<any>(response.content);
    if (!result) throw new SyntaxError('Triangular judge: failed to parse JSON');

    return {
      verdict: result.verdict || 'uphold_da',
      reasoning: result.reasoning || 'No reasoning provided',
      revisedVerdict: result.revisedVerdict || daReport.verdict,
      confidence: result.confidence || 50,
      costUsd: response.costUsd,
    };
  } catch (error: any) {
    console.warn(`[TRIANGULAR JUDGE] Failed: ${error.message}`);
    // Fallback: trust the DA (conservative)
    return {
      verdict: 'uphold_da',
      reasoning: `Triangular judge failed: ${error.message}. Defaulting to DA verdict.`,
      revisedVerdict: daReport.verdict,
      confidence: 0,
      costUsd: 0,
    };
  }
}
