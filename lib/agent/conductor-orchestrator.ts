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
 * Safe expression evaluator — replaces `new Function()` to eliminate the code
 * injection vector. Implements a small recursive-descent parser supporting:
 * - Numeric literals, single/double-quoted strings
 * - Identifiers: `budget`, `quality`, `steps.<id>.status`, `steps.<id>.costUsd`
 * - Comparison: `>`, `<`, `>=`, `<=`, `==`, `===`, `!=`, `!==`
 * - Boolean logic: `&&`, `||`, `!`, parentheses
 *
 * Any token outside this grammar → parse error → returns `true` (fail-open,
 * preserving prior behavior for unevaluable conditions).
 */

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' };

const MAX_EXPR_LEN = 512;

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let s = '';
      while (j < expr.length && expr[j] !== quote) { s += expr[j]; j++; }
      if (j >= expr.length) throw new Error('Unterminated string literal');
      tokens.push({ type: 'str', value: s });
      i = j + 1;
      continue;
    }
    // Two/three-char operators
    const three = expr.slice(i, i + 3);
    const two = expr.slice(i, i + 2);
    if (three === '===' || three === '!==') { tokens.push({ type: 'op', value: three }); i += 3; continue; }
    if (two === '&&' || two === '||' || two === '>=' || two === '<=' || two === '==' || two === '!=') {
      tokens.push({ type: 'op', value: two }); i += 2; continue;
    }
    if (c === '>' || c === '<' || c === '!') { tokens.push({ type: 'op', value: c }); i++; continue; }
    // Number
    if (/[0-9.]/.test(c)) {
      let j = i;
      let s = '';
      while (j < expr.length && /[0-9.]/.test(expr[j])) { s += expr[j]; j++; }
      const n = parseFloat(s);
      if (Number.isNaN(n)) throw new Error(`Invalid number: ${s}`);
      tokens.push({ type: 'num', value: n });
      i = j;
      continue;
    }
    // Identifier (with dots for paths like steps.scout.status)
    if (/[a-zA-Z_$]/.test(c)) {
      let j = i;
      let s = '';
      while (j < expr.length && /[a-zA-Z0-9_.$-]/.test(expr[j])) { s += expr[j]; j++; }
      tokens.push({ type: 'ident', value: s });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character: ${c}`);
  }
  return tokens;
}

function resolveIdent(
  name: string,
  context: { budget: number; quality: number; steps: Map<string, ExecutionResult> },
): number | string | boolean | undefined {
  if (name === 'budget') return context.budget;
  if (name === 'quality') return context.quality;
  if (name === 'true') return true;
  if (name === 'false') return false;
  // steps.<id>.<field>
  if (name.startsWith('steps.')) {
    const parts = name.slice('steps.'.length).split('.');
    const stepId = parts[0];
    const field = parts[1];
    const step = context.steps.get(stepId);
    if (!step) return undefined;
    if (field === 'status') return step.status;
    if (field === 'costUsd') return step.costUsd;
    if (field === 'durationMs') return step.durationMs;
    return undefined;
  }
  return undefined;
}

/**
 * Evaluate a condition template against the current execution state.
 * Supports expressions like:
 * - "budget > 2.0"
 * - "steps.scout.status == 'completed'"
 * - "quality > 60 && budget > 1.5"
 */
export function evaluateCondition(
  condition: string,
  context: { budget: number; quality: number; steps: Map<string, ExecutionResult> },
): boolean {
  try {
    if (!condition || condition.length > MAX_EXPR_LEN) return true;
    const tokens = tokenize(condition);
    let pos = 0;

    const peek = (): Token | undefined => tokens[pos];
    const next = (): Token | undefined => tokens[pos++];

    const truthy = (v: number | string | boolean): boolean =>
      v === true || (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v.length > 0);

    const compare = (a: number | string | boolean, op: string, b: number | string | boolean): boolean => {
      // Numeric coercion for ordering comparisons
      const an = typeof a === 'number' ? a : (typeof a === 'boolean' ? (a ? 1 : 0) : Number(a));
      const bn = typeof b === 'number' ? b : (typeof b === 'boolean' ? (b ? 1 : 0) : Number(b));
      switch (op) {
        case '>': return an > bn;
        case '<': return an < bn;
        case '>=': return an >= bn;
        case '<=': return an <= bn;
        case '==': case '===': return a === b;
        case '!=': case '!==': return a !== b;
        default: throw new Error(`Unknown operator: ${op}`);
      }
    };

    const parseValue = (): number | string | boolean => {
      const t = next();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.type === 'num') return t.value;
      if (t.type === 'str') return t.value;
      if (t.type === 'op' && t.value === '!') {
        const v = parseValue();
        return !truthy(v);
      }
      if (t.type === 'ident') {
        const v = resolveIdent(t.value, context);
        if (v === undefined) throw new Error(`Unknown identifier: ${t.value}`);
        return v;
      }
      throw new Error(`Unexpected token`);
    };

    const parseComparison = (): boolean | number | string => {
      const left = parseValue();
      const t = peek();
      if (t && t.type === 'op' && t.value !== '&&' && t.value !== '||') {
        next();
        const right = parseValue();
        return compare(left, t.value, right);
      }
      return left;
    };

    const parseAnd = (): boolean => {
      let result = truthy(parseComparison());
      while (peek()?.type === 'op' && (peek() as Token & { type: 'op' }).value === '&&') {
        next();
        result = result && truthy(parseComparison());
      }
      return result;
    };

    const parseOr = (): boolean => {
      let result = parseAnd();
      while (peek()?.type === 'op' && (peek() as Token & { type: 'op' }).value === '||') {
        next();
        result = result || parseAnd();
      }
      return result;
    };

    const parseExpr = (): boolean => {
      if (peek()?.type === 'lparen') {
        next();
        const v = parseOr();
        if (next()?.type !== 'rparen') throw new Error('Missing closing paren');
        return v;
      }
      return parseOr();
    };

    return parseExpr();
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
