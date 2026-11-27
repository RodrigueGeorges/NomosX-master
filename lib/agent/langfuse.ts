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
 * 2. Ingestion OpenTelemetry : Langfuse Cloud a supprimé l'API v3
 *    (/api/public/ingestion → 410). On émet désormais des spans OTLP/HTTP
 *    JSON vers /api/public/otel/v1/traces — Langfuse mappe chaque span en
 *    observation (trace / span / generation / event) via les attributs
 *    `langfuse.*` et `gen_ai.*`. Les scores restent sur /api/public/scores.
 * 3. Activable via env vars : ENABLE_LANGFUSE=true + LANGFUSE_PUBLIC_KEY +
 *    LANGFUSE_SECRET_KEY. LANGFUSE_BASE_URL pointe vers cloud.langfuse.com
 *    OU une instance self-hosted (même API).
 *
 * Note : tout est fire-and-forget — un échec d'export ne doit JAMAIS casser
 * le pipeline. Toutes les fonctions retournent immédiatement après enqueue.
 */

import { createHash } from 'node:crypto';
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
  /** OTLP/HTTP JSON traces endpoint (Langfuse OTEL ingestion). */
  otelTracesUrl: string;
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
    /** OTLP traces endpoint — defaults to the Langfuse Cloud path; override
     *  for self-hosted instances exposing a different collector route. */
    otelTracesUrl:
      process.env.LANGFUSE_OTEL_TRACES_URL ||
      `${process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'}/api/public/otel/v1/traces`,
    enabled: process.env.ENABLE_LANGFUSE === 'true' && !!process.env.LANGFUSE_PUBLIC_KEY,
    release: process.env.LANGFUSE_RELEASE || 'nomosx-v7',
  };
}

// ─── Ingestion Queue ────────────────────────────────────────────────────────

const queue: QueuedEvent[] = [];
const FLUSH_AT = 20;
let flushing = false;
// Langfuse Cloud removed the v3 ingestion API on 2026-11-16 — a 410/404 is
// permanent, not transient. Without this latch the queue re-fills forever
// and every flush re-logs the deprecation payload.
let ingestionDisabled = false;

// ─── OTLP translation ───────────────────────────────────────────────────────
// Langfuse ingests OTLP/HTTP JSON at /api/public/otel/v1/traces and maps
// `langfuse.*` / `gen_ai.*` span attributes onto its data model. OTEL ids are
// 32-hex trace / 16-hex span — derived deterministically from our logical ids
// so a span emitted in one flush resolves its parent emitted in an earlier one.

function shaHex(input: string, len: number): string {
  return createHash('sha256').update(input).digest('hex').slice(0, len);
}
function otelTraceId(logicalTraceId: string): string {
  return shaHex(`trace:${logicalTraceId}`, 32);
}
function otelSpanId(logicalSpanId: string): string {
  const h = shaHex(`span:${logicalSpanId}`, 16);
  return /^0+$/.test(h) ? '1'.repeat(16) : h;
}
function nanoTime(isoStr: string): string {
  const ms = Date.parse(isoStr);
  return Number.isFinite(ms) ? (BigInt(ms) * BigInt(1_000_000)).toString() : '0';
}

type OtlpAttrValue = { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean };
interface OtlpAttr { key: string; value: OtlpAttrValue }
const sAttr = (key: string, v: unknown): OtlpAttr => ({
  key,
  value: { stringValue: typeof v === 'string' ? v : JSON.stringify(v) },
});
const iAttr = (key: string, v: number): OtlpAttr => ({
  key,
  value: { intValue: String(Math.trunc(v)) },
});

/** Flatten a metadata object into `prefix.<key>` string attributes — the
 *  shape Langfuse maps back into filterable top-level metadata. */
function metadataAttrs(prefix: string, meta: unknown, out: OtlpAttr[]): void {
  if (!meta || typeof meta !== 'object') return;
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    out.push(sAttr(`${prefix}.${k}`, typeof v === 'object' ? JSON.stringify(v) : v));
  }
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttr[];
  status: { code: string; message?: string };
}

/** Logical span ids already exported — used to decide whether a
 *  parentObservationId reference is resolvable (avoids dangling parents). */
