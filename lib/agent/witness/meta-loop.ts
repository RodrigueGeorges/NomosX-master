/**
 * Witness Meta-Loop & Cross-Run Learning — NomosX
 *
 * La méta-loop (MONITOR → ASSESS → CONTROL) tourne au-dessus du cycle
 * cognitif. Elle observe la santé globale du run, pas juste une étape.
 *
 * L'auto-amélioration entre les runs : après chaque pipeline run, le Witness
 * extrait des leçons et propose des modifications de prompts et de seuils
 * pour les runs futurs. C'est la couche 4 — le système apprend à mieux
 * fonctionner, pas juste à se corriger dans le moment.
 *
 * Patterns :
 * - Sakshi Witness pattern (méta-cognition)
 * - HyperAgents (self-referential improvement)
 * - MIDCA (metacognitive monitoring + control)
 * - ERL (Experience-based Reinforcement Learning)
 */

import { callLLM } from '../../llm/unified-llm';
import { captureInputFifo } from '../frozen-inputs';
import { parseJson } from '../json-utils';
import { prisma } from '../../db';
import { optimizeAllPrompts } from '../prompt-optimizer';
import type {
  WitnessState,
  RunLearning,
  PromptModification,
  ThresholdAdjustment,
  AnomalyType,
  CycleTrace,
} from './types';
import type { Witness } from './cognitive-cycle';

// ─── Meta-Loop ──────────────────────────────────────────────────────────────

export interface MetaLoopResult {
  phase: 'MONITOR' | 'ASSESS' | 'CONTROL';
  healthScore: number;
  totalAnomalies: number;
  totalInterventions: number;
  budgetUsedPct: number;
  recommendation: 'continue' | 'reduce_scope' | 'abort' | 'proceed_with_caution';
  reason: string;
}

/**
 * Run the meta-loop after each cognitive cycle.
 * This is the "big picture" view — is the overall run healthy?
 */
export async function runMetaLoop(
  witness: Witness,
  state: WitnessState,
): Promise<MetaLoopResult> {
  const healthScore = witness.getHealthScore();
  const totalAnomalies = witness.getTotalAnomalies();
  const totalInterventions = witness.getTotalInterventions();
  const budgetUsedPct = state.budgetCapUsd > 0 ? (state.totalCostUsd / state.budgetCapUsd) * 100 : 0;

  // MONITOR — collect overall metrics
  const monitorResult: MetaLoopResult = {
    phase: 'MONITOR',
    healthScore,
    totalAnomalies,
    totalInterventions,
    budgetUsedPct,
    recommendation: 'continue',
    reason: '',
  };

  // ASSESS — evaluate overall health
  let recommendation: MetaLoopResult['recommendation'] = 'continue';
  let reason = 'Run is healthy';

  if (healthScore < 30) {
    recommendation = 'abort';
    reason = `Health score ${healthScore}/100 is critically low — too many anomalies`;
  } else if (healthScore < 50) {
    recommendation = 'reduce_scope';
    reason = `Health score ${healthScore}/100 is low — reducing scope to preserve quality`;
  } else if (budgetUsedPct > 90) {
    recommendation = 'proceed_with_caution';
    reason = `Budget ${budgetUsedPct.toFixed(0)}% used — approaching limit`;
  } else if (totalAnomalies > 5 && totalInterventions === 0) {
    recommendation = 'proceed_with_caution';
    reason = `${totalAnomalies} anomalies but no interventions — check if Witness canIntervene is enabled`;
  }

  // CONTROL — emit recommendation
  const result: MetaLoopResult = {
    ...monitorResult,
    phase: 'CONTROL',
    recommendation,
    reason,
  };

  if (recommendation !== 'continue') {
    console.log(`[Witness/MetaLoop] ${recommendation.toUpperCase()}: ${reason}`);
  }

  return result;
}

// ─── Cross-Run Learning ─────────────────────────────────────────────────────

/**
 * After a pipeline run completes, extract learnings for future runs.
 * This is the key to self-improvement: the Witness doesn't just observe
 * one run — it learns patterns across runs.
 */
