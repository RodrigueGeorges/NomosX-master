/**
 * Witness Seams — NomosX
 *
 * Les "seams" typés du Witness : les interfaces que le host (pipeline)
 * doit implémenter pour que le Witness puisse observer et intervenir.
 *
 * Inspiré de Sakshi (bionicbutterfly13/sakshi) — le Witness observe
 * via des seams typés sans jamais posséder la cognition.
 *
 * Quatre seams principaux :
 * 1. EventBus — émission d'événements (cycle traces, anomalies)
 * 2. GoalStateStore — lecture de l'état du pipeline
 * 3. WriteGuard — validation des interventions (sécurité)
 * 4. Clock — temps déterministe (pour tests)
 *
 * + InterventionExecutor — exécute les interventions approuvées
 */

import type {
  CycleTrace,
  AnomalyEvent,
  InterventionRecord,
  GuardDecision,
  InterventionType,
  PipelineObservation,
  StepExpectation,
  WitnessState,
} from './types';

// ─── EventBus ───────────────────────────────────────────────────────────────

export interface EventBus {
  /** Emit a cycle trace (after the Witness completes one observation cycle) */
  emitCycleTrace(trace: CycleTrace): Promise<void>;
  /** Emit an anomaly event */
  emitAnomaly(event: AnomalyEvent): Promise<void>;
  /** Emit an intervention record */
  emitIntervention(record: InterventionRecord): Promise<void>;
  /** Emit a custom event */
  emit(event: string, payload: any): Promise<void>;
}

/**
 * Default EventBus: logs to console + persists to AgentAuditLog.
 * Production should use a real event bus (Redis pub/sub, etc.).
 */
export class ConsoleEventBus implements EventBus {
  constructor(private runId: string) {}

  async emitCycleTrace(trace: CycleTrace): Promise<void> {
    const assessment = trace.assessment;
    console.log(
      `[Witness] Cycle ${trace.pipelineStep}: ${assessment.onTrack ? 'ON TRACK' : 'ISSUE'} ` +
      `(severity=${assessment.severity}, anomalies=${trace.anomalies.length}, intervened=${trace.intervened})`
    );
    if (assessment.issues.length > 0) {
      assessment.issues.forEach(i => console.log(`  ⚠ ${i}`));
    }
  }

  async emitAnomaly(event: AnomalyEvent): Promise<void> {
    console.warn(
      `[Witness] ANOMALY [${event.severity.toUpperCase()}] ${event.type} on ${event.pipelineStep}: ${event.description}`
    );
  }

  async emitIntervention(record: InterventionRecord): Promise<void> {
    if (record.approved) {
      console.log(`[Witness] INTERVENTION [${record.type}] on ${record.pipelineStep}: ${record.action}`);
    } else {
      console.warn(`[Witness] INTERVENTION DENIED [${record.type}]: ${record.rejectionReason}`);
    }
  }

  async emit(event: string, payload: any): Promise<void> {
    console.log(`[Witness] Event: ${event}`, payload);
  }
}

/**
 * Database-backed EventBus: persists events to AgentAuditLog.
 */
export class DatabaseEventBus implements EventBus {
  constructor(
    private runId: string,
    private prisma: any,
  ) {}

  async emitCycleTrace(trace: CycleTrace): Promise<void> {
    try {
      await this.prisma.agentAuditLog.create({
        data: {
          agent: 'witness',
          action: 'CYCLE_TRACE',
          metadata: JSON.stringify({
            runId: this.runId,
            pipelineStep: trace.pipelineStep,
            onTrack: trace.assessment.onTrack,
            severity: trace.assessment.severity,
            issues: trace.assessment.issues,
            anomalies: trace.anomalies.length,
            intervened: trace.intervened,
            intervention: trace.intervention?.type,
            durationMs: trace.durationMs,
          }),
        },
      });
    } catch (err) {
      console.warn('[Witness] Failed to persist cycle trace:', err);
    }
  }

  async emitAnomaly(event: AnomalyEvent): Promise<void> {
    try {
      await this.prisma.agentAuditLog.create({
        data: {
          agent: 'witness',
          action: 'ANOMALY',
          metadata: JSON.stringify({
            runId: this.runId,
            type: event.type,
            severity: event.severity,
            description: event.description,
            pipelineStep: event.pipelineStep,
            triggerValue: event.triggerValue,
            expectedValue: event.expectedValue,
            suggestedIntervention: event.suggestedIntervention,
          }),
        },
      });
    } catch (err) {
      console.warn('[Witness] Failed to persist anomaly:', err);
    }
  }

