/**
 * Dynamic DAG Planner — NomosX
 *
 * Implémente la replanification dynamique du pipeline (pattern D2Plan).
 * Au lieu d'un pipeline statique (SCOUT → RANK → READER → ANALYST → ...),
 * le planner génère un DAG (Directed Acyclic Graph) d'étapes qui peut être
 * ré-évalué et modifié en cours d'exécution.
 *
 * Patterns :
 * - D2Plan (arXiv 2026) : hierarchical planning-execution with replanning
 * - COMPASS : LLM as controller
 * - LLMCompiler : parallel step execution
 *
 * Le planner :
 * 1. Génère un plan initial basé sur la query (quelles étapes, dans quel ordre)
 * 2. Après chaque étape, évalue si le plan doit être modifié
 * 3. Peut ajouter/supprimer/réorganiser des étapes en cours de route
 *
 * Exemples de replanification :
 * - Si SCOUT trouve peu de sources → ajouter une étape "broaden_search"
 * - Si READER trouve des contradictions → ajouter une étape "debate" avant ANALYST
 * - Si l'ANALYST identifie un gap méthodologique → ajouter "quant_analysis"
 * - Si le budget est presque épuisé → supprimer les étapes optionnelles
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type StepType =
  | 'scout'
  | 'rank'
  | 'reader'
  | 'analyst'
  | 'debate'
  | 'devils_advocate'
  | 'critical_loop'
  | 'hypothesis_judge'
  | 'fact_check'
  | 'knowledge_graph'
  | 'quant_analysis'
  | 'editor'
  | 'publisher'
  | 'gap_fill'
  | 'broaden_search'
  | 'meta_analysis'
  | 'harvard_council'
  | 'self_correction';

export interface PipelineStep {
  id: string;
  type: StepType;
  /** Display name */
  label: string;
  /** Whether this step is required (false = can be skipped if budget is tight) */
  required: boolean;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Estimated duration in seconds */
  estimatedDurationSec: number;
  /** Dependencies (step IDs that must complete first) */
  dependsOn: string[];
  /** Whether this step has been completed */
  completed: boolean;
  /** Result summary (filled after completion) */
  resultSummary?: string;
}

export interface PipelineDAG {
  steps: PipelineStep[];
  /** Total estimated cost */
  totalEstimatedCost: number;
  /** Plan version (incremented on each replan) */
  version: number;
  /** Why this plan was chosen */
  rationale: string;
}

export interface ReplanContext {
  query: string;
  currentDAG: PipelineDAG;
  /** Step that just completed */
  completedStepId: string;
  /** Result of the completed step */
  stepResult: {
    success: boolean;
    summary: string;
    metrics?: Record<string, number>;
  };
  /** Current cost so far */
  currentCostUsd: number;
  /** Budget cap */
  budgetCapUsd: number;
  /** Whether to use LLM for replanning (false = rule-based only) */
  useLLMReplan: boolean;
}

// ─── Initial Plan Generation ────────────────────────────────────────────────

/**
 * Generate an initial pipeline DAG based on the query.
 * For now, this is the standard pipeline, but it could be customized
 * by an LLM based on the query type.
 */