export async function extractRunLearning(
  runId: string,
  query: string,
  witness: Witness,
): Promise<RunLearning> {
  const state = witness.getState();
  const cycleTraces = state.cycleTraces;

  // Collect successes and failures
  const successes: string[] = [];
  const failures: string[] = [];
  for (const trace of cycleTraces) {
    if (trace.assessment.onTrack) {
      successes.push(`${trace.pipelineStep}: on track`);
    } else {
      failures.push(`${trace.pipelineStep}: ${trace.assessment.issues.join('; ')}`);
    }
  }

  // Find recurring anomalies
  const anomalyCounts: Record<string, number> = {};
  for (const anomaly of state.anomalies) {
    anomalyCounts[anomaly.type] = (anomalyCounts[anomaly.type] || 0) + 1;
  }
  const recurringAnomalies = Object.entries(anomalyCounts)
    .filter(([_, count]) => count >= 2)
    .map(([type]) => type as AnomalyType);

  // LLM-based learning extraction
  let promptModifications: PromptModification[] = [];
  let thresholdAdjustments: ThresholdAdjustment[] = [];
  let qualityScore = 100 - (state.anomalies.length * 5);
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  if (state.anomalies.length > 0) {
    try {
      const learning = await llmExtractLearning(query, state);
      promptModifications = learning.promptModifications;
      thresholdAdjustments = learning.thresholdAdjustments;
      if (learning.qualityScore !== undefined) {
        qualityScore = learning.qualityScore;
      }
    } catch (err) {
      console.warn('[Witness/Learning] LLM extraction failed:', err);
      // Fallback: rule-based suggestions
      promptModifications = ruleBasedPromptMods(state);
      thresholdAdjustments = ruleBasedThresholdAdjustments(state);
    }
  }

  const learning: RunLearning = {
    runId,
    query,
    successes,
    failures,
    recurringAnomalies,
    promptModifications,
    thresholdAdjustments,
    qualityScore,
    recommendsChanges: promptModifications.length > 0 || thresholdAdjustments.length > 0,
    timestamp: Date.now(),
  };

  // Persist the learning
  await persistRunLearning(learning);

  // Sprint 6: ADAS / Prompt Optimizer — optimize agent prompts from this run's learnings
  if (process.env.ENABLE_ADAS === 'true' && promptModifications.length > 0) {
    try {
      const feedbackByAgent = new Map([[
        'analyst',
        {
          prmScores: [qualityScore / 100],
          selfPlayLessons: failures,
          humanCorrections: [],
          witnessSuggestions: promptModifications.map(p => ({ agent: p.agentId || 'analyst', suggestedFragment: p.suggestedFragment, reason: p.reason, confidence: p.confidence })),
          selfCorrectionFeedback: [],
          criticFeedback: [],
          avgCitationCount: 0,
          avgTrustScore: 0,
          avgPrmReward: qualityScore / 100,
        },
      ]]);
      const optimized = await optimizeAllPrompts(feedbackByAgent);
      console.log(`[Witness/Learning] ADAS optimized ${optimized.length} prompts`);
    } catch (err) {
      console.warn('[Witness/Learning] ADAS prompt optimization failed:', err);
    }
  }

  return learning;
}

// ─── LLM-based Learning Extraction ──────────────────────────────────────────

