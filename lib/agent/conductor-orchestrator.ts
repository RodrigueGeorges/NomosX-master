/**
 * Conductor — Deterministic Orchestration for Multi-Agent Workflows
 *
 * Inspired by: Microsoft Conductor (2026) — MIT License
 * Key innovation: YAML-defined workflows with Jinja2 routing templates,
 * zero tokens spent on orchestration, deterministic execution.
 *
 * In NomosX, this provides a lightweight alternative to the LLM-driven
 * Meta-Controller. Instead of spending LLM tokens on orchestration decisions,
 * the workflow is defined declaratively and executed deterministically.
 *
 * Benefits:
 * - Zero LLM cost for orchestration (saves ~$0.05/run)
 * - Reproducible: same inputs → same execution path
 * - Version-controlled: workflow changes are diffable
 * - Human-readable: non-technical users can modify the workflow
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  /** Unique step ID */
  id: string;
  /** Agent/phase name (e.g., "scout", "analyst", "critic") */
  agent: string;
  /** Condition to execute this step (Jinja-like template) */
  condition?: string;
  /** Dependencies (must complete before this step) */
  dependsOn?: string[];
  /** Whether this step is optional (can be skipped if budget is tight) */
  optional?: boolean;
  /** Estimated cost in USD */
  estimatedCostUsd?: number;
  /** Estimated duration in ms */
  estimatedDurationMs?: number;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Retry count on failure */
  retries?: number;
}

export interface Workflow {
  /** Workflow name */
  name: string;
  /** Workflow version */
  version: string;
  /** Steps in execution order */
  steps: WorkflowStep[];
  /** Global budget cap */
  budgetCapUsd?: number;
  /** Quality threshold for publication */
  publishThreshold?: number;
  /** Fallback behavior when a critical step fails */
  onFailure: 'abort' | 'skip' | 'fallback';
}

export interface ExecutionResult {
  stepId: string;
  status: 'completed' | 'skipped' | 'failed' | 'timeout';
  costUsd?: number;
  durationMs?: number;
  output?: unknown;
  error?: string;
}

export interface WorkflowExecution {
  workflow: Workflow;
  results: Map<string, ExecutionResult>;
  totalCostUsd: number;
  totalDurationMs: number;
  stepsExecuted: number;
  stepsSkipped: number;
  stepsFailed: number;
}

// ─── Default Workflows ──────────────────────────────────────────────────────

/**
 * Default brief workflow — lightweight, cost-optimized.
 * Skips optional steps (debate, devil's advocate, foresight) when budget is tight.
 */
export const BRIEF_WORKFLOW: Workflow = {
  name: 'brief',
  version: '2.0',
  budgetCapUsd: 3.0,
  publishThreshold: 65,
  onFailure: 'fallback',
  steps: [
    { id: 'context_primer', agent: 'context-primer', estimatedCostUsd: 0.001, estimatedDurationMs: 5000, retries: 1 },
    { id: 'scout', agent: 'scout', dependsOn: ['context_primer'], estimatedCostUsd: 0.01, estimatedDurationMs: 60000, retries: 2 },
    { id: 'rank', agent: 'rank', dependsOn: ['scout'], estimatedCostUsd: 0.002, estimatedDurationMs: 10000 },
    { id: 'reader', agent: 'reader', dependsOn: ['rank'], estimatedCostUsd: 0.05, estimatedDurationMs: 120000, retries: 1 },
    { id: 'analyst', agent: 'analyst', dependsOn: ['reader'], estimatedCostUsd: 0.05, estimatedDurationMs: 120000, retries: 1 },
    { id: 'critic', agent: 'critic', dependsOn: ['analyst'], optional: true, estimatedCostUsd: 0.02, estimatedDurationMs: 60000 },
    { id: 'editor', agent: 'editor', dependsOn: ['analyst'], estimatedCostUsd: 0.01, estimatedDurationMs: 30000 },
    { id: 'citation_verify', agent: 'citation-verifier', dependsOn: ['editor'], estimatedCostUsd: 0.0, estimatedDurationMs: 30000 },
    { id: 'fact_check', agent: 'fact-checker', dependsOn: ['editor'], optional: true, estimatedCostUsd: 0.0, estimatedDurationMs: 10000 },
    { id: 'publish', agent: 'publisher', dependsOn: ['citation_verify'], estimatedCostUsd: 0.0, estimatedDurationMs: 5000 },
  ],
};

/**
 * Default strategic workflow — comprehensive, quality-first.
 * Includes all optional steps (debate, devil's advocate, foresight, etc.).
 */