export function generateInitialPlan(
  query: string,
  options: {
    isStrategic: boolean;
    enableDebate: boolean;
    enableDevilsAdvocate: boolean;
    enableHarvardCouncil: boolean;
    enableMetaAnalysis: boolean;
    budgetCapUsd: number;
  }
): PipelineDAG {
  const steps: PipelineStep[] = [];
  const isStrat = options.isStrategic;

  // Core steps (always required)
  steps.push({
    id: 'scout',
    type: 'scout',
    label: 'SCOUT — Source collection',
    required: true,
    estimatedCostUsd: 0.02,
    estimatedDurationSec: 30,
    dependsOn: [],
    completed: false,
  });

  steps.push({
    id: 'rank',
    type: 'rank',
    label: 'RANK — Source ranking & filtering',
    required: true,
    estimatedCostUsd: 0.01,
    estimatedDurationSec: 10,
    dependsOn: ['scout'],
    completed: false,
  });

  steps.push({
    id: 'reader',
    type: 'reader',
    label: 'READER — Claim extraction',
    required: true,
    estimatedCostUsd: isStrat ? 0.15 : 0.08,
    estimatedDurationSec: isStrat ? 120 : 60,
    dependsOn: ['rank'],
    completed: false,
  });

  // Optional steps
  if (options.enableDevilsAdvocate) {
    steps.push({
      id: 'devils_advocate',
      type: 'devils_advocate',
      label: "DEVIL'S ADVOCATE — Adversarial challenge",
      required: false,
      estimatedCostUsd: 0.05,
      estimatedDurationSec: 45,
      dependsOn: ['reader'],
      completed: false,
    });
  }

  if (options.enableDebate) {
    steps.push({
      id: 'debate',
      type: 'debate',
      label: 'DEBATE — Structured controversy analysis',
      required: false,
      estimatedCostUsd: 0.08,
      estimatedDurationSec: 60,
      dependsOn: ['reader'],
      completed: false,
    });
  }

  // Analyst (required)
  steps.push({
    id: 'analyst',
    type: 'analyst',
    label: isStrat ? 'ANALYST — Strategic synthesis' : 'ANALYST — Multi-pass analysis',
    required: true,
    estimatedCostUsd: isStrat ? 0.40 : 0.20,
    estimatedDurationSec: isStrat ? 300 : 120,
    dependsOn: ['reader', 'devils_advocate', 'debate'].filter(id =>
      steps.some(s => s.id === id)
    ),
    completed: false,
  });

  // Post-analyst steps
  steps.push({
    id: 'gap_fill',
    type: 'gap_fill',
    label: 'GAP FILL — Targeted re-search for evidence gaps',
    required: false,
    estimatedCostUsd: 0.05,
    estimatedDurationSec: 40,
    dependsOn: ['analyst'],
    completed: false,
  });

  if (options.enableMetaAnalysis && isStrat) {
    steps.push({
      id: 'meta_analysis',
      type: 'meta_analysis',
      label: 'META ANALYSIS — Cross-source pattern synthesis',
      required: false,
      estimatedCostUsd: 0.10,
      estimatedDurationSec: 60,
      dependsOn: ['analyst'],
      completed: false,
    });
  }

  if (options.enableHarvardCouncil && isStrat) {
    steps.push({
      id: 'harvard_council',
      type: 'harvard_council',
      label: 'HARVARD COUNCIL — Expert panel deliberation',
      required: false,
      estimatedCostUsd: 0.25,
      estimatedDurationSec: 180,
      dependsOn: ['analyst'],
      completed: false,
    });
  }

  // Editor (required)
  steps.push({
    id: 'editor',
    type: 'editor',
    label: 'EDITOR — HTML rendering & formatting',
    required: true,
    estimatedCostUsd: 0.02,
    estimatedDurationSec: 15,
    dependsOn: ['analyst', 'gap_fill', 'meta_analysis', 'harvard_council'].filter(id =>
      steps.some(s => s.id === id)
    ),
    completed: false,
  });

  const totalEstimatedCost = steps.reduce((sum, s) => sum + s.estimatedCostUsd, 0);

  return {
    steps,
    totalEstimatedCost,
    version: 1,
    rationale: isStrat
      ? 'Strategic analysis pipeline with full verification and deliberation layers'
      : 'Standard brief pipeline with optional debate and gap-fill',
  };
}

// ─── Dynamic Replanning ─────────────────────────────────────────────────────

/**
 * Re-evaluate the plan after a step completes.
 * Can add, remove, or reorder steps based on the result.
 */
export async function replanDAG(ctx: ReplanContext): Promise<PipelineDAG> {
  const { currentDAG, completedStepId, stepResult, currentCostUsd, budgetCapUsd } = ctx;

  // Mark the completed step
  const newSteps = currentDAG.steps.map(s =>
    s.id === completedStepId
      ? { ...s, completed: true, resultSummary: stepResult.summary }
      : s
  );

  // Rule-based replanning (fast, deterministic)
  let replannedSteps = applyReplanRules(newSteps, ctx);

  // LLM-based replanning (if enabled and budget allows)
  if (ctx.useLLMReplan && budgetCapUsd - currentCostUsd > 0.20) {
    try {
      const llmPlan = await llmReplan(ctx, replannedSteps);
      if (llmPlan) {
        replannedSteps = llmPlan;
      }
    } catch (err) {
      console.warn('[DAGPlanner] LLM replan failed, using rule-based:', err);
    }
  }

  // Budget check: remove optional steps if we're over budget
  const remainingBudget = budgetCapUsd - currentCostUsd;
  if (remainingBudget < 0.30) {
    replannedSteps = pruneOptionalSteps(replannedSteps, remainingBudget);
  }

  const totalEstimatedCost = replannedSteps.reduce((sum, s) => sum + s.estimatedCostUsd, 0);

  return {
    steps: replannedSteps,
    totalEstimatedCost,
    version: currentDAG.version + 1,
    rationale: `Replanned after ${completedStepId} (v${currentDAG.version} → v${currentDAG.version + 1})`,
  };
}

