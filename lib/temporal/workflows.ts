/**
 * Think-tank cycle workflow.
 *
 * SANDBOX RULES: this file is bundled by @temporalio/worker and executed in
 * an isolated VM — only deterministic imports are allowed. Never import
 * prisma, the pipeline, env vars, or anything with side effects here.
 */
import { proxyActivities, workflowInfo, log } from '@temporalio/workflow';
import type * as activities from './activities';
import type { ThinkTankCycleWorkflowInput, ThinkTankCycleWorkflowResult } from './types';

// A full cycle can legitimately run for ~2h; the activity heartbeats every
// checkpoint write so a dead worker is detected in 3 min, not 2h. On retry,
// heartbeatDetails carry the last ThinkTankCycleProgress → the activity
// resumes mid-cycle instead of restarting the radar + fan-out.
const { runThinkTankCycleActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '3h',
  heartbeatTimeout: '3m',
  retry: {
    // Cycle retries are resume attempts, not blind re-runs — the durable
    // checkpoint is replayed from heartbeatDetails. Still bounded: a cycle
    // that cannot finish in 4 attempts dead-letters the workflow.
    maximumAttempts: 4,
    initialInterval: '30s',
    backoffCoefficient: 2,
    maximumInterval: '10m',
  },
});

export async function thinkTankCycleWorkflow(
  input: ThinkTankCycleWorkflowInput
): Promise<ThinkTankCycleWorkflowResult> {
  log.info('think-tank cycle starting', { workflowId: workflowInfo().workflowId, mode: input.mode });
  const result = await runThinkTankCycleActivity(input);
  log.info('think-tank cycle finished', {
    published: result.published,
    held: result.held,
    failed: result.failed,
    totalCostUsd: result.totalCostUsd,
  });
  return result;
}
