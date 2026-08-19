/**
 * Budget Forcing — NomosX Sprint 6 (Gap 10)
 *
 * Test-time scaling via budget forcing.
 * Inspiré de :
 * - s1: Simple Test-Time Scaling (Stanford, EMNLP 2025, arxiv 2501.19393)
 * - LIMO (GAIR, COLM 2025) — Less is More for Reasoning
 * - DeepSeek-R1 (arxiv 2501.12948) — reasoning emergence via RL
 *
 * Le problème :
 * Le ReAct loop a `max_steps` et `max_cost` comme *hard caps*. Quand le budget
 * est atteint, l'agent est forcé de produire une réponse immédiatement, même si
 * le raisonnement n'est pas terminé. s1 montre le *budget forcing* :
 * - Forcer l'agent à *continuer* la réflexion ("Wait, let me reconsider...")
 * - Forcer l'agent à *s'arrêter* et produire la réponse
 *
 * Architecture :
 * 1. Si le PRM prédit une qualité faible (< seuil), étendre le reasoning
 *    en injectant "Wait" tokens pour forcer plus de réflexion
 * 2. Si l'agent boucle sans progresser, forcer la synthèse
 * 3. Si le budget est épuisé mais la qualité est prometteuse, permettre
 *    une extension contrôlée (max 30% de budget supplémentaire)
 *
 * Intégration : utilisé par le ReAct loop et le Witness.
 */

import { callLLM } from '../llm/unified-llm';
import type { LLMRequest } from '../llm/unified-llm';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BudgetForcingAction =
  | 'extend_reasoning'    // Inject "Wait" to continue reasoning
  | 'force_synthesis'     // Force the agent to produce output now
  | 'reduce_scope'        // Reduce the scope to fit the budget
  | 'abort'               // Abort — quality too low to continue
  | 'continue';           // No intervention needed

export interface BudgetForcingDecision {
  action: BudgetForcingAction;
  reason: string;
  /** How much additional budget to allow (for extend_reasoning) */
  additionalBudgetUsd?: number;
  /** The token to inject (for extend_reasoning) */
  injectionToken?: string;
  /** Confidence in the decision (0-1) */
  confidence: number;
}

export interface BudgetForcingConfig {
  /** PRM score threshold below which to extend reasoning */
  extendReasoningThreshold: number;
  /** PRM score threshold below which to abort */
  abortThreshold: number;
  /** Max additional budget as fraction of original (default: 0.3 = 30%) */
  maxBudgetExtension: number;
  /** Max steps extension (default: 3) */
  maxStepsExtension: number;
  /** Whether budget forcing is enabled */
  enabled: boolean;
}

export const DEFAULT_BUDGET_FORCING_CONFIG: BudgetForcingConfig = {
  extendReasoningThreshold: 0.5,
  abortThreshold: 0.2,
  maxBudgetExtension: 0.3,
  maxStepsExtension: 3,
  enabled: true,
};

// ─── Wait Tokens (s1-style) ─────────────────────────────────────────────────

/**
 * The "Wait" tokens that s1 uses to force the model to continue reasoning.
 * These are injected when the model tries to end its reasoning too early.
 */
export const WAIT_TOKENS = [
  'Wait, let me reconsider this more carefully.',
  'Hmm, but I should also consider...',
  'Actually, let me think about this from another angle.',
  'Let me verify this claim before proceeding.',
  'Wait, I need to check if there are counter-arguments to this.',
  'Before concluding, let me reconsider the evidence.',
  'Hold on — am I missing something important here?',
];

/**
 * Get a "Wait" token to inject for extended reasoning.
 * Rotates through different tokens to avoid repetition.
 */
export function getWaitToken(step: number): string {
  return WAIT_TOKENS[step % WAIT_TOKENS.length];
}

// ─── Budget Forcing Decision ────────────────────────────────────────────────

/**
 * Decide what budget forcing action to take based on the current state.
 *
 * @param prmScore - Current PRM score (0-1)
 * @param step - Current step
 * @param maxSteps - Max steps
 * @param costUsd - Current cost
 * @param budgetCapUsd - Budget cap
 * @param progressScore - How much progress the agent is making (0-1)
 * @param config - Budget forcing config
 */