  async emitIntervention(record: InterventionRecord): Promise<void> {
    try {
      await this.prisma.agentAuditLog.create({
        data: {
          agent: 'witness',
          action: 'INTERVENTION',
          metadata: JSON.stringify({
            runId: this.runId,
            type: record.type,
            pipelineStep: record.pipelineStep,
            reason: record.reason,
            action: record.action,
            approved: record.approved,
            rejectionReason: record.rejectionReason,
            result: record.result,
          }),
        },
      });
    } catch (err) {
      console.warn('[Witness] Failed to persist intervention:', err);
    }
  }

  async emit(event: string, payload: any): Promise<void> {
    try {
      await this.prisma.agentAuditLog.create({
        data: {
          agent: 'witness',
          action: `EVENT_${event.toUpperCase()}`,
          metadata: JSON.stringify({ runId: this.runId, ...payload }),
        },
      });
    } catch (err) {
      console.warn('[Witness] Failed to persist event:', err);
    }
  }
}

// ─── GoalStateStore ─────────────────────────────────────────────────────────

export interface GoalStateStore {
  /** Get the current state of the pipeline */
  getPipelineState(): Promise<{
    currentStep: string;
    completedSteps: string[];
    pendingSteps: string[];
    totalCostUsd: number;
    budgetCapUsd: number;
    trustScore: number | null;
    query: string;
  }>;
  /** Get expectations for a specific step */
  getExpectations(stepId: string): Promise<StepExpectation | null>;
  /** Record a goal outcome (for cross-run learning) */
  recordGoalOutcome(stepId: string, success: boolean, metrics: Record<string, number>): Promise<void>;
}

/**
 * In-memory GoalStateStore (default for single-run usage).
 */
export class InMemoryGoalStateStore implements GoalStateStore {
  private expectations: Map<string, StepExpectation> = new Map();
  private outcomes: Array<{ stepId: string; success: boolean; metrics: Record<string, number> }> = [];
  private state: {
    currentStep: string;
    completedSteps: string[];
    pendingSteps: string[];
    totalCostUsd: number;
    budgetCapUsd: number;
    trustScore: number | null;
    query: string;
  };

  constructor(initialState: {
    query: string;
    budgetCapUsd: number;
    steps: string[];
  }) {
    this.state = {
      currentStep: '',
      completedSteps: [],
      pendingSteps: [...initialState.steps],
      totalCostUsd: 0,
      budgetCapUsd: initialState.budgetCapUsd,
      trustScore: null,
      query: initialState.query,
    };
  }

  async getPipelineState() {
    return { ...this.state };
  }

  async getExpectations(stepId: string): Promise<StepExpectation | null> {
    return this.expectations.get(stepId) || null;
  }

  async recordGoalOutcome(stepId: string, success: boolean, metrics: Record<string, number>): Promise<void> {
    this.outcomes.push({ stepId, success, metrics });
  }

  /** Set expectations for a step (called by the pipeline before running the step) */
  setExpectations(stepId: string, expectations: StepExpectation): void {
    this.expectations.set(stepId, expectations);
  }

  /** Update the pipeline state (called by the pipeline as it progresses) */
  updateState(updates: Partial<{
    currentStep: string;
    completedSteps: string[];
    pendingSteps: string[];
    totalCostUsd: number;
    trustScore: number | null;
  }>): void {
    this.state = { ...this.state, ...updates };
  }

  /** Get all recorded outcomes (for cross-run learning) */
  getOutcomes() {
    return [...this.outcomes];
  }
}

// ─── WriteGuard ─────────────────────────────────────────────────────────────

export interface WriteGuard {
  /** Validate an intervention before it's executed */
  validate(intervention: {
    type: InterventionType;
    pipelineStep: string;
    params: Record<string, any>;
  }): Promise<GuardDecision>;
}

/**
 * DenyByDefaultWriteGuard — rejects all interventions by default.
 * Use this in test environments or when you want the Witness to be
 * purely observational (no interventions).
 */
export class DenyByDefaultWriteGuard implements WriteGuard {
  async validate(): Promise<GuardDecision> {
    return {
      verdict: 'deny',
      reason: 'DenyByDefault: all interventions rejected (observational mode)',
    };
  }
}

/**
 * AlwaysPermitWriteGuard — approves all interventions.
 * Use this only in test environments. NEVER in production.
 */
export class AlwaysPermitWriteGuard implements WriteGuard {
  async validate(): Promise<GuardDecision> {
    return {
      verdict: 'permit',
      reason: 'AlwaysPermit: all interventions approved (test mode)',
    };
  }
}

/**
 * ProductionWriteGuard — validates interventions against safety rules.
 *
 * Safety rules:
 * - 'abort_step' is only allowed for non-critical steps (SCOUT, RANK are critical)
 * - 'modify_prompt' can only append, not replace
 * - 'adjust_threshold' is bounded (can't change by more than 30%)
 * - 'switch_provider' is always allowed
 * - 'request_human_review' is always allowed
 * - 'skip_optional_step' is only allowed for optional steps
 * - 'add_step' is only allowed for known step types
 * - 'force_synthesis' is only allowed after step 3 (don't force too early)
 */
