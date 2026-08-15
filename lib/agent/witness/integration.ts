/**
 * Witness Integration — NomosX
 *
 * Câble le Witness dans le pipeline de production.
 * Le Witness observe chaque étape du pipeline et peut intervenir.
 *
 * Usage :
 *   const witnessCtx = createWitnessContext(runId, query, budgetCapUsd);
 *   // ... after each pipeline step:
 *   await witnessCtx.witness.observe(observation);
 *   // ... at the end:
 *   const learning = await witnessCtx.finalize();
 */

import { Witness, DEFAULT_WITNESS_CONFIG } from './cognitive-cycle';
import {
  ConsoleEventBus,
  DatabaseEventBus,
  InMemoryGoalStateStore,
  ProductionWriteGuard,
  DenyByDefaultWriteGuard,
  SystemClock,
  NoOpInterventionExecutor,
  type InterventionExecutor,
} from './seams';
import { runMetaLoop, extractRunLearning, buildLearningInjection } from './meta-loop';
import type { PipelineObservation, StepExpectation } from './types';
import { prisma } from '../../db';

// ─── Witness Context ────────────────────────────────────────────────────────

export interface WitnessContext {
  witness: Witness;
  goalStore: InMemoryGoalStateStore;
  /** Observe a pipeline step */
  observe(observation: PipelineObservation): Promise<void>;
  /** Run the meta-loop (after each step) */
  metaLoop(): Promise<{ recommendation: string; reason: string; healthScore: number }>;
  /** Finalize: extract learnings and persist */
  finalize(query: string): Promise<{
    healthScore: number;
    totalAnomalies: number;
    totalInterventions: number;
    qualityScore: number;
    recommendsChanges: boolean;
  }>;
}

// ─── Create Witness Context ─────────────────────────────────────────────────

export function createWitnessContext(
  runId: string,
  query: string,
  budgetCapUsd: number,
  options: {
    canIntervene?: boolean;
    useDatabase?: boolean;
    useLLM?: boolean;
    executor?: InterventionExecutor;
    steps?: string[];
  } = {},
): WitnessContext {
  const {
    canIntervene = true,
    useDatabase = true,
    useLLM = true,
    executor = new NoOpInterventionExecutor(), // Default: no-op (observational)
    steps = ['scout', 'rank', 'reader', 'analyst', 'editor'],
  } = options;

  // Create seams
  const eventBus = useDatabase
    ? new DatabaseEventBus(runId, prisma)
    : new ConsoleEventBus(runId);

  const goalStore = new InMemoryGoalStateStore({
    query,
    budgetCapUsd,
    steps,
  });

  const writeGuard = canIntervene
    ? new ProductionWriteGuard()
    : new DenyByDefaultWriteGuard();

  const clock = new SystemClock();

  // Create the Witness
  const witness = new Witness(
    runId,
    {
      ...DEFAULT_WITNESS_CONFIG,
      canIntervene,
      useLLM,
      label: `[Witness/${runId.slice(0, 8)}]`,
    },
    { eventBus, goalStore, writeGuard, clock, executor },
  );

  // Set default expectations
  goalStore.setExpectations('scout', {
    pipelineStep: 'scout',
    expectedCostUsd: { min: 0.005, max: 0.05 },
    expectedDurationSec: { min: 10, max: 60 },
    mustProduceOutput: true,
  });
  goalStore.setExpectations('rank', {
    pipelineStep: 'rank',
    expectedCostUsd: { min: 0.001, max: 0.02 },
    expectedDurationSec: { min: 5, max: 30 },
    mustProduceOutput: true,
  });
  goalStore.setExpectations('reader', {
    pipelineStep: 'reader',
    expectedCostUsd: { min: 0.03, max: 0.20 },
    expectedDurationSec: { min: 30, max: 180 },
    expectedQuality: { min: 50, max: 100 },
    mustProduceOutput: true,
  });
  goalStore.setExpectations('analyst', {
    pipelineStep: 'analyst',
    expectedCostUsd: { min: 0.10, max: 0.60 },
    expectedDurationSec: { min: 60, max: 360 },
    expectedQuality: { min: 60, max: 100 },
    minCitations: 3,
    maxHallucinationRisk: 0.3,
    mustProduceOutput: true,
  });
  goalStore.setExpectations('editor', {
    pipelineStep: 'editor',
    expectedCostUsd: { min: 0.005, max: 0.03 },
    expectedDurationSec: { min: 5, max: 30 },
    mustProduceOutput: true,
  });

  // Track current cost for budget monitoring
  let currentCost = 0;

  return {
    witness,
    goalStore,

    async observe(observation: PipelineObservation): Promise<void> {
      currentCost += observation.costUsd;
      goalStore.updateState({
        totalCostUsd: currentCost,
        currentStep: observation.pipelineStep,
        completedSteps: [...goalStore.getOutcomes().map(o => o.stepId)],
      });
      await witness.observe(observation);
    },

    async metaLoop() {
      const state = witness.getState();
      state.budgetCapUsd = budgetCapUsd;
      state.totalCostUsd = currentCost;
      const result = await runMetaLoop(witness, state);
      return {
        recommendation: result.recommendation,
        reason: result.reason,
        healthScore: result.healthScore,
      };
    },

    async finalize(query: string) {
      const learning = await extractRunLearning(runId, query, witness);
      return {
        healthScore: witness.getHealthScore(),
        totalAnomalies: witness.getTotalAnomalies(),
        totalInterventions: witness.getTotalInterventions(),
        qualityScore: learning.qualityScore,
        recommendsChanges: learning.recommendsChanges,
      };
    },
  };
}

// ─── Helper: Build Observation from Pipeline Step ───────────────────────────

export function buildObservation(
  stepName: string,
  result: {
    success: boolean;
    costUsd: number;
    durationMs: number;
    outputSummary: string;
    metrics?: Record<string, number>;
    errors?: string[];
    llmCalls?: Array<{
      provider: string;
      model: string;
      costUsd: number;
      tokensInput: number;
      tokensOutput: number;
      latencyMs: number;
      finishReason?: string;
    }>;
  },
  startedAt: number,
): PipelineObservation {
  return {
    pipelineStep: stepName,
    success: result.success,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    outputSummary: result.outputSummary,
    metrics: result.metrics || {},
    errors: result.errors || [],
    llmCalls: result.llmCalls || [],
    startedAt,
    endedAt: Date.now(),
  };
}

// Re-export for convenience
export { buildLearningInjection };
export type { PipelineObservation, StepExpectation };