export function decideBudgetForcing(
  prmScore: number,
  step: number,
  maxSteps: number,
  costUsd: number,
  budgetCapUsd: number,
  progressScore: number,
  config: BudgetForcingConfig = DEFAULT_BUDGET_FORCING_CONFIG,
): BudgetForcingDecision {
  if (!config.enabled) {
    return { action: 'continue', reason: 'Budget forcing disabled', confidence: 1 };
  }

  const budgetUsedPct = budgetCapUsd > 0 ? (costUsd / budgetCapUsd) * 100 : 0;
  const stepsUsedPct = (step / maxSteps) * 100;

  // Case 1: PRM score is very low — abort
  if (prmScore < config.abortThreshold && step > 3) {
    return {
      action: 'abort',
      reason: `PRM score ${prmScore.toFixed(2)} < ${config.abortThreshold} — quality too low to continue`,
      confidence: 0.9,
    };
  }

  // Case 2: Budget almost exhausted and quality is promising — extend
  if (budgetUsedPct > 90 && prmScore > config.extendReasoningThreshold && prmScore < 0.8) {
    const additionalBudget = budgetCapUsd * config.maxBudgetExtension;
    return {
      action: 'extend_reasoning',
      reason: `Budget ${budgetUsedPct.toFixed(0)}% used, PRM ${prmScore.toFixed(2)} is promising — extending by $${additionalBudget.toFixed(4)}`,
      additionalBudgetUsd: additionalBudget,
      injectionToken: getWaitToken(step),
      confidence: 0.7,
    };
  }

  // Case 3: Steps almost exhausted and quality is low — extend reasoning
  if (stepsUsedPct > 80 && prmScore < config.extendReasoningThreshold && progressScore > 0.3) {
    return {
      action: 'extend_reasoning',
      reason: `Steps ${stepsUsedPct.toFixed(0)}% used, PRM ${prmScore.toFixed(2)} < ${config.extendReasoningThreshold} — extending reasoning`,
      injectionToken: getWaitToken(step),
      confidence: 0.6,
    };
  }

  // Case 4: Agent is looping without progress — force synthesis
  if (progressScore < 0.1 && step > 5) {
    return {
      action: 'force_synthesis',
      reason: `Progress score ${progressScore.toFixed(2)} — agent is stuck, forcing synthesis`,
      confidence: 0.8,
    };
  }

  // Case 5: Budget is exhausted — force synthesis
  if (budgetUsedPct >= 100) {
    return {
      action: 'force_synthesis',
      reason: `Budget exhausted (${budgetUsedPct.toFixed(0)}%) — forcing synthesis`,
      confidence: 1,
    };
  }

  // Case 6: Steps exhausted — force synthesis
  if (step >= maxSteps) {
    return {
      action: 'force_synthesis',
      reason: `Max steps (${maxSteps}) reached — forcing synthesis`,
      confidence: 1,
    };
  }

  // Default: continue
  return {
    action: 'continue',
    reason: 'No intervention needed',
    confidence: 1,
  };
}

// ─── Extended Reasoning Injection ───────────────────────────────────────────

/**
 * Inject a "Wait" token into the message history to extend reasoning.
 * This is the s1 budget forcing technique.
 *
 * @param messages - Current message history
 * @param step - Current step
 * @param goalReminder - The goal to remind the agent of
 * @returns The modified message history
 */
export function injectWaitToken(
  messages: LLMRequest['messages'],
  step: number,
  goalReminder?: string,
): LLMRequest['messages'] {
  const waitToken = getWaitToken(step);
  const reminder = goalReminder ? ` Remember your goal: ${goalReminder.slice(0, 150)}.` : '';

  return [
    ...messages,
    {
      role: 'user',
      content: `[BUDGET FORCING — s1-style] ${waitToken}${reminder} Take more time to think before producing your final answer.`,
    },
  ];
}

// ─── Progress Score Calculation ─────────────────────────────────────────────

/**
 * Calculate how much progress the agent is making.
 * A low progress score indicates the agent is looping without making progress.
 *
 * @param recentThoughts - The agent's recent thoughts (last 3-5)
 * @returns Progress score (0-1)
 */
