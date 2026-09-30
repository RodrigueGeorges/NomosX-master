/**
 * Job handlers for the durable worker.
 * Registered lazily — importing this module pulls in the pipeline graph,
 * so only the worker entrypoint (or sync fallbacks) should import it.
 */

import { registerJobHandler, saveJobProgress } from './durable-worker';
import { runThinkTankCycle, type ThinkTankCycleProgress } from '@/lib/agent/think-tank-dispatcher';
import { THINK_TANK_JOB_TYPE, thinkTankCyclePayloadSchema, isThinkTankEnabled } from './think-tank-queue';
import { STUDIOX_JOB_TYPE } from '@/lib/studiox/enqueue';

let registered = false;

export function registerAllJobHandlers(): void {
  if (registered) return;
  registered = true;

  registerJobHandler(THINK_TANK_JOB_TYPE, async (payload, job) => {
    if (!isThinkTankEnabled()) throw new Error('Autonomous execution is disabled');
    const p = thinkTankCyclePayloadSchema.parse(payload);
    // Reclaimed job → resume mid-cycle: the stored dispatch list is reused
    // (no radar re-run) and finished items are skipped.
    const progress = (job.result ?? undefined) as ThinkTankCycleProgress | undefined;
    const resume = progress && Array.isArray(progress.items) && progress.items.length > 0
      ? progress
      : undefined;
    const result = await runThinkTankCycle({
      mode: p.mode ?? 'weekly',
      maxPublications: p.maxPublications,
      budgetUsd: p.budgetUsd,
      resume,
      onProgress: (state) => {
        if (!job.workerId) throw new Error('Job progress requires an execution lease');
        return saveJobProgress(job.id, state, job.workerId);
      }
    });
    // Keep the stored result compact — full detail lives in PipelineRun rows.
    return {
      mode: result.mode,
      success: result.success,
      collected: result.collected,
      published: result.published,
      held: result.held,
      skipped: result.skipped,
      failed: result.failed,
      totalCostUsd: result.totalCostUsd,
      durationMs: result.durationMs,
      topics: result.topics,
      errors: result.errors,
    };
  });

  registerJobHandler(STUDIOX_JOB_TYPE, async (payload) => {
    const { orderId } = (payload ?? {}) as { orderId?: string };
    if (!orderId) throw new Error('STUDIOX_PIPELINE job missing orderId');
    const { processStudioXOrder } = await import('@/lib/studiox/runner');
    await processStudioXOrder(orderId);
    return { orderId };
  });
}
