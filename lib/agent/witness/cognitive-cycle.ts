/**
 * Witness Cognitive Cycle — NomosX
 *
 * Le cycle cognitif à 6 phases du Witness :
 *   PERCEIVE → INTERPRET → EVAL → INTEND → PLAN → ACT
 *
 * Une cycle = une observation d'une étape du pipeline.
 * Le Witness reçoit l'observation, l'interprète, l'évalue contre les
 * attentes, décide s'il doit intervenir, planifie l'intervention,
 * et l'exécute (via WriteGuard).
 *
 * Inspiré de Sakshi (Witness pattern) + MIDCA (metacognitive control).
 */

import { callLLM } from '../../llm/unified-llm';
import { parseJson } from '../json-utils';
import type {
  CycleTrace,
  PhaseResult,
  CognitivePhase,
  AnomalyEvent,
  AnomalyType,
  InterventionRecord,
  InterventionType,
  PipelineObservation,
  StepExpectation,
  CycleAssessment,
  WitnessState,
} from './types';
import type {
  EventBus,
  GoalStateStore,
  WriteGuard,
  Clock,
  InterventionExecutor,
} from './seams';

// ─── Default Expectations ───────────────────────────────────────────────────

const DEFAULT_EXPECTATIONS: Record<string, StepExpectation> = {
  scout: {
    pipelineStep: 'scout',
    expectedCostUsd: { min: 0.005, max: 0.05 },
    expectedDurationSec: { min: 10, max: 60 },
    mustProduceOutput: true,
  },
  rank: {
    pipelineStep: 'rank',
    expectedCostUsd: { min: 0.001, max: 0.02 },
    expectedDurationSec: { min: 5, max: 30 },
    mustProduceOutput: true,
  },
  reader: {
    pipelineStep: 'reader',
    expectedCostUsd: { min: 0.03, max: 0.20 },
    expectedDurationSec: { min: 30, max: 180 },
    expectedQuality: { min: 50, max: 100 },
    mustProduceOutput: true,
  },
  analyst: {
    pipelineStep: 'analyst',
    expectedCostUsd: { min: 0.10, max: 0.60 },
    expectedDurationSec: { min: 60, max: 360 },
    expectedQuality: { min: 60, max: 100 },
    minCitations: 3,
    maxHallucinationRisk: 0.3,
    mustProduceOutput: true,
  },
  debate: {
    pipelineStep: 'debate',
    expectedCostUsd: { min: 0.03, max: 0.15 },
    expectedDurationSec: { min: 30, max: 120 },
    mustProduceOutput: true,
  },
  devils_advocate: {
    pipelineStep: 'devils_advocate',
    expectedCostUsd: { min: 0.02, max: 0.10 },
    expectedDurationSec: { min: 20, max: 90 },
    mustProduceOutput: true,
  },
  editor: {
    pipelineStep: 'editor',
    expectedCostUsd: { min: 0.005, max: 0.03 },
    expectedDurationSec: { min: 5, max: 30 },
    mustProduceOutput: true,
  },
  gap_fill: {
    pipelineStep: 'gap_fill',
    expectedCostUsd: { min: 0.01, max: 0.10 },
    expectedDurationSec: { min: 20, max: 90 },
    mustProduceOutput: false,
  },
};

// ─── Witness Config ─────────────────────────────────────────────────────────

export interface WitnessConfig {
  /** Whether the Witness can intervene (false = observational only) */
  canIntervene: boolean;
  /** Whether to use LLM for the INTERPRET and EVAL phases (false = rule-based only) */
  useLLM: boolean;
  /** Budget cap for the Witness's own LLM calls (it costs money to think) */
  witnessBudgetUsd: number;
  /** Health score starts at 100, decreases by this per anomaly */
  healthPenaltyPerAnomaly: number;
  /** Health score increases by this per clean cycle */
  healthBonusPerCleanCycle: number;
  /** Label for logging */
  label: string;
}

export const DEFAULT_WITNESS_CONFIG: WitnessConfig = {
  canIntervene: true,
  useLLM: true,
  witnessBudgetUsd: 0.10, // The Witness can spend up to $0.10 on its own thinking
  healthPenaltyPerAnomaly: 10,
  healthBonusPerCleanCycle: 2,
  label: 'Witness',
};