async function llmExtractLearning(
  query: string,
  state: WitnessState,
): Promise<{
  promptModifications: PromptModification[];
  thresholdAdjustments: ThresholdAdjustment[];
  qualityScore?: number;
}> {
  const anomaliesSummary = state.anomalies.map(a =>
    `- [${a.severity}] ${a.type} on ${a.pipelineStep}: ${a.description}`
  ).join('\n');

  const interventionsSummary = state.interventions.map(i =>
    `- ${i.type} on ${i.pipelineStep}: ${i.reason} → ${i.result || 'pending'}`
  ).join('\n');

  // Prompt embeds accumulated run state (anomalies, interventions, health) —
  // freeze the response through the FIFO tape for record/replay parity.
  const response = await captureInputFifo('witness:run-learning', () => callLLM({
    messages: [
      {
        role: 'system',
        content: `You are the Witness — a metacognitive observer that learns from pipeline runs. Analyze what happened and propose concrete improvements for future runs.

Respond with JSON:
{
  "promptModifications": [
    {
      "agentId": "analyst",
      "currentFragment": "current prompt text",
      "suggestedFragment": "improved prompt text",
      "reason": "why this change helps",
      "confidence": 0.8
    }
  ],
  "thresholdAdjustments": [
    {
      "thresholdName": "MIN_SOURCES",
      "currentValue": 10,
      "suggestedValue": 15,
      "reason": "why this change helps",
      "confidence": 0.7
    }
  ],
  "qualityScore": 75
}

Guidelines:
- Only propose changes you're confident about (confidence > 0.5)
- Prompt modifications should be small, targeted additions (not full rewrites)
- Threshold adjustments should be conservative (max 30% change)
- qualityScore: 0-100, your assessment of this run's overall quality`,
      },
      {
        role: 'user',
        content: `Query: "${query}"

Anomalies detected (${state.anomalies.length}):
${anomaliesSummary}

Interventions (${state.interventions.length}):
${interventionsSummary || 'none'}

Health score: ${state.healthScore}/100
Total cost: $${state.totalCostUsd.toFixed(4)}

What should we learn from this run?`,
      },
    ],
    temperature: 0.3,
    jsonMode: true,
    maxTokens: 1000,
    task: 'enrichment_reasoner',
  }));

  const parsed = parseJson<{
    promptModifications: PromptModification[];
    thresholdAdjustments: ThresholdAdjustment[];
    qualityScore?: number;
  }>(response.content);

  return {
    promptModifications: parsed?.promptModifications || [],
    thresholdAdjustments: parsed?.thresholdAdjustments || [],
    qualityScore: parsed?.qualityScore,
  };
}

// ─── Rule-based Fallbacks ───────────────────────────────────────────────────

function ruleBasedPromptMods(state: WitnessState): PromptModification[] {
  const mods: PromptModification[] = [];

  // If citation gaps were detected, suggest a prompt modification
  const citationAnomalies = state.anomalies.filter(a => a.type === 'citation_gap');
  if (citationAnomalies.length > 0) {
    mods.push({
      agentId: 'analyst',
      currentFragment: '',
      suggestedFragment: 'IMPORTANT: Every factual claim MUST have a [SRC-N] citation. Uncited claims will be rejected.',
      reason: `${citationAnomalies.length} citation gap anomalies detected — analyst needs stronger citation enforcement`,
      confidence: 0.8,
    });
  }

  // If hallucination risks were detected
  const hallucinationAnomalies = state.anomalies.filter(a => a.type === 'hallucination_risk');
  if (hallucinationAnomalies.length > 0) {
    mods.push({
      agentId: 'analyst',
      currentFragment: '',
      suggestedFragment: 'If you are not certain about a fact, state "non établie" rather than guessing. Acknowledge uncertainty explicitly.',
      reason: `${hallucinationAnomalies.length} hallucination risk anomalies detected`,
      confidence: 0.7,
    });
  }

  return mods;
}

function ruleBasedThresholdAdjustments(state: WitnessState): ThresholdAdjustment[] {
  const adjustments: ThresholdAdjustment[] = [];

  // If budget depletion was a recurring issue, suggest raising the budget
  const budgetAnomalies = state.anomalies.filter(a => a.type === 'budget_depletion');
  if (budgetAnomalies.length >= 2) {
    adjustments.push({
      thresholdName: 'budgetCapUsd',
      currentValue: state.budgetCapUsd,
      suggestedValue: Math.round(state.budgetCapUsd * 1.2 * 100) / 100, // +20%
      reason: 'Budget depletion occurred multiple times — consider raising the cap',
      confidence: 0.7,
    });
  }

  // If cost overruns were frequent, suggest lowering the per-step cost expectation
  const costOverruns = state.anomalies.filter(a => a.type === 'cost_overrun');
  if (costOverruns.length >= 2) {
    adjustments.push({
      thresholdName: 'maxCostPerStepUsd',
      currentValue: 0.20,
      suggestedValue: 0.30,
      reason: 'Multiple cost overruns — the per-step cost expectations may be too low',
      confidence: 0.6,
    });
  }

  return adjustments;
}

// ─── Persist Run Learning ───────────────────────────────────────────────────

