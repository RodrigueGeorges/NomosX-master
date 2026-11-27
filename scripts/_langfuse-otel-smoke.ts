/**
 * Smoke test for the OTEL Langfuse ingestion path — emits one trace with a
 * step span, one generation, one event, one score, then flushes.
 * Run: npx tsx scripts/_langfuse-otel-smoke.ts
 * Verify afterwards via the Langfuse API (/api/public/v2/observations).
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { withTraceContext } from '../lib/agent/trace-context';
import {
  tracePipelineStart,
  tracePipelineEnd,
  traceStep,
  traceLLMGeneration,
  flushAllTraces,
} from '../lib/agent/langfuse';
import type { LLMRequest, LLMResponse } from '../lib/llm/unified-llm';

async function main() {
  await withTraceContext(
    { runId: 'otel-smoke-1', name: 'otel.smoke', metadata: { verticalSlug: 'test' } },
    async () => {
      tracePipelineStart('otel-smoke-1', 'smoke query', { smoke: true });
      traceStep('otel-smoke-1', 'ANALYST', 'started');
      await new Promise(r => setTimeout(r, 50));
      const req = {
        task: 'fact_check',
        model: 'glm-4.5-air',
        messages: [{ role: 'user' as const, content: 'ping' }],
      } as unknown as LLMRequest;
      const res = {
        content: 'pong',
        model: 'glm-4.5-air',
        provider: 'glm',
        family: 'glm',
        tokensInput: 11,
        tokensOutput: 7,
        costUsd: 0.00001,
      } as unknown as LLMResponse;
      traceLLMGeneration(req, res, 'fact_check', 120);
      traceStep('otel-smoke-1', 'ANALYST', 'completed');
      tracePipelineEnd('otel-smoke-1', 'done', 0.00001, 200, { status: 'COMPLETED', trustScore: 0.77, qualityScore: 0.66 });
    },
  );
  await flushAllTraces();
  // flushAllTraces is fire-and-forget internally; give the HTTP post a beat.
  await new Promise(r => setTimeout(r, 1500));
  console.log('smoke emitted — check Langfuse for trace name "otel.smoke"');
}

main().catch(e => { console.error(e); process.exit(1); });