// ─── Witness Observer ───────────────────────────────────────────────────────

/**
 * The main Witness class. Observes pipeline steps and optionally intervenes.
 */
export class Witness {
  private state: WitnessState;
  private config: WitnessConfig;
  private eventBus: EventBus;
  private goalStore: GoalStateStore;
  private writeGuard: WriteGuard;
  private clock: Clock;
  private executor: InterventionExecutor;
  private witnessCostUsd = 0;

  constructor(
    runId: string,
    config: Partial<WitnessConfig> = {},
    seams: {
      eventBus: EventBus;
      goalStore: GoalStateStore;
      writeGuard: WriteGuard;
      clock: Clock;
      executor: InterventionExecutor;
    },
  ) {
    this.config = { ...DEFAULT_WITNESS_CONFIG, ...config };
    this.eventBus = seams.eventBus;
    this.goalStore = seams.goalStore;
    this.writeGuard = seams.writeGuard;
    this.clock = seams.clock;
    this.executor = seams.executor;

    this.state = {
      runId,
      cycleTraces: [],
      anomalies: [],
      interventions: [],
      totalCostUsd: 0,
      budgetCapUsd: 0,
      currentStep: 0,
      hasIntervened: false,
      healthScore: 100,
      learningContext: [],
    };
  }

  // ─── Main entry point: observe a pipeline step ────────────────────────────

  /**
   * Observe a pipeline step after it completes.
   * Runs the full 6-phase cognitive cycle.
   */
  async observe(observation: PipelineObservation): Promise<CycleTrace> {
    const cycleStart = this.clock.now();
    const traceId = `cycle_${this.state.runId}_${this.state.currentStep}`;

    console.log(`[${this.config.label}] Observing ${observation.pipelineStep} (cost=$${observation.costUsd.toFixed(4)}, duration=${(observation.durationMs / 1000).toFixed(1)}s)`);

    // Update state
    this.state.totalCostUsd += observation.costUsd;
    this.state.currentStep++;

    // Get expectations for this step
    const expectations = await this.goalStore.getExpectations(observation.pipelineStep) ||
      DEFAULT_EXPECTATIONS[observation.pipelineStep] ||
      { pipelineStep: observation.pipelineStep };

    // Run the 6 phases
    const phases: Partial<Record<CognitivePhase, PhaseResult>> = {};

    // 1. PERCEIVE — receive raw observations
    phases.PERCEIVE = await this.perceive(observation, expectations);

    // 2. INTERPRET — make sense of what happened
    phases.INTERPRET = await this.interpret(observation, phases.PERCEIVE);

    // 3. EVAL — evaluate against expectations
    const { evalResult, anomalies } = await this.eval(observation, expectations, phases.INTERPRET);
    phases.EVAL = evalResult;

    // Record anomalies
    for (const anomaly of anomalies) {
      this.state.anomalies.push(anomaly);
      await this.eventBus.emitAnomaly(anomaly);
      // Health penalty
      const penalty = anomaly.severity === 'critical' ? 25 :
                      anomaly.severity === 'high' ? 15 :
                      anomaly.severity === 'medium' ? 8 : 3;
      this.state.healthScore = Math.max(0, this.state.healthScore - penalty);
    }

    // 4. INTEND — decide whether to intervene
    const { intendResult, shouldIntervene, interventionType } = await this.intend(observation, anomalies, phases.EVAL);
    phases.INTEND = intendResult;

    // 5. PLAN — plan the intervention (if needed)
    let intervention: InterventionRecord | undefined;
    if (shouldIntervene && this.config.canIntervene && interventionType) {
      const { planResult, plannedIntervention } = await this.plan(observation, interventionType, anomalies);
      phases.PLAN = planResult;
      intervention = plannedIntervention;
    } else if (shouldIntervene && !this.config.canIntervene) {
      // Log that we would have intervened but can't
      phases.PLAN = {
        phase: 'PLAN',
        output: `Would intervene with ${interventionType} but canIntervene=false (observational mode)`,
        confidence: 0.9,
        durationMs: 0,
      };
    }

    // 6. ACT — execute the intervention (if planned and approved)
    if (intervention) {
      const actResult = await this.act(intervention);
      phases.ACT = actResult;
      if (intervention.approved) {
        this.state.hasIntervened = true;
      }
    }

    // Build the cycle trace
    const assessment = this.buildAssessment(observation, anomalies, phases);
    const cycleEnd = this.clock.now();

    const trace: CycleTrace = {
      id: traceId,
      pipelineStep: observation.pipelineStep,
      startedAt: cycleStart,
      endedAt: cycleEnd,
      durationMs: cycleEnd - cycleStart,
      phases,
      intervened: intervention?.approved ?? false,
      intervention,
      anomalies,
      assessment,
    };

    this.state.cycleTraces.push(trace);
    await this.eventBus.emitCycleTrace(trace);

    // Health bonus for clean cycles
    if (anomalies.length === 0) {
      this.state.healthScore = Math.min(100, this.state.healthScore + this.config.healthBonusPerCleanCycle);
    }

    // Record goal outcome
    await this.goalStore.recordGoalOutcome(
      observation.pipelineStep,
      observation.success,
      observation.metrics,
    );

    return trace;
  }