const emittedSpanIds = new Set<string>();
const MAX_EMITTED = 20_000;
/** Alias from trace-context step ids (`step_<uuid>` pushed by openTraceStep)
 *  to the span-create logical id (`span_...`) that actually gets emitted —
 *  generations parent to the openSteps id, spans are emitted under span ids. */
const stepIdAlias = new Map<string, string>();
/** Trace display names by logical trace id — propagated to child spans so
 *  Langfuse aggregations on `langfuse.trace.name` resolve per the docs. */
const traceNames = new Map<string, string>();

function resolveParentSpanId(
  parentObservationId: string | undefined,
  logicalTraceId: string,
): string | undefined {
  const candidates: string[] = [];
  if (parentObservationId) {
    candidates.push(stepIdAlias.get(parentObservationId) ?? parentObservationId);
  }
  // Step/event/generation spans hang off the trace root span, whose logical
  // id IS the trace id (trace-create is emitted with id = ctx.traceId).
  candidates.push(logicalTraceId);
  for (const logical of candidates) {
    const otel = otelSpanId(logical);
    if (emittedSpanIds.has(otel)) return otel;
  }
  return undefined;
}

function commonAttrs(ev: QueuedEvent, extra: OtlpAttr[]): OtlpAttr[] {
  const attrs: OtlpAttr[] = [];
  const config = getLangfuseConfig();
  const traceName = traceNames.get(String(ev.body.traceId ?? ev.body.id ?? ''));
  if (traceName) attrs.push(sAttr('langfuse.trace.name', traceName));
  attrs.push(sAttr('langfuse.release', config.release ?? ''));
  attrs.push(sAttr('langfuse.version', config.release ?? ''));
  if (ev.body.metadata && typeof ev.body.metadata === 'object') {
    const m = ev.body.metadata as Record<string, unknown>;
    if (m.runId !== undefined) attrs.push(sAttr('langfuse.trace.metadata.runId', m.runId));
  }
  attrs.push(...extra);
  return attrs;
}

