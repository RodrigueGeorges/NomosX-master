/**
 * Local Judge — NomosX Sprint 6 (Gap 8)
 *
 * LLM-as-Judge open-source (Prometheus 2 / JudgeLM / Auto-J) pour réduire
 * la dépendance aux modèles propriétaires et les coûts.
 * Inspiré de :
 * - Prometheus 2 (EMNLP 2024, arxiv 2405.01535) — evaluator LM with custom rubrics
 * - JudgeLM (BAAI-Vision) — scalable judge
 * - Auto-J (GAIR-NLP) — generative judge for alignment
 *
 * Le problème :
 * Cross-Model Consensus, CRITIC, et PRM utilisent GPT-4o-mini/DeepSeek/GLM.
 * Un judge local open-source = coût $0 + indépendance + rubriques custom.
 *
 * Architecture :
 * 1. Abstraction du judge (local API ou vLLM) compatible avec l'existant
 * 2. Custom rubrics adaptées à NomosX (citations, nuance, équilibre, vérification)
 * 3. Fallback vers LLMs propriétaires si le local judge n'est pas disponible
 * 4. Intégration dans self-play, PRM, et cross-model consensus
 *
 * Implémentation NomosX : `lib/agent/local-judge.ts`
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JudgeRubric {
  /** Short name */
  name: string;
  /** Description */
  description: string;
  /** Max score for this rubric */
  maxScore: number;
  /** Weight in the final score (0-1) */
  weight: number;
}

export interface JudgeEvaluation {
  /** Per-rubric scores */
  rubrics: Record<string, number>;
  /** Final score (0-1) */
  overallScore: number;
  /** Written feedback */
  feedback: string;
  /** Whether the local judge was used */
  usedLocalJudge: boolean;
  /** Cost in USD (0 for local) */
  costUsd: number;
  /** Errors if any */
  error?: string;
}

export interface LocalJudgeConfig {
  /** Endpoint for local judge (e.g., vLLM, Ollama, llama.cpp) */
  endpoint: string;
  /** Model name (e.g., "prometheus-7b", "judge-lm-7b") */
  model: string;
  /** Whether local judge is enabled */
  enabled: boolean;
  /** Timeout in ms */
  timeoutMs: number;
  /** Default rubrics */
  defaultRubrics: JudgeRubric[];
  /** Fallback to cloud judge if local fails */
  fallbackToCloud: boolean;
}

export const DEFAULT_LOCAL_JUDGE_CONFIG: LocalJudgeConfig = {
  endpoint: process.env.LOCAL_JUDGE_ENDPOINT || 'http://localhost:8000/v1/completions',
  model: process.env.LOCAL_JUDGE_MODEL || 'prometheus-2-7b',
  enabled: process.env.ENABLE_LOCAL_JUDGE === 'true',
  timeoutMs: 30000,
  defaultRubrics: [
    { name: 'citations', description: 'All factual claims have [SRC-N] citations', maxScore: 10, weight: 0.25 },
    { name: 'nuance', description: 'Uncertainty is acknowledged where appropriate', maxScore: 10, weight: 0.15 },
    { name: 'balance', description: 'Counter-evidence and disagreements are presented', maxScore: 10, weight: 0.20 },
    { name: 'specificity', description: 'Claims are specific, with numbers/dates/entities', maxScore: 10, weight: 0.15 },
    { name: 'verification', description: 'Claims can be verified against provided sources', maxScore: 10, weight: 0.25 },
  ],
  fallbackToCloud: true,
};

// ─── Default Rubrics for NomosX ─────────────────────────────────────────────

export const NOMOSX_JUDGE_RUBRICS: JudgeRubric[] = DEFAULT_LOCAL_JUDGE_CONFIG.defaultRubrics;

// ─── Check if local judge is available ──────────────────────────────────────