  // ─── Phase 1: PERCEIVE ────────────────────────────────────────────────────

  private async perceive(
    observation: PipelineObservation,
    expectations: StepExpectation,
  ): Promise<PhaseResult> {
    const start = this.clock.now();
    const output = JSON.stringify({
      step: observation.pipelineStep,
      success: observation.success,
      costUsd: observation.costUsd,
      durationMs: observation.durationMs,
      metrics: observation.metrics,
      errors: observation.errors,
      llmCalls: observation.llmCalls.length,
      outputLength: observation.outputSummary.length,
      expectations: {
        costRange: expectations.expectedCostUsd,
        durationRange: expectations.expectedDurationSec,
        qualityRange: expectations.expectedQuality,
        minCitations: expectations.minCitations,
      },
    });
    return {
      phase: 'PERCEIVE',
      output,
      confidence: 1.0, // Raw perception is certain
      durationMs: this.clock.now() - start,
    };
  }

  // ─── Phase 2: INTERPRET ───────────────────────────────────────────────────

  private async interpret(
    observation: PipelineObservation,
    perceiveResult: PhaseResult,
  ): Promise<PhaseResult> {
    const start = this.clock.now();

    // Rule-based interpretation (fast, free)
    let interpretation = `Step ${observation.pipelineStep} ${observation.success ? 'succeeded' : 'failed'}. `;
    interpretation += `Cost: $${observation.costUsd.toFixed(4)}, Duration: ${(observation.durationMs / 1000).toFixed(1)}s. `;
    interpretation += `Output: ${observation.outputSummary.length} chars. `;
    if (observation.errors.length > 0) {
      interpretation += `Errors: ${observation.errors.join('; ')}. `;
    }
    if (observation.llmCalls.length > 0) {
      const totalTokens = observation.llmCalls.reduce((s, c) => s + c.tokensInput + c.tokensOutput, 0);
      interpretation += `LLM calls: ${observation.llmCalls.length} (${totalTokens} tokens). `;
    }

    // LLM-based interpretation (deeper, costs money)
    if (this.config.useLLM && this.witnessCostUsd < this.config.witnessBudgetUsd) {
      try {
        const response = await callLLM({
          messages: [
            {
              role: 'system',
              content: `You are the Witness — a metacognitive observer of an AI research pipeline. Interpret what happened in this pipeline step. Be concise (2-3 sentences). Focus on: what was attempted, what happened, and any notable patterns.`,
            },
            {
              role: 'user',
              content: `Step: ${observation.pipelineStep}\nResult: ${observation.success ? 'SUCCESS' : 'FAILURE'}\nCost: $${observation.costUsd.toFixed(4)}\nDuration: ${(observation.durationMs / 1000).toFixed(1)}s\nMetrics: ${JSON.stringify(observation.metrics)}\nErrors: ${observation.errors.join('; ') || 'none'}\nOutput summary: ${observation.outputSummary.slice(0, 500)}`,
            },
          ],
          temperature: 0.2,
          maxTokens: 200,
          task: 'enrichment_reasoner',
        });
        this.witnessCostUsd += response.costUsd;
        interpretation = response.content;
      } catch (err) {
        // Fall back to rule-based
      }
    }

    return {
      phase: 'INTERPRET',
      output: interpretation,
      confidence: 0.8,
      durationMs: this.clock.now() - start,
    };
  }

