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
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  options: { costUsd?: number; resumeWindowMs?: number } = {},
): Promise<T> {
  const state = await loadDurableState(runId);

  // Step already completed in a still-open run? Return cached output.
  // Staleness guard: a completed run or a checkpoint older than the resume
  // window must not poison a new execution — reruns of the same query a week
  // later must re-scout fresh sources.
  const resumeWindow = options.resumeWindowMs ?? 12 * 60 * 60 * 1000; // 12h
  const isFresh = state && state.status === 'running'
    && (Date.now() - state.updatedAt) < resumeWindow;
  if (isFresh && state.completedSteps.includes(step)) {
    const cached = await resolveStepOutput(state.stepOutputs[step]);
    if (cached !== undefined) {
      console.log(`[Durable] Step ${step} already completed for ${runId} — returning cached output`);
      return cached as T;
    }
    // Checkpoint record exists but its payload is gone (tmp file purged) —
    // treat as a cache miss and re-execute below.
    throw new Error(`Durable checkpoint payload missing for ${runId}/${step}; refusing automatic replay`);
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

/**
 * Peek at a checkpointed step output without executing anything.
 * For code paths that can't be wrapped in a closure (imperative blocks
 * mutating outer scope) — guard them: `const ckpt = await durableResume(...);
 * if (!ckpt) { ...block...; await persistStep via durable() } else { rehydrate }`.
 */
export async function durableResume<T>(runId: string, step: string, resumeWindowMs = 12 * 60 * 60 * 1000): Promise<T | null> {
  const state = await loadDurableState(runId);
  const fresh = state && state.status === 'running' && (Date.now() - state.updatedAt) < resumeWindowMs;
  if (fresh && state.completedSteps.includes(step)) {
    return (await resolveStepOutput(state.stepOutputs[step])) ?? null;
  }
  return null;
}

/**
 * Mark a durable run as completed — its checkpoints stop being resumed.
 * Without this, every re-run of the same query would replay stale outputs.
 */
export async function markDurableComplete(runId: string): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      select: { id: true },
      data: {
        action: 'DURABLE_COMPLETE',
        agent: 'durable_execution',
        resource: runId,
        metadata: JSON.stringify({ completedAt: Date.now() }),
        timestamp: new Date(),
      },
    });
    // Drop file- and blob-backed checkpoints — the run is sealed, they can no
    // longer be resumed, and reader payloads run ~20MB apiece.
    await fs.rm(path.join(CHECKPOINT_DIR, runId.replace(/[^a-zA-Z0-9_-]/g, '_')), { recursive: true, force: true });
    await prisma.agentAuditLog
      .deleteMany({ where: { agent: 'durable_execution', action: 'DURABLE_STEP_BLOB', resource: { startsWith: `${runId}::` } } })
      .catch(() => undefined);
  } catch (err) {
    console.warn('[Durable] markComplete failed:', err);
  }
}

// ─── State Management ───────────────────────────────────────────────────────

async function loadDurableState(runId: string): Promise<DurableExecutionState | null> {
  try {
    const records = await prisma.agentAuditLog.findMany({
      where: {
        agent: 'durable_execution',
        action: { in: ['DURABLE_INIT', 'DURABLE_STEP', 'DURABLE_COMPLETE'] },
        OR: [{ resource: runId }, { resource: { startsWith: `${runId}::` } }],
      },
      orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
      select: { action: true, metadata: true },
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
        // Each INIT opens a new generation: a run that completed/failed/staled
        // and is re-attempted must not see the previous attempt's step outputs.
        state.query = data.query;
        state.createdAt = data.createdAt;
        state.status = data.status;
        state.completedSteps = [];
        state.stepOutputs = {};
        state.totalCostUsd = 0;
        state.updatedAt = data.createdAt;
      } else if (record.action === 'DURABLE_STEP') {
        const data = JSON.parse(metadata);
        state.completedSteps.push(data.step);
        // Large payloads are stored on disk — the audit row keeps only a ref.
        // Store the marker lazily so a state load does not re-parse a ~20MB
        // file on every runDurableStep call.
        state.stepOutputs[data.step] = data.fileRef ? { __checkpointFile: data.fileRef } : data.output;
        state.totalCostUsd += data.costUsd;
        state.updatedAt = data.completedAt;
      } else if (record.action === 'DURABLE_COMPLETE') {
        const data = JSON.parse(metadata);
        state.status = 'completed';
        state.updatedAt = data.completedAt;
      }
    }

    state.currentStep = state.completedSteps[state.completedSteps.length - 1] || '';
    return state;
  } catch (err) {
    console.warn('[Durable] Load state failed:', err);
    throw err;
  }
}

