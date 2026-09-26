# Worker deployment — durable pipeline runner

## Why this exists

Think-tank cycles take 45–75 min. Netlify functions cap at ~15 min, so any
pipeline running *inside* a request dies before publishing. The fix is the
durable worker: Netlify cron routes only **enqueue** a `Job` row and return
202; an always-on worker claims and executes it.

```
Netlify cron ──POST──> /api/cron/generate-briefs ──> Job(PENDING) ──> 202
                                                          │
                        always-on worker (this image) ────┘
                        claim → heartbeat → runThinkTankCycle → COMPLETED
```

Already wired in this repo:
- `app/api/cron/generate-briefs/route.ts` → `enqueueThinkTankCycle({mode:'weekly'})`
- `app/api/cron/auto-scan/route.ts` → `enqueueThinkTankCycle({mode:'breaking'})`
- `lib/worker/durable-worker.ts` — atomic claim, heartbeat lock, retry/backoff, dead-letter
- `lib/worker/job-handlers.ts` — `THINK_TANK_CYCLE` + `STUDIOX_PIPELINE`
- `lib/agent/durable-execution.ts` — mid-pipeline checkpoints: a worker crash resumes the run at its last step, not from scratch

## Deploy

### Railway / Fly / Render / VPS — any always-on host

```bash
docker build -f Dockerfile.worker -t nomosx-worker .
docker run --env-file .env.production -p 3001:3001 nomosx-worker
```

Or on Railway: create a **second service** on the same repo — it picks up
`railway.toml` (dockerfilePath = `Dockerfile.worker`, healthcheck `/health`).

### Local / CI smoke test

```bash
npm run worker:pipeline:once          # drain one pass then exit
npm run worker:pipeline               # loop
npx tsx scripts/pipeline-worker.ts --health-port=3001 --poll-ms=5000
```

Enqueue a test cycle: `npx tsx scripts/enqueue-test-cycle.ts`

## Env vars

Same set as the web app (the worker runs the full pipeline):

| Var | Why |
|---|---|
| `DATABASE_URL` | Job queue + all persistence |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / … | LLM cascade |
| `GROQ_API_KEY` / `CEREBRAS_API_KEY` / `NVIDIA_API_KEY` / `OPENROUTER_API_KEY` / `MISTRAL_API_KEY` | freepool last-resort (S28b preflight) |
| `TAVILY_API_KEY` / `EXA_API_KEY` / search keys | scout retrieval |
| `REDIS_URL` | scout cache, rate limits (optional but recommended) |
| `NEXT_PUBLIC_APP_URL` | absolute links in publications |
| `PORT` | health endpoint port (default 3001) |

No `CRON_SECRET` needed — the worker never serves external traffic; the
health endpoint is unauthenticated and returns only liveness.

## Cutover checklist

1. Deploy the worker service; confirm `[pipeline-worker] health endpoint on :3001` and the healthcheck goes green.
2. Confirm the queue drains: enqueue a `breaking` test cycle, watch `Job` row go `PENDING → RUNNING → COMPLETED`.
3. Keep Netlify crons as-is — they already enqueue rather than execute.
4. Rollback = stop the worker service; crons still enqueue, nothing is lost.

## Semantics to know

- **Claim is atomic** — multiple replicas are safe but pointless for now;
  one cycle is the design unit. Scale vertically (RAM) not horizontally.
- **`lockedUntil` expiry = dead worker** — the next poll reclaims the job.
  Handlers are idempotent at run level (weekly dedup inside the dispatcher).
- **Mid-run checkpoints** — `durableKeyFor(query)` makes the pipeline resume
  at its last durable step after a crash; spilt payloads live in
  `os.tmpdir()/nomosx-durable/` (ephemeral — a host reboot loses them, the
  DB checkpoint keys remain and the step just re-runs).
- **Attempts → dead-letter** — after `maxRetries`, the job lands in
  `JobDeadLetter`; nothing is retried forever.