  // ─── Phase 3: EVAL ────────────────────────────────────────────────────────

  private async eval(
    observation: PipelineObservation,
    expectations: StepExpectation,
    interpretResult: PhaseResult,
  ): Promise<{ evalResult: PhaseResult; anomalies: AnomalyEvent[] }> {
    const start = this.clock.now();
    const anomalies: AnomalyEvent[] = [];
    const issues: string[] = [];

    // Rule-based anomaly detection
    const anomalyChecks: Array<() => AnomalyEvent | null> = [
      // Cost overrun
      () => {
        if (expectations.expectedCostUsd && observation.costUsd > expectations.expectedCostUsd.max) {
          return {
            id: `anomaly_${Date.now()}_cost`,
            type: 'cost_overrun' as AnomalyType,
            severity: observation.costUsd > expectations.expectedCostUsd.max * 2 ? 'high' : 'medium',
            description: `Cost $${observation.costUsd.toFixed(4)} exceeds expected max $${expectations.expectedCostUsd.max.toFixed(4)}`,
            triggerValue: observation.costUsd,
            expectedValue: expectations.expectedCostUsd.max,
            pipelineStep: observation.pipelineStep,
            timestamp: this.clock.now(),
            suggestedIntervention: 'switch_provider' as InterventionType,
          };
        }
        return null;
      },
      // Latency spike
      () => {
        if (expectations.expectedDurationSec) {
          const durationSec = observation.durationMs / 1000;
          if (durationSec > expectations.expectedDurationSec.max) {
            return {
              id: `anomaly_${Date.now()}_latency`,
              type: 'latency_spike' as AnomalyType,
              severity: durationSec > expectations.expectedDurationSec.max * 2 ? 'high' : 'low',
              description: `Duration ${durationSec.toFixed(1)}s exceeds expected max ${expectations.expectedDurationSec.max}s`,
              triggerValue: durationSec,
              expectedValue: expectations.expectedDurationSec.max,
              pipelineStep: observation.pipelineStep,
              timestamp: this.clock.now(),
              suggestedIntervention: 'log_only' as InterventionType,
            };
          }
        }
        return null;
      },
      // Empty output
      () => {
        if (expectations.mustProduceOutput && observation.outputSummary.trim().length === 0) {
          return {
            id: `anomaly_${Date.now()}_empty`,
            type: 'empty_output' as AnomalyType,
            severity: 'critical' as const,
            description: 'Step produced no output',
            pipelineStep: observation.pipelineStep,
            timestamp: this.clock.now(),
            suggestedIntervention: 'retry_with_feedback' as InterventionType,
          };
        }
        return null;
      },
      // Citation gap
      () => {
        if (expectations.minCitations && observation.metrics.citations !== undefined) {
          if (observation.metrics.citations < expectations.minCitations) {
            return {
              id: `anomaly_${Date.now()}_citations`,
              type: 'citation_gap' as AnomalyType,
              severity: 'high' as const,
              description: `Citations ${observation.metrics.citations} < minimum ${expectations.minCitations}`,
              triggerValue: observation.metrics.citations,
              expectedValue: expectations.minCitations,
              pipelineStep: observation.pipelineStep,
              timestamp: this.clock.now(),
              suggestedIntervention: 'retry_with_feedback' as InterventionType,
            };
          }
        }
        return null;
      },
      // Budget depletion
      () => {
        const budgetUsed = this.state.totalCostUsd / this.state.budgetCapUsd;
        if (budgetUsed > 0.8) {
          return {
            id: `anomaly_${Date.now()}_budget`,
            type: 'budget_depletion' as AnomalyType,
            severity: budgetUsed > 0.95 ? 'critical' : 'high',
            description: `Budget ${Math.round(budgetUsed * 100)}% used ($${this.state.totalCostUsd.toFixed(2)}/${this.state.budgetCapUsd.toFixed(2)})`,
            triggerValue: budgetUsed,
            expectedValue: 0.8,
            pipelineStep: observation.pipelineStep,
            timestamp: this.clock.now(),
            suggestedIntervention: 'skip_optional_step' as InterventionType,
          };
        }
        return null;
      },
      // Quality drop
      () => {
        if (expectations.expectedQuality && observation.metrics.quality !== undefined) {
          if (observation.metrics.quality < expectations.expectedQuality.min) {
            return {
              id: `anomaly_${Date.now()}_quality`,
              type: 'quality_drop' as AnomalyType,
              severity: observation.metrics.quality < expectations.expectedQuality.min * 0.7 ? 'high' : 'medium',
              description: `Quality ${observation.metrics.quality} < minimum ${expectations.expectedQuality.min}`,
              triggerValue: observation.metrics.quality,
              expectedValue: expectations.expectedQuality.min,
              pipelineStep: observation.pipelineStep,
              timestamp: this.clock.now(),
              suggestedIntervention: 'retry_with_feedback' as InterventionType,
            };
          }
        }
        return null;
      },
      // Failure
      () => {
        if (!observation.success) {
          return {
            id: `anomaly_${Date.now()}_failure`,
            type: 'empty_output' as AnomalyType,
            severity: 'high' as const,
            description: `Step failed: ${observation.errors.join('; ')}`,
            pipelineStep: observation.pipelineStep,
            timestamp: this.clock.now(),
            suggestedIntervention: 'retry_with_feedback' as InterventionType,
          };
        }
        return null;
      },
    ];

    for (const check of anomalyChecks) {
      const anomaly = check();
      if (anomaly) anomalies.push(anomaly);
    }

    const onTrack = anomalies.length === 0;
    const severity = this.computeSeverity(anomalies);
    const output = JSON.stringify({
      onTrack,
      severity,
      anomalies: anomalies.length,
      issues: anomalies.map(a => a.description),
    });

    return {
      evalResult: {
        phase: 'EVAL',
        output,
        confidence: 0.9,
        durationMs: this.clock.now() - start,
      },
      anomalies,
    };
  }