const FILE_THRESHOLD_BYTES = 512 * 1024; // >512KB payloads spill out of the step row (readings carry ~MBs of full text)
const CHECKPOINT_DIR = path.join(os.tmpdir(), 'nomosx-durable');
// Large payloads are stored in a dedicated audit row (`blob:` resource) — NOT
// in tmpdir. os.tmpdir() is wiped on every container restart, which is exactly
// the failure mode checkpoints exist to survive; the audit table is durable.
const BLOB_PREFIX = 'blob:';
const blobResourceFor = (runId: string, step: string) => `${runId}::${step}`;

async function writeCheckpointBlob(runId: string, step: string, serialized: string): Promise<string> {
  const resource = blobResourceFor(runId, step);
  // One blob per (run, step) — re-persisting after a reclaim replaces the old
  // row instead of accumulating ~MB duplicates per attempt on Neon.
  await prisma.agentAuditLog.deleteMany({
    where: { agent: 'durable_execution', action: 'DURABLE_STEP_BLOB', resource },
  });
  await prisma.agentAuditLog.create({
      select: { id: true },
    data: {
      action: 'DURABLE_STEP_BLOB',
      agent: 'durable_execution',
      resource,
      metadata: serialized,
      timestamp: new Date(),
    },
  });
  return `${BLOB_PREFIX}${resource}`;
}

async function readCheckpointBlob(resource: string): Promise<any> {
  try {
    const row = await prisma.agentAuditLog.findFirst({
      where: { agent: 'durable_execution', action: 'DURABLE_STEP_BLOB', resource },
      orderBy: { timestamp: 'desc' },
      select: { metadata: true },
    });
    return row?.metadata ? JSON.parse(row.metadata) : undefined;
  } catch {
    return undefined;
  }
}

async function readCheckpointFile(file: string): Promise<any> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return undefined; // checkpoint file gone (tmp cleaned) — resume degrades to re-run
  }
}

/** Resolve a step output — inline value, lazy blob-backed, or legacy file-backed marker. */
async function resolveStepOutput(output: any): Promise<any> {
  if (output && typeof output === 'object' && typeof output.__checkpointFile === 'string') {
    const ref: string = output.__checkpointFile;
    const value = ref.startsWith(BLOB_PREFIX)
      ? await readCheckpointBlob(ref.slice(BLOB_PREFIX.length))
      : await readCheckpointFile(ref);
    if (value === undefined) throw new Error('Durable checkpoint payload unavailable; refusing automatic replay');
    return value;
  }
  return output;
}

/** Persist a step output computed outside a runDurableStep closure. */
export async function saveDurableStep(runId: string, step: string, output: any, costUsd = 0): Promise<void> {
  await persistStep(runId, step, output, costUsd);
}

async function persistStep(runId: string, step: string, output: any, costUsd: number): Promise<void> {
  try {
    const serialized = JSON.stringify(output);
    if (serialized === undefined) throw new Error('Checkpoint output is not JSON serializable');
    const tooBig = Buffer.byteLength(serialized, 'utf8') > FILE_THRESHOLD_BYTES;
    const fileRef = tooBig ? await writeCheckpointBlob(runId, step, serialized) : undefined;
    // Step rows are keyed per (run, step): a re-persisted step replaces its
    // previous row so reclaim loops can't stack duplicate checkpoints.
    // A crash between delete and create degrades to a recompute — safe.
    const stepResource = blobResourceFor(runId, step);
    await prisma.agentAuditLog.deleteMany({
      where: { agent: 'durable_execution', action: 'DURABLE_STEP', resource: stepResource },
    });
    await prisma.agentAuditLog.create({
      select: { id: true },
      data: {
        action: 'DURABLE_STEP',
        agent: 'durable_execution',
        resource: stepResource,
        metadata: JSON.stringify({
          step,
          output: fileRef ? undefined : output,
          fileRef,
          costUsd,
          completedAt: Date.now(),
        }),
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.warn('[Durable] Persist step failed:', err);
    throw err;
  }
}

/**
 * Stable durable key — resumes must find the SAME state across retries.
 * Keying on pipelineRun.id never resumes (fresh id per attempt); keying on
 * the normalized query+format means a timed-out/failed run restarted by the
 * dispatcher or the next cron cycle picks up where it crashed.
 */
export function durableKeyFor(query: string, format: string): string {
  const normalized = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return `durable:${format}:${normalized}`;
}

export async function initDurableRun(
  runId: string,
  query: string,
  resumeWindowMs = 12 * 60 * 60 * 1000,
): Promise<void> {
  try {
    // Resume attempt: a 'running' state inside the window means the previous
    // attempt crashed — keep its checkpoints and skip writing a new INIT
    // (a new INIT would open a fresh generation and discard them).
    const existing = await loadDurableState(runId);
    if (existing && existing.status === 'running' && (Date.now() - existing.updatedAt) < resumeWindowMs) {
      return;
    }
    await prisma.agentAuditLog.create({
      select: { id: true },
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
    throw err;
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
