/**
 * Temporal activities — thin adapters over existing pipeline functions.
 * Runs in the Temporal worker process (full Node + prisma + pipeline graph).
 *
 * Heartbeats carry the ThinkTankCycleProgress checkpoint: on activity retry
 * (worker death mid-cycle), `heartbeatDetails` replays the last checkpoint
 * into `resume` — same resume semantics as the PG durable worker.
 */
import { Context } from '@temporalio/activity';
import { runThinkTankCycle, type ThinkTankCycleProgress } from '@/lib/agent/think-tank-dispatcher';
import type { ThinkTankCycleWorkflowInput, ThinkTankCycleWorkflowResult } from './types';

export async function runThinkTankCycleActivity(
  input: ThinkTankCycleWorkflowInput
): Promise<ThinkTankCycleWorkflowResult> {
  const ctx = Context.current();
  const resume = ctx.info.heartbeatDetails as ThinkTankCycleProgress | undefined;
  if (resume && Array.isArray(resume.items) && resume.items.length > 0) {
    ctx.log.info('Resuming cycle from heartbeat checkpoint', {
      items: resume.items.length,
      doneKeys: resume.doneKeys?.length ?? 0,
    });
  }

  const result = await runThinkTankCycle({
    mode: input.mode,
    maxPublications: input.maxPublications,
    budgetUsd: input.budgetUsd,
    dryRun: input.dryRun,
    resume,
    onProgress: (state) => {
      // Checkpoint → heartbeat: a retried attempt gets this back via
      // heartbeatDetails. Bounded size (items + doneKeys + counters).
      ctx.heartbeat(state);
    },
  });

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
}
