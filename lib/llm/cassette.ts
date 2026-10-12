/**
 * LLM cassette — deterministic record/replay at the SDK boundary.
 * (VCR pattern adapted to agent loops: cassette / pytest-agentreplay /
 * agentverify all converge on intercepting the model call, not HTTP.)
 *
 *   NOMOSX_LLM_MODE=live    (default) — unchanged production behaviour
 *   NOMOSX_LLM_MODE=record  — pass through to providers, append each
 *                             request/response pair (and provider errors) to
 *                             the cassette file as JSONL
 *   NOMOSX_LLM_MODE=replay  — serve responses from the cassette keyed by the
 *                             same request hash the Redis cache uses. A miss
 *                             throws CassetteMissError: never a silent live
 *                             fallback, never a paid call.
 *
 *   NOMOSX_LLM_CASSETTE=<path> — cassette file (default .llm-cassettes/run.jsonl)
 *
 * Replay preserves the recorded `costUsd`, so the pipeline's own cost
 * accounting debits exactly what the live run spent — a dry-run costs the
 * same on paper, nothing on the provider bill.
 *
 * Scope: covers callLLM / callLLMWithCascade (both funnel through
 * callLLMCore). streamLLM and direct provider SDK calls are NOT recorded.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';

export type LlmCassetteMode = 'live' | 'record' | 'replay';

export class CassetteMissError extends Error {
  readonly key: string;
  readonly task: string;
  constructor(key: string, task: string) {
    super(`[cassette] replay miss for task "${task}" (key=${key}) — prompt or params drifted from the recording`);
    this.name = 'CassetteMissError';
    this.key = key;
    this.task = task;
  }
}

export interface CassetteEntry {
  key: string;
  task: string;
  /** Recording-run discriminator — NOMOSX_CASSETTE_RUN at record time.
   * Entries from different runs share prompt keys (the framing prompt is
   * identical across runs; only the RESPONSE differs). Without a run filter
   * a replay would FIFO-consume run A's responses into run B's context —
   * the exact bug that made a frozen-inputs replay miss at the judge. */
  run?: string;
  provider?: string;
  model?: string;
  request?: unknown;
  response?: unknown;
  error?: string;
  recordedAt: string;
}

let replayQueues: { path: string; queues: Map<string, CassetteEntry[]> } | null = null;

export function getLlmCassetteMode(): LlmCassetteMode {
  const m = (process.env.NOMOSX_LLM_MODE ?? 'live').toLowerCase();
  return m === 'record' || m === 'replay' ? m : 'live';
}

export function cassetteFilePath(): string {
  return process.env.NOMOSX_LLM_CASSETTE ?? resolve(process.cwd(), '.llm-cassettes', 'run.jsonl');
}

export function recordLlmCassette(
  request: { task?: string; messages?: unknown },
  key: string,
  response?: unknown,
  error?: unknown,
): void {
  const path = cassetteFilePath();
  mkdirSync(dirname(path), { recursive: true });
  const res = response as { provider?: string; model?: string } | undefined;
  const entry: CassetteEntry = {
    key,
    task: String(request.task ?? ''),
    run: process.env.NOMOSX_CASSETTE_RUN || undefined,
    provider: res?.provider,
    model: res?.model,
    request,
    response,
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
    recordedAt: new Date().toISOString(),
  };
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
}

function loadReplayQueues(): Map<string, CassetteEntry[]> {
  const path = cassetteFilePath();
  const wantRun = process.env.NOMOSX_CASSETTE_RUN || '';
  const cacheKey = `${path}${wantRun ? `#${wantRun}` : ''}`;
  if (replayQueues?.path === cacheKey) return replayQueues.queues;
  const queues = new Map<string, CassetteEntry[]>();
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as CassetteEntry;
        // Run filter: when NOMOSX_CASSETTE_RUN is set, only entries recorded
        // under that token serve. Unset → backward-compatible "serve all".
        if (wantRun && entry.run !== wantRun) continue;
        const q = queues.get(entry.key) ?? [];
        q.push(entry);
        queues.set(entry.key, q);
      } catch { /* corrupt line — skip, replay of its key will miss loudly */ }
    }
  }
  replayQueues = { path: cacheKey, queues };
  return queues;
}

/**
 * Serve a recorded response. Entries are consumed FIFO per key so a cassette
 * containing two calls with the same prompt (e.g. a retry) replays them in
 * order. A recorded provider error replays as a thrown Error.
 */
export function replayLlmCassette<T>(request: { task?: string }, key: string): T {
  const queue = loadReplayQueues().get(key);
  const entry = queue?.shift();
  if (!entry) {
    // Debug aid: dump the missed request next to the cassette so a drift can
    // be diffed against the recorded entry instead of guessed at.
    try {
      const path = cassetteFilePath();
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(`${path}.misses.jsonl`, JSON.stringify({ key, task: request.task ?? '', request, missedAt: new Date().toISOString() }) + '\n', 'utf8');
    } catch { /* diagnostic only */ }
    throw new CassetteMissError(key, String(request.task ?? ''));
  }
  if (entry.error) throw new Error(`[cassette] recorded provider error: ${entry.error}`);
  console.log(`[LLM] cassette replay [${entry.task}] ${entry.provider ?? '?'}/${entry.model ?? '?'}`);
  return entry.response as T;
}

/** Test/diagnostic helper — drop the loaded cassette so the next replay reloads. */
export function resetLlmCassette(): void {
  replayQueues = null;
}