export function calculateProgressScore(recentThoughts: string[]): number {
  if (recentThoughts.length < 2) return 1;

  // Simple heuristic: measure how much new information is in each thought
  const uniqueWords = new Set<string>();
  let totalWords = 0;

  for (const thought of recentThoughts) {
    const words = thought.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    totalWords += words.length;
    for (const w of words) uniqueWords.add(w);
  }

  if (totalWords === 0) return 0;

  // High uniqueness ratio = high progress
  const uniquenessRatio = uniqueWords.size / totalWords;

  // Also check for repetition patterns
  const lastThought = recentThoughts[recentThoughts.length - 1];
  const previousThoughts = recentThoughts.slice(0, -1);
  const maxSimilarity = Math.max(
    ...previousThoughts.map(t => jaccardSimilarity(lastThought, t))
  );

  // Progress = uniqueness * (1 - max_similarity)
  return uniquenessRatio * (1 - maxSimilarity);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// ─── LLM-based Budget Forcing (advanced) ────────────────────────────────────

/**
 * Use an LLM to make a more sophisticated budget forcing decision.
 * This is used when the rule-based decision is ambiguous.
 */
export async function llmDecideBudgetForcing(
  query: string,
  currentReasoning: string,
  prmScore: number,
  step: number,
  maxSteps: number,
  budgetUsedPct: number,
  config: BudgetForcingConfig = DEFAULT_BUDGET_FORCING_CONFIG,
): Promise<BudgetForcingDecision> {
  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a Budget Forcing decision maker (s1-style test-time scaling).

Given the current state of an agent's reasoning, decide whether to:
- "extend_reasoning": The agent is on the right track but needs more time. Inject a "Wait" token.
- "force_synthesis": The agent has enough information. Force it to produce output.
- "reduce_scope": The agent is trying to do too much. Reduce the scope.
- "abort": The agent is producing low-quality output. Abort.
- "continue": No intervention needed.

Respond with JSON:
{
  "action": "extend_reasoning" | "force_synthesis" | "reduce_scope" | "abort" | "continue",
  "reason": "brief explanation",
  "confidence": 0.8
}`,
        },
        {
          role: 'user',
          content: `Query: "${query.slice(0, 200)}"
Step: ${step}/${maxSteps}
Budget used: ${budgetUsedPct.toFixed(0)}%
PRM score: ${prmScore.toFixed(2)}

Current reasoning (last 500 chars):
${currentReasoning.slice(-500)}

What should we do?`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 150,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJsonBudgetForcing(response.content);
    if (parsed) {
      if (parsed.action === 'extend_reasoning') {
        parsed.injectionToken = getWaitToken(step);
        parsed.additionalBudgetUsd = budgetCapUsdFromPct(budgetUsedPct, config);
      }
      return parsed;
    }
  } catch (err) {
    console.warn('[BudgetForcing] LLM decision failed:', err);
  }

  // Fallback to rule-based
  return decideBudgetForcing(prmScore, step, maxSteps, 0, 1, 0.5, config);
}

function parseJsonBudgetForcing(content: string): BudgetForcingDecision | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.action === 'string') {
      return {
        action: parsed.action as BudgetForcingAction,
        reason: parsed.reason || '',
        confidence: parsed.confidence || 0.5,
      };
    }
  } catch {
    // try with fence stripping
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed.action === 'string') {
        return {
          action: parsed.action as BudgetForcingAction,
          reason: parsed.reason || '',
          confidence: parsed.confidence || 0.5,
        };
      }
    } catch {
      // give up
    }
  }
  return null;
}

function budgetCapUsdFromPct(budgetUsedPct: number, config: BudgetForcingConfig): number {
  // Estimate additional budget based on how much is left
  const remaining = (100 - budgetUsedPct) / 100;
  return remaining * config.maxBudgetExtension;
}

// ─── Prompt instruction ─────────────────────────────────────────────────────

/**
 * Instruction string to inject into the system prompt when budget forcing is enabled.
 */
export function budgetForcingInstruction(): string {
  return `\n=== BUDGET FORCING ===\nYour reasoning budget is limited. If you find yourself stuck or looping, stop and produce the best answer you can. If you have time remaining and the answer is not yet solid, use "Wait, let me reconsider this more carefully." to extend your reasoning before finalizing.\n=== END BUDGET FORCING ===`;
}