  // ─── Phase 4: INTEND ──────────────────────────────────────────────────────

  private async intend(
    observation: PipelineObservation,
    anomalies: AnomalyEvent[],
    evalResult: PhaseResult,
  ): Promise<{ intendResult: PhaseResult; shouldIntervene: boolean; interventionType: InterventionType | null }> {
    const start = this.clock.now();

    // If no anomalies, don't intervene
    if (anomalies.length === 0) {
      return {
        intendResult: {
          phase: 'INTEND',
          output: 'No anomalies detected — no intervention needed',
          confidence: 0.95,
          durationMs: this.clock.now() - start,
        },
        shouldIntervene: false,
        interventionType: null,
      };
    }

    // Pick the most severe anomaly's suggested intervention
    const sortedAnomalies = [...anomalies].sort((a, b) => {
      const sevOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return sevOrder[b.severity] - sevOrder[a.severity];
    });

    const topAnomaly = sortedAnomalies[0];
    const interventionType = topAnomaly.suggestedIntervention || 'log_only';

    // If it's just 'log_only', don't actually intervene
    if (interventionType === 'log_only') {
      return {
        intendResult: {
          phase: 'INTEND',
          output: `Anomaly detected (${topAnomaly.type}) but intervention is log-only`,
          confidence: 0.8,
          durationMs: this.clock.now() - start,
        },
        shouldIntervene: false,
        interventionType: null,
      };
    }

    // LLM-based intent decision (should we really intervene?)
    if (this.config.useLLM && this.witnessCostUsd < this.config.witnessBudgetUsd) {
      try {
        const response = await callLLM({
          messages: [
            {
              role: 'system',
              content: `You are the Witness — a metacognitive observer. Given the anomalies detected, decide whether to intervene or just log. Be conservative: interventions have side effects. Respond with JSON: {"intervene": true/false, "type": "intervention_type", "reason": "..."}`,
            },
            {
              role: 'user',
              content: `Anomalies:\n${anomalies.map(a => `- [${a.severity}] ${a.type}: ${a.description}`).join('\n')}\n\nSuggested intervention: ${interventionType}\n\nShould we intervene?`,
            },
          ],
          temperature: 0.2,
          jsonMode: true,
          maxTokens: 200,
          task: 'enrichment_reasoner',
        });
        this.witnessCostUsd += response.costUsd;
        const parsed = parseJson<{ intervene: boolean; type: InterventionType; reason: string }>(response.content);
        if (parsed) {
          return {
            intendResult: {
              phase: 'INTEND',
              output: parsed.reason,
              confidence: 0.8,
              durationMs: this.clock.now() - start,
            },
            shouldIntervene: parsed.intervene,
            interventionType: parsed.type || interventionType,
          };
        }
      } catch (err) {
        // Fall back to rule-based
      }
    }

    // Rule-based: intervene if any anomaly is high or critical
    const shouldIntervene = sortedAnomalies.some(a => a.severity === 'high' || a.severity === 'critical');

    return {
      intendResult: {
        phase: 'INTEND',
        output: shouldIntervene
          ? `Intervening with ${interventionType} due to ${sortedAnomalies.length} anomalies (highest: ${topAnomaly.severity})`
          : `Anomalies detected but severity is low — logging only`,
        confidence: 0.7,
        durationMs: this.clock.now() - start,
      },
      shouldIntervene,
      interventionType: shouldIntervene ? interventionType : null,
    };
  }