export class ProductionWriteGuard implements WriteGuard {
  private criticalSteps = new Set(['scout', 'rank', 'reader', 'analyst']);
  private maxThresholdChange = 0.30; // 30% max change

  async validate(intervention: {
    type: InterventionType;
    pipelineStep: string;
    params: Record<string, any>;
  }): Promise<GuardDecision> {
    const { type, pipelineStep, params } = intervention;

    switch (type) {
      case 'abort_step':
        if (this.criticalSteps.has(pipelineStep)) {
          return {
            verdict: 'deny',
            reason: `Cannot abort critical step: ${pipelineStep}`,
          };
        }
        return { verdict: 'permit', reason: 'Non-critical step abort approved' };

      case 'modify_prompt':
        // Can only append, not replace
        if (!params.appendFragment && params.replaceFragment) {
          return {
            verdict: 'modify',
            reason: 'Prompt replacement denied — use append instead',
            modifiedParams: {
              ...params,
              appendFragment: params.replaceFragment,
              replaceFragment: undefined,
            },
          };
        }
        return { verdict: 'permit', reason: 'Prompt append approved' };

      case 'adjust_threshold':
        if (params.currentValue && params.newValue) {
          const change = Math.abs(params.newValue - params.currentValue) / params.currentValue;
          if (change > this.maxThresholdChange) {
            const cappedValue = params.currentValue * (1 + this.maxThresholdChange * Math.sign(params.newValue - params.currentValue));
            return {
              verdict: 'modify',
              reason: `Threshold change ${(change * 100).toFixed(0)}% exceeds max ${this.maxThresholdChange * 100}% — capped`,
              modifiedParams: {
                ...params,
                newValue: Math.round(cappedValue * 100) / 100,
              },
            };
          }
        }
        return { verdict: 'permit', reason: 'Threshold adjustment within bounds' };

      case 'switch_provider':
        return { verdict: 'permit', reason: 'Provider switch approved' };

      case 'request_human_review':
        return { verdict: 'permit', reason: 'Human review request approved' };

      case 'skip_optional_step':
        if (this.criticalSteps.has(pipelineStep)) {
          return {
            verdict: 'deny',
            reason: `Cannot skip critical step: ${pipelineStep}`,
          };
        }
        return { verdict: 'permit', reason: 'Optional step skip approved' };

      case 'add_step':
        const allowedSteps = new Set(['debate', 'gap_fill', 'self_correction', 'broaden_search', 'fact_check']);
        if (!allowedSteps.has(params.stepType)) {
          return {
            verdict: 'deny',
            reason: `Cannot add unknown step type: ${params.stepType}`,
          };
        }
        return { verdict: 'permit', reason: 'Step addition approved' };

      case 'force_synthesis':
        // Only after step 3 (don't force too early)
        if (params.stepIndex !== undefined && params.stepIndex < 3) {
          return {
            verdict: 'deny',
            reason: 'Cannot force synthesis before step 3 (too early)',
          };
        }
        return { verdict: 'permit', reason: 'Force synthesis approved' };

      case 'reduce_scope':
        return { verdict: 'permit', reason: 'Scope reduction approved' };

      case 'retry_with_feedback':
        if (params.maxRetries && params.maxRetries > 2) {
          return {
            verdict: 'modify',
            reason: 'Max retries capped at 2',
            modifiedParams: { ...params, maxRetries: 2 },
          };
        }
        return { verdict: 'permit', reason: 'Retry with feedback approved' };

      case 'log_only':
        return { verdict: 'permit', reason: 'Log-only intervention (no-op)' };

      default:
        return {
          verdict: 'deny',
          reason: `Unknown intervention type: ${type}`,
        };
    }
  }
}

// ─── Clock ──────────────────────────────────────────────────────────────────

export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class DeterministicClock implements Clock {
  private current: number;

  constructor(startTime: number = Date.now()) {
    this.current = startTime;
  }

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

// ─── Intervention Executor ──────────────────────────────────────────────────

/**
 * Executes interventions that the WriteGuard has approved.
 * The executor is provided by the host (pipeline) because it needs
 * access to the pipeline's internal state.
 */
export interface InterventionExecutor {
  execute(intervention: InterventionRecord): Promise<{
    success: boolean;
    result: 'success' | 'failed' | 'partial';
    message: string;
  }>;
}

/**
 * NoOp executor — does nothing (for observational mode).
 */
export class NoOpInterventionExecutor implements InterventionExecutor {
  async execute(): Promise<{ success: boolean; result: 'success' | 'failed' | 'partial'; message: string }> {
    return { success: true, result: 'success', message: 'No-op (observational mode)' };
  }
}
