/**
 * Langfuse Observability — NomosX Sprint 6 (Gap 11)
 *
 * Intégration de Langfuse (TypeScript natif) pour l'observabilité des LLM calls.
 * Langfuse : tracing distribué, cost tracking, prompt management, datasets.
 *
 * Le problème :
 * NomosX a des dashboards custom mais pas d'observabilité production-grade
 * avec tracing distribué, traçage des coûts, gestion des prompts, etc.
 *
 * Architecture :
 * 1. Wrapper autour de callLLM pour envoyer les traces à Langfuse
 * 2. Traces structurées par run, agent, étape
 * 3. Scores : PRM, citations, trust
 * 4. Gestion des prompts : versionnement lié au Prompt Optimizer
 *
 * Note : Cette intégration est optionnelle. Activation via env vars.
 */

import type { LLMRequest, LLMResponse } from '../llm/unified-llm';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LangfuseConfig {
  /** Langfuse public key */
  publicKey: string;
  /** Langfuse secret key */
  secretKey: string;
  /** Langfuse base URL */
  baseUrl: string;
  /** Whether Langfuse is enabled */
  enabled: boolean;
  /** Release version */
  release?: string;
}

export interface LangfuseTrace {
  /** Trace ID */
  id: string;
  /** Run ID */
  runId: string;
  /** Agent/phase name */
  name: string;
  /** Input */
  input: string;
  /** Output */
  output: string;
  /** Metadata */
  metadata?: Record<string, any>;
  /** Start time */
  startTime: number;
  /** End time */
  endTime: number;
  /** Cost in USD */
  costUsd: number;
  /** Model used */
  model?: string;
  /** Provider used */
  provider?: string;
  /** Tokens used */
  tokensInput?: number;
  /** Tokens output */
  tokensOutput?: number;
  /** Latency in ms */
  latencyMs: number;
  /** Parent trace ID (for nested spans) */
  parentId?: string;
}

export interface LangfuseScore {
  traceId: string;
  /** Score name (e.g., 'prm_score', 'citation_count') */
  name: string;
  /** Score value */
  value: number;
  /** Comment */
  comment?: string;
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

const traces: LangfuseTrace[] = [];
const scores: LangfuseScore[] = [];

export function queueTrace(trace: LangfuseTrace): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;
  traces.push(trace);

  // Flush when queue reaches 10
  if (traces.length >= 10) {
    void flushTraces();
  }
}

export function queueScore(score: LangfuseScore): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;
  scores.push(score);

  if (scores.length >= 10) {
    void flushScores();
  }
}

// ─── Flush to Langfuse (simplified — no SDK dependency) ─────────────────────

async function flushTraces(): Promise<void> {
  const config = getLangfuseConfig();
  if (!config.enabled || traces.length === 0) return;

  const batch = traces.splice(0, traces.length);

  try {
    const res = await fetch(`${config.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        batch: batch.map(t => ({
          id: t.id,
          type: 'trace-create',
          timestamp: new Date(t.startTime).toISOString(),
          body: {
            id: t.id,
            name: t.name,
            input: t.input,
            output: t.output,
            metadata: t.metadata,
            timestamp: new Date(t.startTime).toISOString(),
            release: config.release,
          },
        })),
      }),
    });

    if (!res.ok) {
      console.warn(`[Langfuse] Trace flush failed: ${res.status} ${await res.text()}`);
      // Re-queue on failure
      traces.unshift(...batch);
    }
  } catch (err) {
    console.warn('[Langfuse] Trace flush error:', err);
    traces.unshift(...batch);
  }
}

async function flushScores(): Promise<void> {
  const config = getLangfuseConfig();
  if (!config.enabled || scores.length === 0) return;

  const batch = scores.splice(0, scores.length);

  try {
    const res = await fetch(`${config.baseUrl}/api/public/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        scores: batch.map(s => ({
          traceId: s.traceId,
          name: s.name,
          value: s.value,
          comment: s.comment,
        })),
      }),
    });

    if (!res.ok) {
      console.warn(`[Langfuse] Score flush failed: ${res.status} ${await res.text()}`);
      scores.unshift(...batch);
    }
  } catch (err) {
    console.warn('[Langfuse] Score flush error:', err);
    scores.unshift(...batch);
  }
}

// ─── Wrapper for LLM calls ──────────────────────────────────────────────────

/**
 * Trace an LLM call to Langfuse.
 *
 * @param request - The LLM request
 * @param response - The LLM response
 * @param runId - Pipeline run ID
 * @param name - Agent/phase name
 * @param parentId - Parent trace ID for nesting
 */
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

  const input = request.messages
    .map(m => `${m.role}: ${m.content?.slice(0, 500) || ''}`)
    .join('\n');

  const start = Date.now();
  const latency = latencyMs ?? 0;

  const trace: LangfuseTrace = {
    id: `trace_${runId}_${name}_${Date.now()}`,
    runId,
    name,
    input,
    output: response.content?.slice(0, 2000) || '',
    startTime: start - latency,
    endTime: start,
    costUsd: response.costUsd,
    model: response.model,
    provider: response.provider,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    latencyMs: latency,
    parentId,
  };

  queueTrace(trace);
}

// ─── Pipeline trace helpers ─────────────────────────────────────────────────

/**
 * Trace a full pipeline run.
 */
export function tracePipelineStart(runId: string, query: string, options: Record<string, any>): string {
  const config = getLangfuseConfig();
  if (!config.enabled) return '';

  const traceId = `pipeline_${runId}`;
  queueTrace({
    id: traceId,
    runId,
    name: 'pipeline',
    input: query,
    output: '',
    startTime: Date.now(),
    endTime: Date.now(),
    costUsd: 0,
    latencyMs: 0,
    metadata: options,
  });

  return traceId;
}

export function tracePipelineEnd(
  traceId: string,
  runId: string,
  output: string,
  totalCost: number,
  durationMs: number,
): void {
  const config = getLangfuseConfig();
  if (!config.enabled) return;

  queueTrace({
    id: traceId,
    runId,
    name: 'pipeline',
    input: '',
    output,
    startTime: Date.now() - durationMs,
    endTime: Date.now(),
    costUsd: totalCost,
    latencyMs: durationMs,
  });
}

// ─── Score helpers ──────────────────────────────────────────────────────────

export function scorePipeline(
  traceId: string,
  prmScore: number,
  citationCount: number,
  trustScore: number,
): void {
  queueScore({ traceId, name: 'prm_score', value: prmScore });
  queueScore({ traceId, name: 'citation_count', value: citationCount });
  queueScore({ traceId, name: 'trust_score', value: trustScore });
}

// ─── Manual flush (call at end of run) ──────────────────────────────────────

export async function flushAll(): Promise<void> {
  await flushTraces();
  await flushScores();
}