// ─── Rule-Based Replan Rules ────────────────────────────────────────────────

function applyReplanRules(steps: PipelineStep[], ctx: ReplanContext): PipelineStep[] {
  const { completedStepId, stepResult, currentCostUsd, budgetCapUsd } = ctx;
  const newSteps = [...steps];

  // Rule 1: After SCOUT — if few sources found, add broaden_search
  if (completedStepId === 'scout' && (stepResult.metrics?.sourcesFound ?? 0) < 10) {
    if (!newSteps.some(s => s.type === 'broaden_search')) {
      const broadenStep: PipelineStep = {
        id: 'broaden_search',
        type: 'broaden_search',
        label: 'BROADEN SEARCH — Expanded query terms (auto-added by replanner)',
        required: true,
        estimatedCostUsd: 0.02,
        estimatedDurationSec: 30,
        dependsOn: ['scout'],
        completed: false,
      };
      // Insert after scout, before rank
      const rankIdx = newSteps.findIndex(s => s.id === 'rank');
      if (rankIdx >= 0) {
        newSteps.splice(rankIdx, 0, broadenStep);
        // Update rank's dependencies
        newSteps[rankIdx + 1] = { ...newSteps[rankIdx + 1], dependsOn: ['broaden_search'] };
      }
      console.log('[DAGPlanner] Rule: added broaden_search (few sources found)');
    }
  }

  // Rule 2: After READER — if contradictions detected, add debate (if not already present)
  if (completedStepId === 'reader' && (stepResult.metrics?.contradictions ?? 0) > 0) {
    if (!newSteps.some(s => s.type === 'debate')) {
      const debateStep: PipelineStep = {
        id: 'debate_auto',
        type: 'debate',
        label: 'DEBATE (auto) — Resolve detected contradictions',
        required: true,
        estimatedCostUsd: 0.08,
        estimatedDurationSec: 60,
        dependsOn: ['reader'],
        completed: false,
      };
      // Insert before analyst
      const analystIdx = newSteps.findIndex(s => s.id === 'analyst');
      if (analystIdx >= 0) {
        newSteps.splice(analystIdx, 0, debateStep);
        newSteps[analystIdx + 1] = {
          ...newSteps[analystIdx + 1],
          dependsOn: [...newSteps[analystIdx + 1].dependsOn, 'debate_auto'],
        };
      }
      console.log('[DAGPlanner] Rule: added debate (contradictions detected)');
    }
  }

  // Rule 3: After ANALYST — if citation coverage is low, add self_correction
  if (completedStepId === 'analyst' && (stepResult.metrics?.citationCoverage || 1) < 0.5) {
    if (!newSteps.some(s => s.type === 'self_correction')) {
      const correctionStep: PipelineStep = {
        id: 'self_correction_auto',
        type: 'self_correction',
        label: 'SELF-CORRECTION (auto) — Low citation coverage detected',
        required: true,
        estimatedCostUsd: 0.10,
        estimatedDurationSec: 90,
        dependsOn: ['analyst'],
        completed: false,
      };
      const editorIdx = newSteps.findIndex(s => s.id === 'editor');
      if (editorIdx >= 0) {
        newSteps.splice(editorIdx, 0, correctionStep);
        newSteps[editorIdx + 1] = {
          ...newSteps[editorIdx + 1],
          dependsOn: [...newSteps[editorIdx + 1].dependsOn, 'self_correction_auto'],
        };
      }
      console.log('[DAGPlanner] Rule: added self_correction (low citation coverage)');
    }
  }

  return newSteps;
}

// ─── LLM-Based Replan ───────────────────────────────────────────────────────

