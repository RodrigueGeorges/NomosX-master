/**
 * Temporal worker bootstrap — creates and runs the activity worker against
 * Temporal Cloud. Shared by the standalone entrypoint (scripts/temporal-worker.ts)
 * and the in-process start inside the legacy PG worker (opt-in via
 * TEMPORAL_ENABLED=1).
 *
 * Loaded via dynamic import only — @temporalio/worker pulls native deps and
 * must never reach the Next.js bundle.
 */
import { fileURLToPath } from 'node:url';
import type { Worker } from '@temporalio/worker';
import { getTemporalConfig } from './config';

export interface TemporalWorkerHandle {
  /** Resolves when the worker stops (only on shutdown/fatal). */
  done: Promise<void>;
  shutdown: () => Promise<void>;
}

export async function startTemporalWorker(opts: { manageSignals?: boolean } = {}): Promise<TemporalWorkerHandle> {
  const cfg = getTemporalConfig();
  if (!cfg.enabled) {
    console.log('[temporal-worker] not configured — skipping');
    return { done: Promise.resolve(), shutdown: async () => {} };
  }

  const { Worker: TemporalWorker, NativeConnection } = await import('@temporalio/worker');
  const activities = await import('./activities');

  const tls = cfg.apiKey
    ? true
    : cfg.tlsCert && cfg.tlsKey
      ? { clientCertPair: { crt: Buffer.from(cfg.tlsCert, 'base64'), key: Buffer.from(cfg.tlsKey, 'base64') } }
      : undefined;

  const connection = await NativeConnection.connect({
    address: cfg.address,
    tls,
    ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
  });

  const worker: Worker = await TemporalWorker.create({
    connection,
    namespace: cfg.namespace,
    taskQueue: cfg.taskQueue,
    workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
    activities,
    // Pipelines hold multi-MB corpora — match the PG worker's concurrency
    // budget (2 in-flight activities max).
    maxConcurrentActivityTaskExecutions: 2,
  });

  console.log(`[temporal-worker] polling ${cfg.taskQueue} on ${cfg.address} (ns=${cfg.namespace})`);

  if (opts.manageSignals !== false) {
    const shutdown = async (sig: string) => {
      console.log(`[temporal-worker] ${sig} — draining`);
      try { await worker.shutdown(); } finally { process.exit(0); }
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  }

  // worker.run() resolves on graceful shutdown, rejects on fatal poll errors.
  const done = worker.run().catch((err) => {
    console.error('[temporal-worker] fatal poll error:', err);
    throw err;
  });

  return { done, shutdown: async () => { await worker.shutdown(); } };
}