export async function isLocalJudgeAvailable(config: LocalJudgeConfig = DEFAULT_LOCAL_JUDGE_CONFIG): Promise<boolean> {
  if (!config.enabled) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const res = await fetch(config.endpoint, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Format prompt for Prometheus 2 / JudgeLM ───────────────────────────────

function formatJudgePrompt(
  content: string,
  rubrics: JudgeRubric[],
  reference?: string,
): string {
  const rubricText = rubrics
    .map(r => `- ${r.name} (${r.maxScore} pts): ${r.description}`)
    .join('\n');

  const referenceText = reference ? `\nReference answer:\n${reference.slice(0, 2000)}\n` : '';

  return `You are an expert judge. Evaluate the following response based on the rubrics.

Rubrics:
${rubricText}

${referenceText}
Response to evaluate:
${content.slice(0, 4000)}

Provide your evaluation as JSON:
{
  "rubrics": {
    "citations": 8,
    "nuance": 6,
    ...
  },
  "overallScore": 0.75,
  "feedback": "brief explanation of strengths and weaknesses"
}

overallScore is 0.0 to 1.0. Rubrics are 0 to their maxScore.`;
}

// ─── Call local judge ───────────────────────────────────────────────────────

async function callLocalJudge(
  content: string,
  rubrics: JudgeRubric[],
  config: LocalJudgeConfig,
  reference?: string,
): Promise<JudgeEvaluation | null> {
  try {
    const prompt = formatJudgePrompt(content, rubrics, reference);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt,
        max_tokens: 800,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local judge error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.text || data.text || '';

    const parsed = parseJson<{
      rubrics: Record<string, number>;
      overallScore: number;
      feedback: string;
    }>(text);

    if (parsed) {
      const normalizedRubrics: Record<string, number> = {};
      for (const r of rubrics) {
        const score = parsed.rubrics[r.name];
        normalizedRubrics[r.name] = typeof score === 'number' ? Math.max(0, Math.min(r.maxScore, score)) : 0;
      }

      return {
        rubrics: normalizedRubrics,
        overallScore: Math.max(0, Math.min(1, parsed.overallScore)),
        feedback: parsed.feedback || '',
        usedLocalJudge: true,
        costUsd: 0,
      };
    }
  } catch (err) {
    console.warn('[LocalJudge] Local judge call failed:', err);
  }

  return null;
}

// ─── Fallback cloud judge ───────────────────────────────────────────────────

async function callCloudJudge(
  content: string,
  rubrics: JudgeRubric[],
  reference?: string,
): Promise<JudgeEvaluation> {
  const rubricText = rubrics
    .map(r => `- ${r.name} (${r.maxScore} pts): ${r.description}`)
    .join('\n');

  const referenceText = reference ? `\nReference answer:\n${reference.slice(0, 2000)}\n` : '';

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are an expert judge. Evaluate the following response based on the rubrics. Respond with JSON: {"rubrics": {"citations": 8, ...}, "overallScore": 0.75, "feedback": "..."} overallScore is 0-1.`,
        },
        {
          role: 'user',
          content: `Rubrics:\n${rubricText}\n${referenceText}\nResponse to evaluate:\n${content.slice(0, 4000)}\nEvaluate:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 600,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{
      rubrics: Record<string, number>;
      overallScore: number;
      feedback: string;
    }>(response.content);

    if (parsed) {
      return {
        rubrics: parsed.rubrics,
        overallScore: Math.max(0, Math.min(1, parsed.overallScore)),
        feedback: parsed.feedback || '',
        usedLocalJudge: false,
        costUsd: response.costUsd,
      };
    }
  } catch (err) {
    console.warn('[LocalJudge] Cloud judge fallback failed:', err);
  }

  // Ultimate fallback: heuristic
  const heuristicScore = heuristicJudge(content);
  return {
    rubrics: {},
    overallScore: heuristicScore,
    feedback: 'Heuristic fallback: no LLM judge available',
    usedLocalJudge: false,
    costUsd: 0,
  };
}

function heuristicJudge(content: string): number {
  const citationCount = (content.match(/\[SRC-\d+\]/g) || []).length;
  const hasHedging = /\b(may|might|possibly|likely|uncertain|unclear|suggests?)\b/i.test(content);
  const hasContradiction = /\b(however|but|in contrast|contradict|disagree)\b/i.test(content);
  const length = content.length;

  let score = 0.5;
  score += Math.min(0.3, citationCount / 20);
  if (hasHedging) score += 0.1;
  if (hasContradiction) score += 0.1;
  score += Math.min(0.2, length / 10000);

  return Math.min(1, score);
}

// ─── Main judge function ────────────────────────────────────────────────────

/**
 * Evaluate a response using the best available judge.
 * Prefers the local judge, falls back to cloud, then to heuristic.
 *
 * @param content - The response to evaluate
 * @param rubrics - Rubrics to use
 * @param config - Judge config
 * @param reference - Optional reference answer
 * @returns The evaluation
 */
export async function judge(
  content: string,
  rubrics: JudgeRubric[] = NOMOSX_JUDGE_RUBRICS,
  config: LocalJudgeConfig = DEFAULT_LOCAL_JUDGE_CONFIG,
  reference?: string,
): Promise<JudgeEvaluation> {
  const available = await isLocalJudgeAvailable(config);

  if (available) {
    const local = await callLocalJudge(content, rubrics, config, reference);
    if (local) return local;
  }

  if (config.fallbackToCloud) {
    return callCloudJudge(content, rubrics, reference);
  }

  return {
    rubrics: {},
    overallScore: heuristicJudge(content),
    feedback: 'Local judge unavailable and fallbackToCloud=false — using heuristic',
    usedLocalJudge: false,
    costUsd: 0,
  };
}

// ─── Convenience: judge for PRM labels ──────────────────────────────────────

/**
 * Get a single 0-1 score for a reasoning step, suitable for PRM training labels.
 */
export async function judgeForPRM(
  stepOutput: string,
  config: LocalJudgeConfig = DEFAULT_LOCAL_JUDGE_CONFIG,
): Promise<{ score: number; costUsd: number }> {
  const result = await judge(stepOutput, NOMOSX_JUDGE_RUBRICS, config);
  return { score: result.overallScore, costUsd: result.costUsd };
}

// ─── Convenience: judge for self-play attacks ───────────────────────────────

/**
 * Judge whether an attack on an analysis was successful.
 */
export async function judgeAttack(
  original: string,
  attack: string,
  config: LocalJudgeConfig = DEFAULT_LOCAL_JUDGE_CONFIG,
): Promise<{ success: boolean; score: number; costUsd: number }> {
  const result = await judge(
    attack,
    [
      { name: 'relevance', description: 'The attack directly addresses a real weakness in the original analysis', maxScore: 10, weight: 0.4 },
      { name: 'severity', description: 'The weakness is severe if true', maxScore: 10, weight: 0.4 },
      { name: 'evidence', description: 'The attack is backed by evidence or reasoning', maxScore: 10, weight: 0.2 },
    ],
    config,
    original,
  );

  return {
    success: result.overallScore > 0.7,
    score: result.overallScore,
    costUsd: result.costUsd,
  };
}