  // ─── Phase 5: PLAN ────────────────────────────────────────────────────────

  private async plan(
    observation: PipelineObservation,
    interventionType: InterventionType,
    anomalies: AnomalyEvent[],
  ): Promise<{ planResult: PhaseResult; plannedIntervention: InterventionRecord }> {
    const start = this.clock.now();

    const reason = anomalies.map(a => a.description).join('; ');
    const params = this.buildInterventionParams(interventionType, observation, anomalies);

    const intervention: InterventionRecord = {
      id: `intervention_${Date.now()}`,
      type: interventionType,
      pipelineStep: observation.pipelineStep,
      reason,
      action: this.describeIntervention(interventionType, params),
      params,
      approved: false, // Will be set by ACT phase
      requestedAt: this.clock.now(),
    };

    return {
      planResult: {
        phase: 'PLAN',
        output: `Planned intervention: ${intervention.action}`,
        confidence: 0.8,
        durationMs: this.clock.now() - start,
      },
      plannedIntervention: intervention,
    };
  }

  // ─── Phase 6: ACT ─────────────────────────────────────────────────────────

  private async act(intervention: InterventionRecord): Promise<PhaseResult> {
    const start = this.clock.now();

    // Validate with WriteGuard
    const guardDecision = await this.writeGuard.validate({
      type: intervention.type,
      pipelineStep: intervention.pipelineStep,
      params: intervention.params,
    });

    if (guardDecision.verdict === 'deny') {
      intervention.approved = false;
      intervention.rejectionReason = guardDecision.reason;
      this.state.interventions.push(intervention);
      await this.eventBus.emitIntervention(intervention);
      return {
        phase: 'ACT',
        output: `Intervention denied by WriteGuard: ${guardDecision.reason}`,
        confidence: 1.0,
        durationMs: this.clock.now() - start,
      };
    }

    // Apply modifications if the guard modified the params
    if (guardDecision.verdict === 'modify' && guardDecision.modifiedParams) {
      intervention.params = guardDecision.modifiedParams;
    }

    // Execute the intervention
    intervention.approved = true;
    intervention.executedAt = this.clock.now();

    try {
      const result = await this.executor.execute(intervention);
      intervention.result = result.result;
    } catch (err) {
      intervention.result = 'failed';
    }

    this.state.interventions.push(intervention);
    await this.eventBus.emitIntervention(intervention);

    return {
      phase: 'ACT',
      output: `Intervention ${intervention.type} executed: ${intervention.result || 'unknown'}`,
      confidence: 0.9,
      durationMs: this.clock.now() - start,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildInterventionParams(
    type: InterventionType,
    observation: PipelineObservation,
    anomalies: AnomalyEvent[],
  ): Record<string, any> {
    switch (type) {
      case 'force_synthesis':
        return { stepIndex: this.state.currentStep };
      case 'abort_step':
        return { stepId: observation.pipelineStep };
      case 'adjust_threshold':
        // Find a threshold-related anomaly
        const budgetAnomaly = anomalies.find(a => a.type === 'budget_depletion');
        if (budgetAnomaly) {
          return {
            thresholdName: 'budgetCap',
            currentValue: this.state.budgetCapUsd,
            newValue: this.state.budgetCapUsd * 1.1, // Try to increase by 10%
          };
        }
        return { thresholdName: 'trustScore', currentValue: 65, newValue: 55 };
      case 'modify_prompt':
        return {
          agentId: observation.pipelineStep,
          appendFragment: 'Be extra careful with citations. Every claim must have a [SRC-N] citation.',
        };
      case 'switch_provider':
        return { fromProvider: observation.llmCalls[0]?.provider, toProvider: 'anthropic' };
      case 'skip_optional_step':
        return { stepId: 'debate' }; // Skip the next optional step
      case 'retry_with_feedback':
        return {
          stepId: observation.pipelineStep,
          feedback: `Previous attempt had issues: ${anomalies.map(a => a.description).join('; ')}. Please fix these issues.`,
          maxRetries: 1,
        };
      case 'request_human_review':
        return { stepId: observation.pipelineStep, reason: anomalies.map(a => a.description).join('; ') };
      case 'reduce_scope':
        return { reduceSourcesBy: 0.3 }; // Reduce source count by 30%
      case 'add_step':
        return { stepType: 'self_correction', afterStep: observation.pipelineStep };
      default:
        return {};
    }
  }

  private describeIntervention(type: InterventionType, params: Record<string, any>): string {
    switch (type) {
      case 'force_synthesis': return 'Force the agent to produce a synthesis now';
      case 'abort_step': return `Abort step ${params.stepId}`;
      case 'adjust_threshold': return `Adjust ${params.thresholdName} from ${params.currentValue} to ${params.newValue}`;
      case 'modify_prompt': return `Append to ${params.agentId} prompt: "${params.appendFragment?.slice(0, 60)}..."`;
      case 'switch_provider': return `Switch from ${params.fromProvider} to ${params.toProvider}`;
      case 'skip_optional_step': return `Skip optional step ${params.stepId}`;
      case 'retry_with_feedback': return `Retry ${params.stepId} with feedback`;
      case 'request_human_review': return `Request human review for ${params.stepId}`;
      case 'reduce_scope': return `Reduce scope by ${Math.round(params.reduceSourcesBy * 100)}%`;
      case 'add_step': return `Add ${params.stepType} step after ${params.afterStep}`;
      default: return type;
    }
  }

  private computeSeverity(anomalies: AnomalyEvent[]): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (anomalies.length === 0) return 'none';
    const sevOrder = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
    const maxSev = Math.max(...anomalies.map(a => sevOrder[a.severity]));
    return (['none', 'low', 'medium', 'high', 'critical'] as const)[maxSev];
  }

  private buildAssessment(
    observation: PipelineObservation,
    anomalies: AnomalyEvent[],
    phases: Partial<Record<CognitivePhase, PhaseResult>>,
  ): CycleAssessment {
    const onTrack = anomalies.length === 0;
    const severity = this.computeSeverity(anomalies);
    const issues = anomalies.map(a => a.description);
    const recommendations = anomalies
      .map(a => a.suggestedIntervention)
      .filter(Boolean)
      .map(t => `Consider: ${t}`);

    return { onTrack, severity, issues, recommendations };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  getState(): WitnessState {
    return { ...this.state };
  }

  getHealthScore(): number {
    return this.state.healthScore;
  }

  getTotalAnomalies(): number {
    return this.state.anomalies.length;
  }

  getTotalInterventions(): number {
    return this.state.interventions.filter(i => i.approved).length;
  }

  getWitnessCostUsd(): number {
    return this.witnessCostUsd;
  }
}
