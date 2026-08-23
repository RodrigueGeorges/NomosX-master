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
import { getLatestPrompt } from './self-evolver';
import { cohensKappa, spearmanRho, calibrateJudge, type JudgeEvaluation as ArenaJudgeEvaluation, type JudgeCalibration as ArenaJudgeCalibration } from './judge-arena';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RubricCriterion {
  /** Short name of the sub-criterion */
  name: string;
  /** What is being evaluated */
  description: string;
  /** Max score for this sub-criterion */
  maxScore: number;
}

export interface JudgeRubric {
  /** Short name */
  name: string;
  /** Description */
  description: string;
  /** Max score for this rubric */
  maxScore: number;
  /** Weight in the final score (0-1) */
  weight: number;
  /** Optional QUEST-style rubric tree with sub-criteria */
  criteria?: RubricCriterion[];
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
    {
      name: 'citations', description: 'All factual claims have [SRC-N] citations', maxScore: 10, weight: 0.20,
      criteria: [
        { name: 'completeness', description: 'Key claims are cited', maxScore: 5 },
        { name: 'accuracy', description: 'Citations match the claims', maxScore: 5 },
      ],
    },
    {
      name: 'grounding', description: 'Claims are grounded in cited sources (low hallucination)', maxScore: 10, weight: 0.20,
      criteria: [
        { name: 'source_alignment', description: 'Claims align with cited sources', maxScore: 5 },
        { name: 'quote_precision', description: 'Quotes and data are precise', maxScore: 5 },
      ],
    },
    {
      name: 'nuance', description: 'Uncertainty is acknowledged where appropriate', maxScore: 10, weight: 0.10,
      criteria: [
        { name: 'uncertainty_markers', description: 'Uses confidence labels or hedges where needed', maxScore: 5 },
        { name: 'avoid_overstatement', description: 'Does not overstate evidence', maxScore: 5 },
      ],
    },
    {
      name: 'balance', description: 'Counter-evidence and disagreements are presented', maxScore: 10, weight: 0.15,
      criteria: [
        { name: 'counter_arguments', description: 'Presents objections or limitations', maxScore: 5 },
        { name: 'evidence_breadth', description: 'Uses diverse sources and perspectives', maxScore: 5 },
      ],
    },
    {
      name: 'specificity', description: 'Claims are specific, with numbers/dates/entities', maxScore: 10, weight: 0.10,
      criteria: [
        { name: 'quantitative_anchors', description: 'Includes numbers, dates, named actors', maxScore: 5 },
        { name: 'mechanism_clarity', description: 'Causal mechanisms are explicit', maxScore: 5 },
      ],
    },
    {
      name: 'policy_relevance', description: 'Recommendations are actionable and decision-oriented', maxScore: 10, weight: 0.15,
      criteria: [
        { name: 'actionability', description: 'Recommends concrete actions for named actors', maxScore: 5 },
        { name: 'trade_offs', description: 'Options and trade-offs are explicit', maxScore: 5 },
      ],
    },
    {
      name: 'quality', description: 'Overall think tank quality: clarity, structure, voice', maxScore: 10, weight: 0.10,
      criteria: [
        { name: 'clarity', description: 'Prose is clear and concise', maxScore: 5 },
        { name: 'structure', description: 'Sections are well-organized', maxScore: 5 },
      ],
    },
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

function formatRubricTreeText(rubric: JudgeRubric): string {
  if (!rubric.criteria || rubric.criteria.length === 0) {
    return `${rubric.name}: ${rubric.description} (0-${rubric.maxScore})`;
  }
  const criteriaText = rubric.criteria
    .map((c) => `    - ${c.name}: ${c.description} (0-${c.maxScore})`)
    .join('\n');
  return `${rubric.name}: ${rubric.description} (0-${rubric.maxScore})\n${criteriaText}`;
}

function formatJudgePrompt(
  content: string,
  rubrics: JudgeRubric[],
  reference?: string,
): string {
  const rubricText = rubrics.map(formatRubricTreeText).join('\n\n');

  const referenceText = reference ? `\nReference material to compare against:\n${reference.slice(0, 2000)}\n` : '';

  return `You are an expert evaluator model (Prometheus 2 / M-Prometheus / QUEST style). Evaluate the following response using the provided rubric trees. Return only valid JSON.

A rubric tree breaks each high-level rubric into sub-criteria. Score each sub-criterion, then derive the parent rubric score as the weighted sum of its criteria (or simply the total out of maxScore).

Evaluation rubrics:
${rubricText}

${referenceText}
Response to evaluate:
${content.slice(0, 4000)}

Be critical: a think tank brief must be factually grounded, nuanced, balanced, specific, decision-relevant, and well-structured. Deduct heavily for hallucinated citations, overstatements, missing uncertainty, or generic recommendations.

Provide your evaluation as JSON:
{
  "rubrics": {
    "citations": 8,
    "grounding": 7,
    ...
  },
  "criteria": {
    "citations": {
      "completeness": 4,
      "accuracy": 4
    },
    "grounding": {
      "source_alignment": 4,
      "quote_precision": 3
    },
    ...
  },
  "overallScore": 0.75,
  "feedback": "brief explanation of strengths and weaknesses"
}

overallScore is 0.0 to 1.0. Rubrics and sub-criteria are 0 to their maxScore.`;
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
  const rubricText = rubrics.map(formatRubricTreeText).join('\n\n');

  const referenceText = reference ? `\nReference answer:\n${reference.slice(0, 2000)}\n` : '';

  const baseInstructions = `You are an expert judge. Evaluate the following response using the rubric trees (main rubric + sub-criteria). Respond with JSON: {"rubrics": {"citations": 8, ...}, "criteria": {"citations": {"completeness": 4, ...}}, "overallScore": 0.75, "feedback": "..."} overallScore is 0-1.`;
  const evolvedInstructions = await getLatestPrompt('local_judge', baseInstructions);

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: evolvedInstructions,
        },
        {
          role: 'user',
          content: `Rubric trees:\n${rubricText}\n${referenceText}\nResponse to evaluate:\n${content.slice(0, 4000)}\nEvaluate:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 800,
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

// ─── S16-06: JudgeArena calibration ──────────────────────────────────────────

/**
 * Calibrate the local judge against a set of ground-truth scores using
 * JudgeArena's statistical methods (Cohen's κ + Spearman ρ).
 *
 * Given the judge's past scores and the corresponding ground-truth scores,
 * this computes the judge's reliability. If κ < 0.4 a warning is logged
 * indicating the judge needs recalibration.
 *
 * @param scores - Past judge scores (0-1)
 * @param groundTruth - Corresponding ground-truth scores (0-1)
 * @returns Calibration summary with κ, ρ, and a reliability bucket
 */
export async function calibrateLocalJudge(
  scores: number[],
  groundTruth: number[],
): Promise<{ kappa: number; rho: number; reliability: 'high' | 'medium' | 'low' }> {
  const evaluations: ArenaJudgeEvaluation[] = scores.map((s) => ({
    judgeId: 'local-judge',
    score: s,
    reasoning: '',
  }));
  const calibration: ArenaJudgeCalibration = calibrateJudge(evaluations, groundTruth);
  if (calibration.cohensKappa < 0.4) {
    console.warn(
      `[LocalJudge] Low calibration: κ=${calibration.cohensKappa.toFixed(2)} — consider recalibration`,
    );
  }
  return {
    kappa: calibration.cohensKappa,
    rho: calibration.spearmanRho,
    reliability: calibration.reliability,
  };
}