function eventToSpan(ev: QueuedEvent): OtlpSpan | null {
  const b = ev.body as Record<string, any>;
  const logicalTraceId = String(b.traceId ?? b.id ?? '');
  if (!logicalTraceId) return null;
  const traceId = otelTraceId(logicalTraceId);
  const spanId = otelSpanId(String(b.id ?? `${ev.type}:${ev.timestamp}`));
  const start = typeof b.startTime === 'string' ? b.startTime : ev.timestamp;
  const end = typeof b.endTime === 'string' ? b.endTime : ev.timestamp;
  const level = String(b.level ?? 'DEFAULT');
  const status =
    level === 'ERROR'
      ? { code: 'STATUS_CODE_ERROR', message: String(b.statusMessage ?? '') }
      : level === 'WARNING'
        ? { code: 'STATUS_CODE_UNSET', message: String(b.statusMessage ?? '') }
        : { code: 'STATUS_CODE_UNSET' };

  let name = String(b.name ?? ev.type);
  let type = 'span';
  const extra: OtlpAttr[] = [];
  let parentObservationId: string | undefined;

  if (ev.type === 'trace-create') {
    // Root span of the trace — carries trace-level fields.
    name = String(b.name ?? 'pipeline');
    traceNames.set(logicalTraceId, name);
    extra.push(sAttr('langfuse.trace.name', name));
    if (b.input !== undefined) extra.push(sAttr('langfuse.observation.input', JSON.stringify(b.input)));
    metadataAttrs('langfuse.trace.metadata', b.metadata, extra);
  } else if (ev.type === 'span-create') {
    type = 'span';
    name = `step.${String(b.name ?? '').replace(/^step\./, '')}` || name;
    if (b.input !== undefined) extra.push(sAttr('langfuse.observation.input', JSON.stringify(b.input)));
    extra.push(sAttr('langfuse.observation.level', level));
    if (b.statusMessage) extra.push(sAttr('langfuse.observation.status_message', String(b.statusMessage)));
    metadataAttrs('langfuse.observation.metadata', b.metadata, extra);
  } else if (ev.type === 'generation-create') {
    type = 'generation';
    parentObservationId = b.parentObservationId ? String(b.parentObservationId) : undefined;
    const model = String(b.model ?? 'unknown');
    extra.push(sAttr('langfuse.observation.model.name', model));
    extra.push(
      sAttr(
        'langfuse.observation.model.parameters',
        JSON.stringify(b.modelParameters ?? {}),
      ),
    );
    const u = (b.usage ?? {}) as Record<string, number>;
    const inTok = Number(u.input ?? 0);
    const outTok = Number(u.output ?? 0);
    const totTok = Number(u.total ?? inTok + outTok);
    extra.push(iAttr('gen_ai.usage.input_tokens', inTok));
    extra.push(iAttr('gen_ai.usage.output_tokens', outTok));
    extra.push(iAttr('gen_ai.usage.total_tokens', totTok));
    extra.push(sAttr('langfuse.observation.usage_details', JSON.stringify({ input: inTok, output: outTok, total: totTok, unit: 'TOKENS' })));
    const metaCost = (b.metadata as Record<string, unknown> | undefined)?.costUsd;
    const costUsd = typeof b.costUsd === 'number' ? b.costUsd : typeof metaCost === 'number' ? metaCost : undefined;
    if (costUsd !== undefined) {
      extra.push(sAttr('langfuse.observation.cost_details', JSON.stringify({ total: costUsd })));
    }
    if (b.completionStartTime) {
      extra.push(sAttr('langfuse.observation.completion_start_time', String(b.completionStartTime)));
    }
    if (b.input !== undefined) extra.push(sAttr('langfuse.observation.input', JSON.stringify(b.input)));
    if (b.output !== undefined) extra.push(sAttr('langfuse.observation.output', JSON.stringify(b.output)));
    extra.push(sAttr('langfuse.observation.level', level));
    metadataAttrs('langfuse.observation.metadata', b.metadata, extra);
  } else if (ev.type === 'event-create') {
    type = 'event';
    if (b.output !== undefined) extra.push(sAttr('langfuse.observation.output', JSON.stringify(b.output)));
    extra.push(sAttr('langfuse.observation.level', level));
    if (b.statusMessage) extra.push(sAttr('langfuse.observation.status_message', String(b.statusMessage)));
    metadataAttrs('langfuse.observation.metadata', b.metadata, extra);
  } else {
    return null;
  }

  const attrs = commonAttrs(ev, extra);
  attrs.unshift(sAttr('langfuse.observation.type', type));

  const parentSpanId =
    ev.type === 'trace-create' ? undefined : resolveParentSpanId(parentObservationId, logicalTraceId);

  const span: OtlpSpan = {
    traceId,
    spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    name,
    kind: 'SPAN_KIND_INTERNAL',
    startTimeUnixNano: nanoTime(start),
    endTimeUnixNano: nanoTime(end),
    attributes: attrs,
    status,
  };
  emittedSpanIds.add(spanId);
  if (emittedSpanIds.size > MAX_EMITTED) {
    const it = emittedSpanIds.values();
    for (let i = 0; i < MAX_EMITTED / 2; i++) { const n = it.next(); if (n.done) break; emittedSpanIds.delete(n.value); }
  }
  return span;
}

function enqueue(event: QueuedEvent): void {
  const config = getLangfuseConfig();
  if (!config.enabled || ingestionDisabled) return;
  queue.push(event);
  if (queue.length >= FLUSH_AT) void flushAll();
}

