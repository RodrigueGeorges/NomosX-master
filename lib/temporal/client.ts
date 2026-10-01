/**
 * Temporal client — lazy singleton for workflow submission.
 * Imported dynamically only when TEMPORAL_ENABLED=1 so the Next.js bundle
 * and the legacy worker never load @temporalio/client's native deps.
 */
import { getTemporalConfig } from './config';
import type { ThinkTankCycleWorkflowInput, ThinkTankCycleWorkflowResult } from './types';

interface TemporalClientHandle {
  startCycle(input: ThinkTankCycleWorkflowInput, workflowId: string): Promise<{ workflowId: string; alreadyRunning: boolean }>;
}

let cached: Promise<TemporalClientHandle> | undefined;

async function buildClient(): Promise<TemporalClientHandle> {
  const cfg = getTemporalConfig();
  if (!cfg.enabled) throw new Error('Temporal is not configured (TEMPORAL_ENABLED/ADDRESS/NAMESPACE/auth)');

  const { Connection, Client, WorkflowIdReusePolicy, WorkflowIdConflictPolicy } = await import('@temporalio/client');
  const { NativeConnection } = await import('@temporalio/worker');

  const tls = cfg.apiKey
    ? { apiKey: cfg.apiKey }
    : cfg.tlsCert && cfg.tlsKey
      ? { clientCertPair: { crt: Buffer.from(cfg.tlsCert, 'base64'), key: Buffer.from(cfg.tlsKey, 'base64') } }
      : undefined;

  const connection = await Connection.connect({
    address: cfg.address,
    tls,
    ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
  });
  void NativeConnection; // worker-side connection type kept for future multi-listener use

  const client = new Client({ connection, namespace: cfg.namespace });

  return {
    async startCycle(input, workflowId) {
      try {
        await client.workflow.start('thinkTankCycleWorkflow', {
          taskQueue: cfg.taskQueue,
          workflowId,
          args: [input],
          // Idempotency is the workflowId itself: a second dispatch for the
          // same slot reuses the running execution instead of duplicating it.
          workflowIdReusePolicy: WorkflowIdReusePolicy.TERMINATE_IF_RUNNING,
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        });
        return { workflowId, alreadyRunning: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already.*(started|running|exists)/i.test(msg)) return { workflowId, alreadyRunning: true };
        throw err;
      }
    },
  };
}

export async function getTemporalClient(): Promise<TemporalClientHandle> {
  cached ??= buildClient().catch((err) => { cached = undefined; throw err; });
  return cached;
}

export type { ThinkTankCycleWorkflowInput, ThinkTankCycleWorkflowResult };
