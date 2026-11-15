/**
 * Langfuse Observability — NomosX Sprint 6 (Gap 11), upgraded to v3 ingestion
 *
 * Intégration de Langfuse (TypeScript natif) pour l'observabilité des LLM calls.
 * Langfuse : tracing distribué, cost tracking, prompt management, datasets.
 *
 * Architecture :
 * 1. lib/agent/trace-context.ts porte un traceId/runId via AsyncLocalStorage —
 *    chaque pipeline run ouvre UN trace, chaque step et chaque appel LLM
 *    devient une observation enfant (span / generation) sans plumbing manuel.
 * 2. Ingestion API v3 : trace-create + span-create + generation-create.
 *    Langfuse calcule le coût depuis (model, usage) — on envoie les tokens.
 * 3. Activable via env vars : ENABLE_LANGFUSE=true + LANGFUSE_PUBLIC_KEY +
 *    LANGFUSE_SECRET_KEY. LANGFUSE_BASE_URL pointe vers cloud.langfuse.com
 *    OU une instance self-hosted (même API).
 *
 * Note : tout est fire-and-forget — un échec d'export ne doit JAMAIS casser
 * le pipeline. Toutes les fonctions retournent immédiatement après enqueue.
 */

import type { LLMRequest, LLMResponse } from '../llm/unified-llm';
import { getTraceContext, currentStepObservationId } from './trace-context';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LangfuseConfig {
  /** Langfuse public key */
  publicKey: string;
  /** Langfuse secret key */
  secretKey: string;
  /** Langfuse base URL (cloud or self-hosted) */
  baseUrl: string;
  /** Whether Langfuse is enabled */
  enabled: boolean;
  /** Release version */
  release?: string;
}

interface QueuedEvent {
  id: string;
  type: 'trace-create' | 'span-create' | 'generation-create' | 'event-create';
  timestamp: string;
  body: Record<string, unknown>;
}

// ─── Configuration ──────────────────────────────────────────────────────────

function getLangfuseConfig(): LangfuseConfig {
  return {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
    secretKey: process.env.LANGFUSE_SECRET_KEY || '',
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    enabled: process.env.ENABLE_LANGFUSE === 'true' && !!process.env.LANGFUSE_PUBLIC_KEY,
    release: process.env.LANGFUSE_RELEASE || 'nomosx-v7',
  };
}

// ─── Ingestion Queue ────────────────────────────────────────────────────────

const queue: QueuedEvent[] = [];
const FLUSH_AT = 20;
let flushing = false;

function enqueue(event: QueuedEvent): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;
  queue.push(event);
  if (queue.length >= FLUSH_AT) void flushAll();
}

async function flushAll(): Promise<void> {
  const config = getLangfuseConfig();
  if (!config.enabled || queue.length === 0 || flushing) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    const res = await fetch(`${config.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({ batch }),
      // Langfuse ingestion is best-effort; never let a slow endpoint stall a run.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[Langfuse] Ingestion failed: ${res.status} ${await res.text().catch(() => '')}`);
      queue.unshift(...batch); // re-queue (bounded by FLUSH_AT churn)
      if (queue.length > 500) queue.splice(0, queue.length - 500);
    }
  } catch (err) {
    console.warn('[Langfuse] Ingestion error:', err);
    queue.unshift(...batch);
    if (queue.length > 500) queue.splice(0, queue.length - 500);
  } finally {
    flushing = false;
  }
}

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

// ─── Trace lifecycle ────────────────────────────────────────────────────────

/**
 * Open a trace for a pipeline run. Call inside withTraceContext() so the
 * traceId stored in ALS matches the id Langfuse receives.
 */
export function tracePipelineStart(
  runId: string,
  query: string,
  options: Record<string, unknown> = {},
): void {
  const config = getLangfuseConfig();
  const ctx = getTraceContext();
  if (!config.enabled || !ctx) return;
  enqueue({
    id: ctx.traceId,
    type: 'trace-create',
    timestamp: iso(Date.now()),
    body: {
      id: ctx.traceId,
      name: ctx.name,
      input: query.slice(0, 4000),
      metadata: { ...ctx.metadata, ...options, runId },
      release: config.release,
      version: config.release,
    },
  });
}

