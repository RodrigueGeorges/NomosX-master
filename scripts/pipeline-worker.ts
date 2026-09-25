/**
 * NomosX durable pipeline worker.
 *
 * Long-running process that executes queued Jobs (think-tank cycles, StudioX
 * pipelines) against Postgres. Deploy on any always-on host with DATABASE_URL
 * and the LLM/provider env vars — it does NOT need to run on Netlify.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/pipeline-worker.ts            # loop
 *   npx tsx --env-file=.env.local scripts/pipeline-worker.ts --once     # one pass
 *   npx tsx --env-file=.env.local scripts/pipeline-worker.ts --max-jobs=2
 *
 * Flags:
 *   --once            exit after the first empty poll
 *   --poll-ms=N       idle poll interval (default 10000)
 *   --max-jobs=N      exit after N jobs
 *   --worker-id=ID    override worker identity
 */

import { runWorkerLoop } from '../lib/worker/durable-worker';
import { registerAllJobHandlers } from '../lib/worker/job-handlers';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

async function main() {
  registerAllJobHandlers();

  const once = process.argv.includes('--once');
  const pollMs = Number(arg('poll-ms') ?? 10_000);
  const maxJobs = Number(arg('max-jobs') ?? 0);
  const workerId = arg('worker-id');

  const processed = await runWorkerLoop({ workerId, pollMs, maxJobs, once });
  process.exit(processed >= 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[pipeline-worker] fatal:', err);
  process.exit(1);
});