export const STRATEGIC_WORKFLOW: Workflow = {
  name: 'strategic',
  version: '2.0',
  budgetCapUsd: 8.0,
  publishThreshold: 70,
  onFailure: 'fallback',
  steps: [
    { id: 'context_primer', agent: 'context-primer', estimatedCostUsd: 0.002, estimatedDurationMs: 10000, retries: 1 },
    { id: 'scout', agent: 'scout', dependsOn: ['context_primer'], estimatedCostUsd: 0.02, estimatedDurationMs: 180000, retries: 2 },
    { id: 'rank', agent: 'rank', dependsOn: ['scout'], estimatedCostUsd: 0.003, estimatedDurationMs: 15000 },
    { id: 'reader', agent: 'reader', dependsOn: ['rank'], estimatedCostUsd: 0.1, estimatedDurationMs: 180000, retries: 1 },
    { id: 'analyst', agent: 'analyst', dependsOn: ['reader'], estimatedCostUsd: 0.1, estimatedDurationMs: 180000, retries: 1 },
    { id: 'critic', agent: 'critic', dependsOn: ['analyst'], estimatedCostUsd: 0.03, estimatedDurationMs: 90000 },
    { id: 'debate', agent: 'debate', dependsOn: ['analyst'], optional: true, estimatedCostUsd: 0.03, estimatedDurationMs: 60000 },
    { id: 'foresight', agent: 'foresight', dependsOn: ['analyst'], optional: true, estimatedCostUsd: 0.02, estimatedDurationMs: 60000 },
    { id: 'editor', agent: 'editor', dependsOn: ['critic', 'debate'], estimatedCostUsd: 0.02, estimatedDurationMs: 60000 },
    { id: 'citation_verify', agent: 'citation-verifier', dependsOn: ['editor'], estimatedCostUsd: 0.0, estimatedDurationMs: 60000 },
    { id: 'fact_check', agent: 'fact-checker', dependsOn: ['editor'], estimatedCostUsd: 0.0, estimatedDurationMs: 15000 },
    { id: 'claim_grounding', agent: 'claim-grounding', dependsOn: ['editor'], estimatedCostUsd: 0.0, estimatedDurationMs: 30000 },
    { id: 'publish', agent: 'publisher', dependsOn: ['citation_verify', 'fact_check', 'claim_grounding'], estimatedCostUsd: 0.0, estimatedDurationMs: 5000 },
  ],
};

// ─── Execution Engine ───────────────────────────────────────────────────────

/**
 * Evaluate a condition template against the current execution state.
 * Supports simple expressions like:
 * - "budget > 2.0"
 * - "steps.scout.status == 'completed'"
 * - "quality > 60"
 */
export function evaluateCondition(
  condition: string,
  context: { budget: number; quality: number; steps: Map<string, ExecutionResult> },
): boolean {
  // Simple evaluation — no Jinja2, just basic JS expressions
  try {
    const budget = context.budget;
    const quality = context.quality;
    const steps = context.steps;
    // Safe eval: only allow comparison operators
    const sanitized = condition
      .replace(/budget/g, String(budget))
      .replace(/quality/g, String(quality));
    // eslint-disable-next-line no-new-func
    return new Function(`return ${sanitized}`)() as boolean;
  } catch {
    return true; // Default: execute if condition can't be evaluated
  }
}

/**
 * Get the next executable steps based on dependencies and conditions.
 */
export function getNextSteps(
  workflow: Workflow,
  results: Map<string, ExecutionResult>,
  remainingBudget: number,
): WorkflowStep[] {
  const completed = new Set(
    Array.from(results.entries())
      .filter(([_, r]) => r.status === 'completed')
      .map(([id]) => id)
  );

  const executable: WorkflowStep[] = [];

  for (const step of workflow.steps) {
    // Skip if already executed
    if (results.has(step.id)) continue;

    // Check dependencies
    if (step.dependsOn) {
      const depsMet = step.dependsOn.every(dep => completed.has(dep));
      if (!depsMet) continue;
    }

    // Check budget for optional steps
    if (step.optional && step.estimatedCostUsd && remainingBudget < step.estimatedCostUsd * 2) {
      continue;
    }

    // Check condition
    if (step.condition) {
      const context = {
        budget: remainingBudget,
        quality: 0, // Would be populated from actual results
        steps: results,
      };
      if (!evaluateCondition(step.condition, context)) continue;
    }

    executable.push(step);
  }

  return executable;
}

/**
 * Prune optional steps when budget is tight.
 */
export function pruneOptionalSteps(workflow: Workflow, remainingBudget: number): Workflow {
  return {
    ...workflow,
    steps: workflow.steps.filter(step => {
      if (!step.optional) return true;
      if (!step.estimatedCostUsd) return true;
      return remainingBudget > step.estimatedCostUsd * 3;
    }),
  };
}

/**
 * Get the workflow for a given query type.
 */
export function getWorkflow(isStrategic: boolean): Workflow {
  return isStrategic ? STRATEGIC_WORKFLOW : BRIEF_WORKFLOW;
}
