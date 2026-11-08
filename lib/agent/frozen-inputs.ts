/**
 * Frozen-inputs store — the non-LLM companion to the cassette.
 *
 * The LLM cassette (`lib/llm/cassette.ts`) freezes request/response pairs,
 * but several pipeline inputs bypass the LLM boundary entirely and mutate
 * between record and replay: agent-memory lesson reads (every run WRITES
 * new lessons, so the next replay sees a different set), researcher
 * profiles/positions (a record run persists the position it just took),
 * playbooks, live web inputs (positioning competitor corpus, prediction
 * markets). Each of those feeds an LLM prompt — a drift there is a
 * cassette miss downstream.
 *
 * This module is a per-process channel-keyed snapshot:
 *   - record mode: `captureInput(ch, producer)` runs the producer and
 *     stores its result; the pipeline persists `snapshotFrozenInputs()`
 *     inside `stats.frozenContext.inputs`.
 *   - replay mode: `seedFrozenInputs(frozenContext.inputs)` pre-fills the
 *     store; every `captureInput` hits and returns the recorded value —
 *     the producer (DB read, HTTP fetch) never runs.
 *
 * In normal `live` mode the store is empty and every capture falls through
 * to the producer — zero behaviour change.
 */
const store = new Map<string, unknown>();
let seeded = false;

/** Replay entry point — populate the store from the recorded snapshot. */
export function seedFrozenInputs(inputs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(inputs ?? {})) store.set(k, v);
  seeded = true;
}

/** Record exit point — everything captured this run, for persistence. */
export function snapshotFrozenInputs(): Record<string, unknown> {
  return Object.fromEntries(store);
}

/** True when a snapshot was seeded (replay) — diagnostic only. */
export function hasFrozenInputs(): boolean {
  return seeded;
}

/**
 * Persist-time merge: fold every captured input into
 * `stats.frozenContext.inputs`. Called before each terminal
 * pipelineRun.steps write so late-run channels survive whatever path the
 * run exits on. No-op unless a record-mode snapshot exists.
 */
export function mergeInputsIntoStats(stats: Record<string, any>): void {
  if (!stats?.frozenContext) return;
  try {
    (stats.frozenContext as Record<string, unknown>).inputs = snapshotFrozenInputs();
  } catch { /* non-blocking */ }
}

/**
 * Return the recorded value for `channel` when it exists in the store;
 * otherwise run `producer`, store its result, and return it. A channel
 * absent on replay (stale snapshot) falls through to the producer — the
 * resulting prompt drift surfaces as a CassetteMissError, which is the
 * intended fail-loud signal.
 */
export async function captureInput<T>(channel: string, producer: () => Promise<T> | T): Promise<T> {
  if (store.has(channel)) return store.get(channel) as T;
  const value = await producer();
  // Only retain captures while a record/replay session is active — in live
  // mode the store must stay empty so repeat calls re-read real state.
  if (process.env.NOMOSX_LLM_MODE === 'record' || seeded) store.set(channel, value);
  return value;
}

const syncCounters = new Map<string, number>();

/**
 * Synchronous FIFO variant for hot decision points (e.g. wall-clock
 * headroom guards). Occurrence N of a channel replays record-occurrence N;
 * a divergent call order misses the key and falls through to the live
 * producer — downstream drift still surfaces as a CassetteMissError.
 */
export function captureInputSync<T>(channel: string, producer: () => T): T {
  const n = syncCounters.get(channel) ?? 0;
  syncCounters.set(channel, n + 1);
  const key = `${channel}#${n}`;
  if (store.has(key)) return store.get(key) as T;
  const value = producer();
  if (process.env.NOMOSX_LLM_MODE === 'record' || seeded) store.set(key, value);
  return value;
}

const asyncCounters = new Map<string, number>();

/**
 * Async FIFO variant — occurrence N of `channel` replays record-occurrence
 * N, for producers that must stay async (e.g. LLM calls whose prompts embed
 * volatile telemetry). Same fallthrough semantics as captureInputSync: a
 * divergent call count/order misses the key and runs the live producer,
 * surfacing downstream drift as a CassetteMissError.
 */
export async function captureInputFifo<T>(channel: string, producer: () => Promise<T> | T): Promise<T> {
  const n = asyncCounters.get(channel) ?? 0;
  asyncCounters.set(channel, n + 1);
  const key = `${channel}#${n}`;
  if (store.has(key)) return store.get(key) as T;
  const value = await producer();
  if (process.env.NOMOSX_LLM_MODE === 'record' || seeded) store.set(key, value);
  return value;
}