async function persistRunLearning(learning: RunLearning): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: 'witness',
        action: 'RUN_LEARNING',
        metadata: JSON.stringify({
          runId: learning.runId,
          query: learning.query.slice(0, 200),
          successes: learning.successes,
          failures: learning.failures,
          recurringAnomalies: learning.recurringAnomalies,
          promptModifications: learning.promptModifications,
          thresholdAdjustments: learning.thresholdAdjustments,
          qualityScore: learning.qualityScore,
          recommendsChanges: learning.recommendsChanges,
          timestamp: learning.timestamp,
        }),
      },
    });
    console.log(`[Witness/Learning] Persisted run learning: quality=${learning.qualityScore}/100, ${learning.promptModifications.length} prompt mods, ${learning.thresholdAdjustments.length} threshold adjustments`);
  } catch (err) {
    console.warn('[Witness/Learning] Failed to persist:', err);
  }
}

// ─── Get Past Learnings (for injection into future runs) ────────────────────

/**
 * Get learnings from past runs to inject into the current run.
 * This is how the Witness's cross-run learning feeds back into the pipeline.
 */
export async function getPastLearnings(
  options: { lookbackDays?: number; maxLearnings?: number } = {}
): Promise<{
  promptMods: PromptModification[];
  thresholdAdjustments: ThresholdAdjustment[];
  commonAnomalies: AnomalyType[];
}> {
  const { lookbackDays = 30, maxLearnings = 10 } = options;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const records = await prisma.agentAuditLog.findMany({
      where: {
        agent: 'witness',
        action: 'RUN_LEARNING',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: maxLearnings,
    });

    const allPromptMods: PromptModification[] = [];
    const allThresholdAdjustments: ThresholdAdjustment[] = [];
    const anomalyCounts: Record<string, number> = {};

    for (const record of records) {
      try {
        const m = JSON.parse(record.metadata || '{}');
        if (m.promptModifications) allPromptMods.push(...m.promptModifications);
        if (m.thresholdAdjustments) allThresholdAdjustments.push(...m.thresholdAdjustments);
        if (m.recurringAnomalies) {
          for (const a of m.recurringAnomalies) {
            anomalyCounts[a] = (anomalyCounts[a] || 0) + 1;
          }
        }
      } catch {}
    }

    // Deduplicate prompt mods by agentId + suggestedFragment
    const seen = new Set<string>();
    const uniquePromptMods = allPromptMods.filter(m => {
      const key = `${m.agentId}:${m.suggestedFragment.slice(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort threshold adjustments by confidence
    const sortedThresholds = allThresholdAdjustments.sort((a, b) => b.confidence - a.confidence);

    // Most common anomalies
    const commonAnomalies = Object.entries(anomalyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type]) => type as AnomalyType);

    return {
      promptMods: uniquePromptMods.slice(0, 5),
      thresholdAdjustments: sortedThresholds.slice(0, 3),
      commonAnomalies,
    };
  } catch (err) {
    console.warn('[Witness/Learning] Failed to fetch past learnings:', err);
    return { promptMods: [], thresholdAdjustments: [], commonAnomalies: [] };
  }
}

// ─── Build Learning Injection (for pipeline prompts) ────────────────────────

/**
 * Build a context block from past learnings to inject into pipeline prompts.
 * This is the feedback loop: past learnings → future run prompts.
 */
export async function buildLearningInjection(): Promise<string> {
  const { promptMods, commonAnomalies } = await getPastLearnings();

  if (promptMods.length === 0 && commonAnomalies.length === 0) {
    return '';
  }

  const parts: string[] = ['## WITNESS LEARNING — Lessons from past runs'];

  if (promptMods.length > 0) {
    parts.push('### Prompt improvements (from past run analysis):');
    for (const mod of promptMods) {
      parts.push(`- [${mod.agentId}] ${mod.suggestedFragment}`);
    }
  }

  if (commonAnomalies.length > 0) {
    parts.push('### Common issues to avoid:');
    for (const anomaly of commonAnomalies) {
      parts.push(`- ${anomaly.replace(/_/g, ' ')}`);
    }
  }

  return parts.join('\n');
}