export function tracePipelineEnd(
  runId: string,
  output: string,
  totalCost: number,
  durationMs: number,
  outcome?: { status?: string; trustScore?: number; qualityScore?: number },
): void {
  const config = getLangfuseConfig();
  const ctx = getTraceContext();
  if (!config.enabled || !ctx) return;
  // Close the trace by emitting a final event carrying the outcome — Langfuse
  // merges trace updates; scores go through the scores endpoint below.
  enqueue({
    id: `${ctx.traceId}_end`,
    type: 'event-create',
    timestamp: iso(Date.now()),
    body: {
      traceId: ctx.traceId,
      name: 'pipeline.end',
      output: output.slice(0, 2000),
      metadata: {
        runId,
        totalCostUsd: totalCost,
        durationMs,
        ...outcome,
      },
      level: outcome?.status === 'FAILED' ? 'ERROR' : 'DEFAULT',
    },
  });
  if (typeof outcome?.trustScore === 'number') {
    queueScoreInternal(ctx.traceId, 'trust_score', outcome.trustScore);
  }
  if (typeof outcome?.qualityScore === 'number') {
    queueScoreInternal(ctx.traceId, 'quality_score', outcome.qualityScore);
  }
}

// ─── Step spans ─────────────────────────────────────────────────────────────

/**
 * Record a pipeline step as a span under the current trace. Called from
 * emitProgress — started events open the span, terminal events close it.
 */
const openStepSpans = new Map<string, { id: string; name: string; start: number }>();

export function traceStep(
  runId: string,
  step: string,
  status: 'started' | 'completed' | 'failed' | 'skipped',
  message?: string,
): void {
  const config = getLangfuseConfig();
  const ctx = getTraceContext();
  if (!config.enabled || !ctx) return;
  const key = `${runId}:${step}`;

  if (status === 'started') {
    const id = `span_${ctx.traceId}_${step}_${Date.now()}`;
    openStepSpans.set(key, { id, name: step, start: Date.now() });
    enqueue({
      id,
      type: 'span-create',
      timestamp: iso(Date.now()),
      body: {
        id,
        traceId: ctx.traceId,
        name: `step.${step.toLowerCase()}`,
        input: message?.slice(0, 500),
        startTime: iso(Date.now()),
        metadata: { runId, step, status },
      },
    });
    return;
  }

  const open = openStepSpans.get(key);
  openStepSpans.delete(key);
  if (!open) return; // terminal without a recorded start (e.g. process restart)
  const end = Date.now();
  enqueue({
    id: open.id,
    type: 'span-create',
    timestamp: iso(end),
    body: {
      id: open.id,
      traceId: ctx.traceId,
      name: `step.${step.toLowerCase()}`,
      startTime: iso(open.start),
      endTime: iso(end),
      level: status === 'failed' ? 'ERROR' : status === 'skipped' ? 'WARNING' : 'DEFAULT',
      statusMessage: message?.slice(0, 500),
      metadata: { runId, step, status, durationMs: end - open.start },
    },
  });
}

// ─── LLM generations ────────────────────────────────────────────────────────

/**
 * Record one LLM call as a generation observation under the current step
 * span (or directly under the trace). Langfuse derives cost from
 * (model, usage) — we send raw token counts.
 */
