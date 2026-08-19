/**
 * Durable Execution — NomosX Sprint 6 (Gap 12) — ÉVALUATION
 *
 * Évaluation des options pour remplacer la job queue par une orchestration durable.
 * Inspiré de :
 * - Temporal (temporal.io) — durable workflows with replay
 * - Inngest AgentKit — AI-native durable orchestration
 * - Rivet agentOS — durable workflows with WebAssembly
 *
 * Le problème :
 * La job queue NomosX est priority-based mais pas *durable*. En cas de crash,
 * les runs en cours sont perdus. Les runs "strategic" peuvent durer 10+ min.
 *
 * Options évaluées :
 *
 * 1. Temporal (Go core, TS SDK)
 *    + Très mature, durable, replay, compensation
 *    + Excellent pour workflows longs
 *    - Nécessite un serveur Temporal séparé (complexité ops)
 *    - Apprentissage non-trivial
 *    - Coût d'infrastructure
 *
 * 2. Inngest (cloud + open-source)
 *    + TypeScript natif, intégration Next.js facile
 *    + Durable execution, retries, scheduling
 *    - Moins mature que Temporal
 *    - Lock-in cloud si version cloud
 *    + Idéal pour pipeline NomosX (Next.js)
 *
 * 3. Rivet agentOS (TS, WebAssembly)
 *    + Isolation parfaite des agents
 *    + Durable workflows
 *    - Très nouveau, écosystème limité
 *    - WebAssembly impose des contraintes
 *
 * Recommandation pour NomosX :
 * - Court terme : améliorer la job queue actuelle avec idempotence + retry + snapshot
 * - Moyen terme : évaluer Inngest pour une migration progressive
 * - Long terme : Temporal si la charge justifie l'ops
 *
 * Cette implémentation fournit un wrapper durable *léger* autour de la job queue
 * actuelle : snapshots + resume + idempotence, sans ajouter de dépendance externe.
 */

import { prisma } from '../db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DurableExecutionState {
  /** Pipeline run ID */
  runId: string;
  /** Query */
  query: string;
  /** Current step */
  currentStep: string;
  /** Steps already completed */
  completedSteps: string[];
  /** Step outputs */
  stepOutputs: Record<string, any>;
  /** Total cost */
  totalCostUsd: number;
  /** Created at */
  createdAt: number;
  /** Last updated */
  updatedAt: number;
  /** Status */
  status: 'running' | 'paused' | 'completed' | 'failed';
}

export interface StepResult<T = any> {
  step: string;
  output: T;
  costUsd: number;
  completedAt: number;
}

// ─── Lightweight Durable Runner ─────────────────────────────────────────────

/**
 * Run a function durably:
 * 1. Check if step was already completed
 * 2. If yes, return cached output
 * 3. If no, execute, persist, then return
 *
 * This gives "durable execution" without an external orchestrator.
 */
export async function runDurableStep<T>(
  runId: string,
  step: string,
  fn: () => Promise<T>,
  options: { costUsd?: number } = {},
): Promise<T> {
  const state = await loadDurableState(runId);

  // Step already completed? Return cached output.
  if (state?.completedSteps.includes(step)) {
    console.log(`[Durable] Step ${step} already completed for ${runId} — returning cached output`);
    return state.stepOutputs[step] as T;
  }

  // Execute the step
  let output: T;
  try {
    output = await fn();
  } catch (err) {
    console.error(`[Durable] Step ${step} failed for ${runId}:`, err);
    throw err;
  }

  // Persist state
  await persistStep(runId, step, output, options.costUsd || 0);

  return output;
}

// ─── State Management ───────────────────────────────────────────────────────

async function loadDurableState(runId: string): Promise<DurableExecutionState | null> {
  try {
    const records = await prisma.agentAuditLog.findMany({
      where: { agent: 'durable_execution', resource: runId },
      orderBy: { timestamp: 'asc' },
    });

    if (records.length === 0) return null;

    const state: DurableExecutionState = {
      runId,
      query: '',
      currentStep: '',
      completedSteps: [],
      stepOutputs: {},
      totalCostUsd: 0,
      createdAt: 0,
      updatedAt: 0,
      status: 'running',
    };

    for (const record of records) {
      const metadata = record.metadata || '{}';
      if (record.action === 'DURABLE_INIT') {
        const data = JSON.parse(metadata);
        state.query = data.query;
        state.createdAt = data.createdAt;
        state.status = data.status;
      } else if (record.action === 'DURABLE_STEP') {
        const data = JSON.parse(metadata);
        state.completedSteps.push(data.step);
        state.stepOutputs[data.step] = data.output;
        state.totalCostUsd += data.costUsd;
        state.updatedAt = data.completedAt;
      }
    }

    state.currentStep = state.completedSteps[state.completedSteps.length - 1] || '';
    return state;
  } catch (err) {
    console.warn('[Durable] Load state failed:', err);
    return null;
  }
}

async function persistStep(runId: string, step: string, output: any, costUsd: number): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        action: 'DURABLE_STEP',
        agent: 'durable_execution',
        resource: runId,
        metadata: JSON.stringify({
          step,
          output,
          costUsd,
          completedAt: Date.now(),
        }),
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.warn('[Durable] Persist step failed:', err);
  }
}

export async function initDurableRun(
  runId: string,
  query: string,
): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        action: 'DURABLE_INIT',
        agent: 'durable_execution',
        resource: runId,
        metadata: JSON.stringify({
          query,
          createdAt: Date.now(),
          status: 'running',
        }),
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.warn('[Durable] Init failed:', err);
  }
}

// ─── Migration Notes ────────────────────────────────────────────────────────

/**
 * Evaluation summary for external durable execution engines.
 */
export interface DurableExecutionOption {
  name: string;
  fit: 'poor' | 'fair' | 'good' | 'excellent';
  effort: 'low' | 'medium' | 'high';
  notes: string[];
}

export const DURABLE_EXECUTION_OPTIONS: DurableExecutionOption[] = [
  {
    name: 'Current job queue + lightweight durable wrapper',
    fit: 'good',
    effort: 'low',
    notes: [
      'No new dependency',
      'Idempotence + snapshot via AgentAuditLog',
      'Resilient to most crashes',
      'Limited to process-level recovery',
    ],
  },
  {
    name: 'Inngest',
    fit: 'excellent',
    effort: 'medium',
    notes: [
      'TypeScript/Next.js native',
      'Durable execution, retries, scheduling',
      'Easy migration path from existing jobs',
      'Cloud dependency for full features',
    ],
  },
  {
    name: 'Temporal',
    fit: 'good',
    effort: 'high',
    notes: [
      'Most mature durable execution',
      'Requires separate Temporal server',
      'Go core + TS SDK',
      'Best for high-scale deployments',
    ],
  },
  {
    name: 'Rivet agentOS',
    fit: 'fair',
    effort: 'high',
    notes: [
      'WebAssembly isolation',
      'Durable workflows',
      'Newer, ecosystem limité',
      'Good for agent isolation',
    ],
  },
];
