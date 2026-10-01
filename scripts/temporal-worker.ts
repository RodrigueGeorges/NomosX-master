/**
 * Temporal worker entrypoint — runs pipeline activities against Temporal Cloud.
 *
 *   TEMPORAL_ENABLED=1 TEMPORAL_ADDRESS=<ns>.tmprl.cloud:7233 \
 *   TEMPORAL_NAMESPACE=<ns> TEMPORAL_API_KEY=<key> \
 *   npx tsx --env-file=.env.local scripts/temporal-worker.ts
 *
 * Runs alongside the legacy PG worker during migration — each claims its own
 * queue (Temporal task queue vs Job table), no double execution. The PG
 * pipeline-worker also starts this in-process when TEMPORAL_ENABLED=1, so a
 * single Railway service covers both during the transition.
 */
import { startTemporalWorker } from '../lib/temporal/worker';

async function main() {
  const handle = await startTemporalWorker();
  await handle.done;
}

main().catch((err) => {
  console.error('[temporal-worker] fatal:', err);
  process.exit(1);
});