async function llmReplan(
  ctx: ReplanContext,
  currentSteps: PipelineStep[]
): Promise<PipelineStep[] | null> {
  const { query, completedStepId, stepResult, currentCostUsd, budgetCapUsd } = ctx;

  const remainingBudget = budgetCapUsd - currentCostUsd;
  const pendingSteps = currentSteps.filter(s => !s.completed);

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are the dynamic pipeline planner for a research analysis system. A step just completed and you need to decide if the plan should change.

Research question: "${query}"

Completed step: ${completedStepId}
Result: ${stepResult.success ? 'SUCCESS' : 'FAILURE'} — ${stepResult.summary}
Metrics: ${JSON.stringify(stepResult.metrics || {})}

Current cost: $${currentCostUsd.toFixed(4)}
Remaining budget: $${remainingBudget.toFixed(4)}

Pending steps:
${pendingSteps.map(s => `- ${s.id} (${s.type}, required=${s.required}, est=$${s.estimatedCostUsd.toFixed(3)})`).join('\n')}

Decide if the plan should change. Respond with JSON:
{
  "action": "keep" | "modify",
  "addSteps": [{"id": "...", "type": "...", "label": "...", "reason": "..."}],
  "removeSteps": ["step_id_to_remove"],
  "reasoning": "..."
}

Only suggest changes if there's a clear reason. "keep" is the default.
Valid step types: scout, rank, reader, analyst, debate, devils_advocate, critical_loop, hypothesis_judge, fact_check, knowledge_graph, quant_analysis, gap_fill, broaden_search, meta_analysis, self_correction`,
      },
      { role: 'user', content: 'Should the plan change?' },
    ],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 600,
    task: 'enrichment_reasoner',
  });

  const parsed = parseJson<{
    action: 'keep' | 'modify';
    addSteps: Array<{ id: string; type: StepType; label: string; reason: string }>;
    removeSteps: string[];
    reasoning: string;
  }>(response.content);

  if (!parsed || parsed.action === 'keep') {
    return null;
  }

  let newSteps = [...currentSteps];

  // Remove steps
  if (parsed.removeSteps?.length) {
    newSteps = newSteps.filter(s => !parsed.removeSteps.includes(s.id));
    console.log(`[DAGPlanner] LLM removed: ${parsed.removeSteps.join(', ')}`);
  }

  // Add steps
  if (parsed.addSteps?.length) {
    for (const newStep of parsed.addSteps) {
      if (!newSteps.some(s => s.id === newStep.id)) {
        newSteps.push({
          id: newStep.id,
          type: newStep.type,
          label: newStep.label,
          required: false,
          estimatedCostUsd: 0.05, // Default estimate
          estimatedDurationSec: 60,
          dependsOn: [completedStepId],
          completed: false,
        });
        console.log(`[DAGPlanner] LLM added: ${newStep.id} (${newStep.reason})`);
      }
    }
  }

  return newSteps;
}

// ─── Prune Optional Steps (budget pressure) ─────────────────────────────────

function pruneOptionalSteps(steps: PipelineStep[], remainingBudget: number): PipelineStep[] {
  // Sort optional steps by cost (most expensive first = prune first)
  const optionalSteps = steps.filter(s => !s.required && !s.completed);
  optionalSteps.sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  let budget = remainingBudget;
  const toRemove = new Set<string>();

  for (const step of optionalSteps) {
    if (budget < 0.20) {
      toRemove.add(step.id);
      console.log(`[DAGPlanner] Budget prune: removing ${step.id} (saves $${step.estimatedCostUsd.toFixed(3)})`);
    } else {
      budget -= step.estimatedCostUsd;
    }
  }

  return steps.filter(s => !toRemove.has(s.id));
}

// ─── Get Next Executable Steps ──────────────────────────────────────────────

/**
 * Returns the steps that can be executed now (all dependencies completed).
 * Used by the pipeline executor to know what to run next.
 */
export function getNextSteps(dag: PipelineDAG): PipelineStep[] {
  const completedIds = new Set(dag.steps.filter(s => s.completed).map(s => s.id));
  return dag.steps.filter(s =>
    !s.completed &&
    s.dependsOn.every(depId => completedIds.has(depId))
  );
}

// ─── DAG Summary (for logging/dashboard) ────────────────────────────────────

export function summarizeDAG(dag: PipelineDAG): string {
  const completed = dag.steps.filter(s => s.completed).length;
  const total = dag.steps.length;
  const pending = dag.steps.filter(s => !s.completed);
  const next = getNextSteps(dag);
  return `DAG v${dag.version}: ${completed}/${total} done, ${pending.length} pending, next: ${next.map(s => s.id).join(', ') || 'none'}`;
}