async function flushAll(): Promise<void> {
  const config = getLangfuseConfig();
  if (!config.enabled || ingestionDisabled || queue.length === 0 || flushing) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    const spans = batch.map(eventToSpan).filter((s): s is OtlpSpan => s !== null);
    if (spans.length === 0) return;
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'nomosx-agent' } },
              { key: 'service.version', value: { stringValue: config.release ?? '' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'nomosx-agent', version: config.release ?? '1.0.0' },
              spans,
            },
          ],
        },
      ],
    };
    const res = await fetch(config.otelTracesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
        // v4 ingestion header → real-time visibility on the v4 data model.
        'x-langfuse-ingestion-version': '4',
      },
      body: JSON.stringify(payload),
      // Langfuse ingestion is best-effort; never let a slow endpoint stall a run.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 404 || res.status === 410 || body.includes('LANGFUSE_V3_API_REMOVED')) {
        ingestionDisabled = true;
        queue.length = 0;
        console.warn(`[Langfuse] OTEL ingestion endpoint rejected (${res.status}) — trace ingestion disabled for this process. Check LANGFUSE_OTEL_TRACES_URL / self-hosted version.`);
        return;
      }
      console.warn(`[Langfuse] OTEL ingestion failed: ${res.status} ${body.slice(0, 300)}`);
      queue.unshift(...batch); // re-queue (bounded by FLUSH_AT churn)
      if (queue.length > 500) queue.splice(0, queue.length - 500);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Execution scopes abort with '<label> scope closed' once their work
    // ends — a late flush hitting that must DROP the batch, not requeue it
    // into an endless retry loop (run-15: 17 identical warnings).
    if (/scope closed/i.test(msg)) {
      console.debug('[Langfuse] OTEL batch dropped — execution scope closed');
    } else {
      console.warn('[Langfuse] OTEL ingestion error:', err);
      queue.unshift(...batch);
      if (queue.length > 500) queue.splice(0, queue.length - 500);
    }
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
const openStepSpans = new Map<string, { id: string; name: string; start: number; traceId: string }>();

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
    openStepSpans.set(key, { id, name: step, start: Date.now(), traceId: ctx.traceId });
    // Generations parent to the innermost openSteps id (`step_<uuid>`), not
    // to this span id — alias it so OTEL parent resolution finds the span.
    const openStepId = ctx.openSteps[ctx.openSteps.length - 1];
    if (openStepId) stepIdAlias.set(openStepId, id);
    // OTLP spans are immutable — 'started' is NOT enqueued. The terminal
    // event below emits one span carrying start+end. An orphaned 'started'
    // (process death) is simply never exported, same as v3 best-effort.
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
      traceId: open.traceId,
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
        // Scores attach to the OTEL trace id (the hex Langfuse displays),
        // not the internal logical `trace_...` id.
        scores: batch.map(s => ({ traceId: otelTraceId(s.traceId), name: s.name, value: s.value, comment: s.comment })),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // A score can race the async trace ingestion (400 trace-not-found) —
    // retry once after a short delay before re-queueing.
    if (res.status === 400) {
      await new Promise(r => setTimeout(r, 5000));
      const retry = await fetch(`${config.baseUrl}/api/public/scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
        },
        body: JSON.stringify({
          scores: batch.map(s => ({ traceId: otelTraceId(s.traceId), name: s.name, value: s.value, comment: s.comment })),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (retry.ok) return;
    }
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

/**
 * Emit the publication-gate verdict onto the run's trace. Called from the
 * inquiry orchestrator AFTER runPipeline returns — outside the ALS trace
 * context — so it addresses the trace directly by id (`trace_<runId>`,
 * the deterministic id pipeline-v2 assigns). Carries the verdict the spec
 * asks Langfuse to hold: gate decision, failed checks, trust/quality and
 * the artifact versions the verdict was computed on.
 */
export function traceGateVerdict(
  runId: string,
  verdict: {
    decision?: string;
    trustScore?: number;
    qualityScore?: number;
    failedChecks?: string[];
    artifactVersions?: { analysis?: number; html?: number };
    publicationStatus?: string;
  },
): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;
  const traceId = `trace_${runId}`;
  enqueue({
    id: `${traceId}_gate`,
    type: 'event-create',
    timestamp: iso(Date.now()),
    body: {
      traceId,
      name: 'gate.verdict',
      metadata: { runId, ...verdict },
      level: verdict.decision === 'publish' ? 'DEFAULT' : 'WARNING',
    },
  });
  if (typeof verdict.trustScore === 'number') {
    queueScoreInternal(traceId, 'gate_trust_score', verdict.trustScore);
  }
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
  // Drain step spans that never saw a terminal event (aborted steps) so they
  // still export with an 'unterminated' marker instead of vanishing silently.
  const now = Date.now();
  for (const open of openStepSpans.values()) {
    enqueue({
      id: open.id,
      type: 'span-create',
      timestamp: iso(now),
      body: {
        id: open.id,
        traceId: open.traceId,
        name: `step.${open.name.toLowerCase()}`,
        startTime: iso(open.start),
        endTime: iso(now),
        level: 'WARNING',
        statusMessage: 'unterminated at flush',
        metadata: { step: open.name, status: 'unterminated' },
      },
    });
  }
  openStepSpans.clear();
  await flushAll();
  await flushScores();
}
