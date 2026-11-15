/**
 * Trace context — AsyncLocalStorage carrier for observability spans.
 *
 * Mirrors lib/worker/execution-scope.ts: a pipeline run opens ONE trace
 * context; every LLM call and pipeline step inside it inherits the traceId
 * and parent chain automatically — no call-site plumbing required.
 *
 * Zero-dependency by design: the sink (lib/agent/langfuse.ts) decides
 * whether anything is exported (ENABLE_LANGFUSE). With tracing disabled the
 * context is still cheap (one ALS store per run) and all record* calls
 * no-op on the first config check.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceContextValue {
  /** Langfuse/OTel trace id — groups every observation of one run. */
  traceId: string;
  /** NomosX pipelineRun.id (or executionId) — the business correlation id. */
  runId: string;
  /** Human label shown as the root observation name. */
  name: string;
  /** Free-form tags: format, verticalSlug, publicationLanguage, depth… */
  metadata: Record<string, unknown>;
  /** Currently-open step span ids, innermost last — parents nest correctly
   *  even when steps overlap (parallel scout nodes). */
  openSteps: string[];
}

const traceStore = new AsyncLocalStorage<TraceContextValue>();

export function getTraceContext(): TraceContextValue | undefined {
  return traceStore.getStore();
}

/** Run `fn` inside a trace context. Nested calls reuse the outer trace. */
export function withTraceContext<T>(
  init: { runId: string; name?: string; metadata?: Record<string, unknown>; traceId?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const existing = traceStore.getStore();
  if (existing) return fn(); // already inside a trace — inherit it
  const value: TraceContextValue = {
    traceId: init.traceId ?? `trace_${randomUUID()}`,
    runId: init.runId,
    name: init.name ?? 'pipeline',
    metadata: init.metadata ?? {},
    openSteps: [],
  };
  return traceStore.run(value, fn);
}

/** Current innermost open step observation id — parent for child spans. */
export function currentStepObservationId(): string | undefined {
  const ctx = traceStore.getStore();
  return ctx?.openSteps[ctx.openSteps.length - 1];
}

/**
 * Mark a pipeline step as open/closed inside the trace. Returns a closer
 * that MUST be called (try/finally) — it pops only its own id so nested or
 * out-of-order closes cannot corrupt the stack.
 */
export function openTraceStep(stepName: string): () => void {
  const ctx = traceStore.getStore();
  if (!ctx) return () => {};
  const id = `step_${randomUUID()}`;
  ctx.openSteps.push(id);
  return () => {
    const i = ctx.openSteps.lastIndexOf(id);
    if (i >= 0) ctx.openSteps.splice(i, 1);
  };
}
