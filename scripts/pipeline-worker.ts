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
 *   --health-port=N   serve /health + /metrics on 0.0.0.0:N (Railway/Fly/VPS
 *                     healthchecks; also honors the PORT env var when set)
 */

import { runWorkerLoop, getActiveJob } from '../lib/worker/durable-worker';
import { registerAllJobHandlers } from '../lib/worker/job-handlers';
import { prisma } from '../lib/db';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

// Graceful shutdown: on deploy/restart SIGTERM, release the active job's lock
// so the replacement worker reclaims it in seconds instead of waiting out the
// 15min TTL — and log memory so restarts have a post-mortem (a cgroup OOM
// SIGKILL logs nothing; a SIGTERM we can catch).
function installShutdownHandlers(): void {
  const onSignal = (sig: string) => {
    const mem = process.memoryUsage();
    const job = getActiveJob();
    console.log(
      `[pipeline-worker] ${sig} — rss=${Math.round(mem.rss / 1e6)}MB heap=${Math.round(mem.heapUsed / 1e6)}/${Math.round(mem.heapTotal / 1e6)}MB activeJob=${job?.id ?? 'none'}`
    );
    void (async () => {
      try {
        if (job) {
          await prisma.job.updateMany({
            where: { id: job.id, status: 'RUNNING', lockedBy: job.workerId },
            data: { lockedUntil: new Date() },
          });
        }
      } catch {
        // shutting down anyway
      } finally {
        process.exit(0);
      }
    })();
    // Hard cap: never let a stuck DB write hold the shutdown.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}

async function main() {
  installShutdownHandlers();
  registerAllJobHandlers();

  const once = process.argv.includes('--once');
  const pollMs = Number(arg('poll-ms') ?? 10_000);
  const maxJobs = Number(arg('max-jobs') ?? 0);
  const workerId = arg('worker-id');

  // Optional liveness endpoint — always-on platforms (Railway, Fly, Render,
  // a VM behind systemd) probe a port to know the loop is alive. The worker
  // is functional without it; this only affects platform health reporting.
  const healthPort = Number(arg('health-port') ?? process.env.PORT ?? 0);
  if (healthPort > 0) {
    const startedAt = Date.now();
    const { createServer } = await import('http');
    createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, workerId: workerId ?? null, uptimeSec: Math.round((Date.now() - startedAt) / 1000) }));
      } else {
        res.writeHead(404); res.end();
      }
    }).listen(healthPort, '0.0.0.0', () => {
      console.log(`[pipeline-worker] health endpoint on :${healthPort}`);
    });
  }

  const processed = await runWorkerLoop({ workerId, pollMs, maxJobs, once });
  process.exit(processed >= 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[pipeline-worker] fatal:', err);
  process.exit(1);
});
