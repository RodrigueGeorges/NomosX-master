/**
 * Self-Reflection Checkpoint — meta-cognition agent (2026 pattern).
 *
 * After the ANALYST produces its output, this lightweight agent evaluates
 * whether the analysis actually answers the research question. If the
 * alignment score is below threshold, the ANALYST is re-run with a
 * strengthened prompt that includes the reflection feedback.
 *
 * This is the "Reflexion" pattern: generate → critique → regenerate.
 *
 * Cost: ~$0.01-0.03 per call (single LLM call, small token budget).
 * Non-blocking: on failure, the original analysis is kept.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

export interface ReflectionResult {
  alignmentScore: number;       // 0-100
  answeredCoreQuestion: boolean;
  missingAspects: string[];     // aspects of the question not addressed
  hallucinationRisk: 'low' | 'medium' | 'high';
  feedback: string;             // actionable feedback for re-run
  costUsd: number;
  shouldRetry: boolean;         // alignmentScore < threshold
}

/**
 * Evaluate whether the analysis answers the research question.
 * Returns a reflection result with alignment score and feedback.
 */
export async function selfReflect(
  question: string,
  analysis: Record<string, unknown>,
  options?: { threshold?: number }
): Promise<ReflectionResult> {
  const threshold = options?.threshold ?? 60;

  const analysisSummary = buildAnalysisSummary(analysis);

  const response = await callLLM({
    messages: [{
      role: "user",
      content: `You are a meta-cognition reviewer. Your job is to evaluate whether a research analysis actually answers the research question that was asked.

RESEARCH QUESTION:
${question}

ANALYSIS OUTPUT (key sections):
${analysisSummary}

Evaluate:
1. Does the analysis directly answer the research question? (not just tangentially related)
2. What aspects of the question are NOT addressed?
3. Are there claims that go beyond what the evidence supports? (hallucination risk)
4. Is the confidence level appropriate for the evidence presented?

Return JSON:
{
  "alignmentScore": 0-100,
  "answeredCoreQuestion": true/false,
  "missingAspects": ["specific aspects of the question not addressed"],
  "hallucinationRisk": "low|medium|high",
  "feedback": "specific actionable feedback for improving the analysis — what to add, what to tone down, what to restructure"
}`
    }],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 2000,
    enableCache: true,
    task: 'reflection',
  });

  const result = parseJson<any>(response.content);
  if (!result) {
    return {
      alignmentScore: 70,
      answeredCoreQuestion: true,
      missingAspects: [],
      hallucinationRisk: 'low',
      feedback: '',
      costUsd: response.costUsd,
      shouldRetry: false,
    };
  }

  const alignmentScore = typeof result.alignmentScore === 'number' ? result.alignmentScore : 70;
  return {
    alignmentScore,
    answeredCoreQuestion: result.answeredCoreQuestion ?? alignmentScore >= 50,
    missingAspects: Array.isArray(result.missingAspects) ? result.missingAspects : [],
    hallucinationRisk: result.hallucinationRisk ?? 'low',
    feedback: result.feedback || '',
    costUsd: response.costUsd,
    shouldRetry: alignmentScore < threshold,
  };
}

function buildAnalysisSummary(analysis: Record<string, unknown>): string {
  const sections: string[] = [];
  const fields = ['title', 'summary', 'consensus', 'disagreements', 'evidence', 'implications', 'risks', 'openQuestions', 'whatChangesMind'];
  for (const field of fields) {
    const val = analysis[field];
    if (val && typeof val === 'string' && val.length > 0) {
      sections.push(`[${field}]: ${val.slice(0, 500)}`);
    }
  }
  // Strategic fields
  const stratFields = ['executiveSummary', 'literatureOverview', 'conclusion'];
  for (const field of stratFields) {
    const val = analysis[field];
    if (val && typeof val === 'string' && val.length > 0) {
      sections.push(`[${field}]: ${val.slice(0, 500)}`);
    }
  }
  return sections.join('\n\n').slice(0, 6000);
}