export function traceLLMGeneration(
  request: LLMRequest,
  response: LLMResponse,
  task: string,
  latencyMs: number,
): void {
  const config = getLangfuseConfig();
  const ctx = getTraceContext();
  if (!config.enabled || !ctx) return;

  const parentObservationId = currentStepObservationId();
  const id = `gen_${ctx.traceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const start = Date.now() - latencyMs;
  const modelName = response.model || request.model || 'unknown';

  enqueue({
    id,
    type: 'generation-create',
    timestamp: iso(start),
    body: {
      id,
      traceId: ctx.traceId,
      ...(parentObservationId ? { parentObservationId } : {}),
      name: `llm.${task || 'call'}`,
      model: modelName,
      modelParameters: {
        provider: response.provider,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        jsonMode: request.jsonMode === true,
      },
      input: request.messages
        .slice(0, 20)
        .map(m => ({ role: m.role, content: String(m.content ?? '').slice(0, 2000) })),
      output: String(response.content ?? '').slice(0, 4000),
      startTime: iso(start),
      endTime: iso(Date.now()),
      completionStartTime: iso(start),
      usage: {
        input: response.tokensInput ?? 0,
        output: response.tokensOutput ?? 0,
        total: (response.tokensInput ?? 0) + (response.tokensOutput ?? 0),
        unit: 'TOKENS',
      },
      metadata: {
        runId: ctx.runId,
        provider: response.provider,
        family: response.family,
        task: task || request.task,
        costUsd: response.costUsd ?? 0,
        cached: response.cached === true,
        finishReason: response.finishReason ?? null,
        traceName: request.traceName ?? null,
      },
      level: 'DEFAULT',
    },
  });
}

// ─── Scores ─────────────────────────────────────────────────────────────────

const scoreQueue: Array<{ traceId: string; name: string; value: number; comment?: string }> = [];

function queueScoreInternal(traceId: string, name: string, value: number, comment?: string): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;
  scoreQueue.push({ traceId, name, value, comment });
  if (scoreQueue.length >= 10) void flushScores();
}

async function flushScores(): Promise<void> {
  const config = getLangfuseConfig();
  if (!config.enabled || scoreQueue.length === 0) return;
  const batch = scoreQueue.splice(0, scoreQueue.length);
  try {
    const res = await fetch(`${config.baseUrl}/api/public/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        scores: batch.map(s => ({ traceId: s.traceId, name: s.name, value: s.value, comment: s.comment })),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[Langfuse] Score flush failed: ${res.status}`);
      scoreQueue.unshift(...batch);
    }
  } catch (err) {
    console.warn('[Langfuse] Score flush error:', err);
    scoreQueue.unshift(...batch);
  }
}

// ─── Back-compat helpers (kept for existing callers) ────────────────────────

export interface LangfuseTrace {
  id: string;
  runId: string;
  name: string;
  input: string;
  output: string;
  metadata?: Record<string, any>;
  startTime: number;
  endTime: number;
  costUsd: number;
  model?: string;
  provider?: string;
  tokensInput?: number;
  tokensOutput?: number;
  latencyMs: number;
  parentId?: string;
}

export interface LangfuseScore {
  traceId: string;
  name: string;
  value: number;
  comment?: string;
}

export function queueTrace(trace: LangfuseTrace): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;
  enqueue({
    id: trace.id,
    type: 'trace-create',
    timestamp: iso(trace.startTime),
    body: {
      id: trace.id,
      name: trace.name,
      input: trace.input,
      output: trace.output,
      metadata: trace.metadata,
      release: config.release,
    },
  });
}

export function queueScore(score: LangfuseScore): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;
  queueScoreInternal(score.traceId, score.name, score.value, score.comment);
}

export function traceLLMCall(
  request: LLMRequest,
  response: LLMResponse,
  runId: string,
  name: string,
  parentId?: string,
  latencyMs?: number,
): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;
  queueTrace({
    id: `trace_${runId}_${name}_${Date.now()}`,
    runId,
    name,
    input: request.messages.map(m => `${m.role}: ${m.content?.slice(0, 500) || ''}`).join('\n'),
    output: response.content?.slice(0, 2000) || '',
    startTime: Date.now() - (latencyMs ?? 0),
    endTime: Date.now(),
    costUsd: response.costUsd,
    model: response.model,
    provider: response.provider,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    latencyMs: latencyMs ?? 0,
    parentId,
  });
}

export function scorePipeline(
  traceId: string,
  prmScore: number,
  citationCount: number,
  trustScore: number,
): void {
  queueScoreInternal(traceId, 'prm_score', prmScore);
  queueScoreInternal(traceId, 'citation_count', citationCount);
  queueScoreInternal(traceId, 'trust_score', trustScore);
}

/** Manual flush (call at end of run) — also invoked automatically at FLUSH_AT. */
export async function flushAllTraces(): Promise<void> {
  await flushAll();
  await flushScores();
}
