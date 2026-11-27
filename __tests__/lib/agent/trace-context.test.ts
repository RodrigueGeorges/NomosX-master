/**
 * Trace context + Langfuse sink contract tests.
 *
 * Invariants:
 * - withTraceContext propagates runId/traceId through async boundaries.
 * - Nested withTraceContext reuses the outer trace (no trace-per-step spam).
 * - openTraceStep maintains a LIFO stack that survives out-of-order closes.
 * - Langfuse recorders are strict no-ops when ENABLE_LANGFUSE is unset —
 *   the pipeline must behave identically with tracing off.
 */
import { withTraceContext, getTraceContext, openTraceStep, currentStepObservationId } from '@/lib/agent/trace-context';

describe('trace-context', () => {
  it('is empty outside a trace', () => {
    expect(getTraceContext()).toBeUndefined();
  });

  it('propagates context through async work', async () => {
    await withTraceContext({ runId: 'run-1', name: 'pipeline.brief' }, async () => {
      const ctx = getTraceContext();
      expect(ctx?.runId).toBe('run-1');
      expect(ctx?.traceId).toMatch(/^trace_/);
      await new Promise(r => setTimeout(r, 5));
      expect(getTraceContext()?.runId).toBe('run-1');
    });
    expect(getTraceContext()).toBeUndefined();
  });

  it('nested withTraceContext inherits the outer trace', async () => {
    await withTraceContext({ runId: 'outer', traceId: 'trace_fixed' }, async () => {
      await withTraceContext({ runId: 'inner' }, async () => {
        expect(getTraceContext()?.runId).toBe('outer');
        expect(getTraceContext()?.traceId).toBe('trace_fixed');
      });
    });
  });

  it('openTraceStep tracks innermost open step and pops correctly', async () => {
    await withTraceContext({ runId: 'run-2' }, async () => {
      expect(currentStepObservationId()).toBeUndefined();
      const closeA = openTraceStep('SCOUT');
      const closeB = openTraceStep('READER');
      expect(currentStepObservationId()).toContain('step_');
      // Out-of-order close: closing A while B is open must not corrupt stack.
      closeA();
      expect(getTraceContext()!.openSteps).toHaveLength(1);
      closeB();
      expect(getTraceContext()!.openSteps).toHaveLength(0);
    });
  });

  it('openTraceStep outside a trace is a safe no-op', () => {
    const close = openTraceStep('SCOUT');
    expect(() => close()).not.toThrow();
  });
});

describe('langfuse sink', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ENABLE_LANGFUSE;
  });
  afterAll(() => { process.env = OLD_ENV; });

  it('recorders are no-ops when disabled', async () => {
    const { tracePipelineStart, tracePipelineEnd, traceStep, traceLLMGeneration, flushAllTraces } = await import('@/lib/agent/langfuse');
    await withTraceContext({ runId: 'r', traceId: 't' }, async () => {
      expect(() => {
        tracePipelineStart('r', 'q');
        traceStep('r', 'SCOUT', 'started');
        traceStep('r', 'SCOUT', 'completed');
        tracePipelineEnd('r', 'out', 0.01, 1000, { status: 'COMPLETED', trustScore: 70 });
        traceLLMGeneration({ messages: [] } as any, { content: 'x' } as any, 'task', 10);
      }).not.toThrow();
      await expect(flushAllTraces()).resolves.toBeUndefined();
    });
  });

  it('enqueues correctly-formed OTLP spans when enabled', async () => {
    process.env.ENABLE_LANGFUSE = 'true';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_BASE_URL = 'http://localhost:9'; // unreachable — flush must swallow errors
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { tracePipelineStart, tracePipelineEnd, traceStep, traceLLMGeneration, flushAllTraces } = await import('@/lib/agent/langfuse');
    await withTraceContext({ runId: 'r2', traceId: 'trace_abc', name: 'pipeline.memo' }, async () => {
      tracePipelineStart('r2', 'test question');
      traceStep('r2', 'ANALYST', 'started', 'running');
      traceStep('r2', 'ANALYST', 'completed', 'done');
      tracePipelineEnd('r2', 'out', 0.01, 1000, { status: 'COMPLETED', trustScore: 70 });
      traceLLMGeneration(
        { messages: [{ role: 'user', content: 'hi' }], temperature: 0.2 } as any,
        { content: 'hello', model: 'glm-4.5', provider: 'glm', tokensInput: 10, tokensOutput: 5, costUsd: 0.001 } as any,
        'analyst_brief',
        250,
      );
      await flushAllTraces();
    });
    // The flush must POST an OTLP/HTTP JSON ExportTraceServiceRequest to the
    // Langfuse OTEL endpoint (v3 /api/public/ingestion is removed upstream).
    const calls = fetchSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0][0])).toContain('/api/public/otel/v1/traces');
    const headers = (calls[0][1] as any).headers as Record<string, string>;
    expect(headers['x-langfuse-ingestion-version']).toBe('4');
    const body = JSON.parse((calls[0][1] as any).body as string);
    const spans = body.resourceSpans?.[0]?.scopeSpans?.[0]?.spans ?? [];
    expect(spans.length).toBeGreaterThanOrEqual(3); // root + step + generation (+ end event)
    const types = spans.map((s: any) =>
      (s.attributes ?? []).find((a: any) => a.key === 'langfuse.observation.type')?.value?.stringValue,
    );
    expect(types).toContain('span');
    expect(types).toContain('generation');
    expect(types).toContain('event');
    for (const s of spans) {
      expect(s.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(s.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(s.name).toBeTruthy();
      expect(s.startTimeUnixNano).toBeTruthy();
      expect(s.endTimeUnixNano).toBeTruthy();
      // Every span in the trace shares the same OTEL traceId.
      expect(s.traceId).toBe(spans[0].traceId);
    }
    const gen = spans.find((s: any) => s.name === 'llm.analyst_brief');
    expect(gen).toBeTruthy();
    const genAttrs = Object.fromEntries(
      (gen.attributes ?? []).map((a: any) => [a.key, a.value]),
    );
    expect(genAttrs['langfuse.observation.model.name']?.stringValue).toBe('glm-4.5');
    expect(genAttrs['gen_ai.usage.input_tokens']?.intValue).toBe('10');
    expect(genAttrs['gen_ai.usage.output_tokens']?.intValue).toBe('5');
    fetchSpy.mockRestore();
  });
});
