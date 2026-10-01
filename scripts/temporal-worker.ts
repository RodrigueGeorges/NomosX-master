/**
 * Temporal worker entrypoint — runs pipeline activities against Temporal Cloud.
 *
 *   TEMPORAL_ENABLED=1 TEMPORAL_ADDRESS=<ns>.tmprl.cloud:7233 \
 *   TEMPORAL_NAMESPACE=<ns> TEMPORAL_API_KEY=<key> \
 *   npx tsx --env-file=.env.local scripts/temporal-worker.ts
 *
 * Runs alongside the legacy PG worker during migration — each claims its own
 * queue (Temporal task queue vs Job table), no double execution.
 */
import { fileURLToPath } from 'node:url';
import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from '../lib/temporal/activities';
import { getTemporalConfig } from '../lib/temporal/config';

async function main() {
  const cfg = getTemporalConfig();
  if (!cfg.enabled) {
    console.error('[temporal-worker] TEMPORAL_ENABLED/ADDRESS/NAMESPACE/auth not configured — exiting');
    process.exit(1);
  }

  const tls = cfg.apiKey
    ? { apiKey: cfg.apiKey }
    : cfg.tlsCert && cfg.tlsKey
      ? { clientCertPair: { crt: Buffer.from(cfg.tlsCert, 'base64'), key: Buffer.from(cfg.tlsKey, 'base64') } }
      : undefined;

  const connection = await NativeConnection.connect({ address: cfg.address, tls });

  const worker = await Worker.create({
    connection,
    namespace: cfg.namespace,
    taskQueue: cfg.taskQueue,
    workflowsPath: fileURLToPath(new URL('../lib/temporal/workflows.ts', import.meta.url)),
    activities,
    // Pipelines hold multi-MB corpora — match the PG worker's concurrency
    // budget (2 in-flight activities max).
    maxConcurrentActivityTaskExecutions: 2,
  });

  console.log(`[temporal-worker] polling ${cfg.taskQueue} on ${cfg.address} (ns=${cfg.namespace})`);

  const shutdown = async (sig: string) => {
    console.log(`[temporal-worker] ${sig} — draining`);
    try { await worker.shutdown(); } finally { process.exit(0); }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await worker.run();
}

main().catch((err) => {
  console.error('[temporal-worker] fatal:', err);
  process.exit(1);
});
