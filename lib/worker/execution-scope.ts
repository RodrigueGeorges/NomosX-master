import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import axios, { type AxiosStatic } from 'axios';

const executionSignal = new AsyncLocalStorage<AbortSignal>();

// Parent chain for nested scopes — a child scope (withExecutionDeadline /
// withExecutionScope) derives a new signal via AbortSignal.any(); recording
// the parent lets budget consumption charge the JOB-root ledger as a global
// safety bound while the child ledger enforces per-scope fairness.
const scopeParents = new WeakMap<AbortSignal, AbortSignal>();

function recordParent(child: AbortSignal, parent: AbortSignal | undefined): void {
  if (parent && parent !== child) scopeParents.set(child, parent);
}

function rootSignalOf(signal: AbortSignal | undefined): AbortSignal | undefined {
  let s = signal;
  for (let depth = 0; s && depth < 20; depth++) {
    const p = scopeParents.get(s);
    if (!p) return s;
    s = p;
  }
  return s;
}

export function getExecutionSignal(): AbortSignal | undefined {
  const signal = executionSignal.getStore();
  for (let current = signal, depth = 0; current && depth < 20; current = scopeParents.get(current), depth++) {
    const deadline = scopeDeadlines.get(current);
    if (!current.aborted && deadline !== undefined && Date.now() >= deadline) {
      const owner = deadlineOwners.get(current);
      owner?.controller.abort(owner.error);
    }
  }
  return signal;
}

// Absolute deadline (epoch ms) per deadline-scope signal. withExecutionScope
// derives child signals without deadlines — consumers walk the parent chain.
const scopeDeadlines = new WeakMap<AbortSignal, number>();
const deadlineOwners = new WeakMap<AbortSignal, { controller: AbortController; error: Error }>();
const executionCosts = new WeakMap<AbortSignal, number>();

export function recordExecutionCost(amountUsd: number): void {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return;
  for (let signal = executionSignal.getStore(), depth = 0; signal && depth < 20; signal = scopeParents.get(signal), depth++) {
    executionCosts.set(signal, (executionCosts.get(signal) ?? 0) + amountUsd);
  }
}

/**
 * Effective wall-clock deadline for the current execution: the MINIMUM of
 * every deadline in the scope ancestry — an abort on any ancestor kills the
 * work, so the tightest bound is the real one. This is what headroom guards
 * must compare against: a regen child pipeline creates its own format-sized
 * inner deadline (65min) while the enclosing regen scope is tighter (35min)
 * — reading only the inner scope would authorise work that can never finish
 * (S35: an outline rewrite approved on the inner clock burned the regen's
 * last minutes and a trust-76 PROCEED artifact died before persist).
 */
export function getExecutionDeadlineAt(): number | undefined {
  let s = getExecutionSignal();
  let min: number | undefined;
  for (let depth = 0; s && depth < 20; depth++) {
    const d = scopeDeadlines.get(s);
    if (d !== undefined && (min === undefined || d < min)) min = d;
    s = scopeParents.get(s);
  }
  return min;
}

export function assertExecutionActive(): void {
  getExecutionSignal()?.throwIfAborted();
}

/**
 * Runs fn with NO execution signal — detaches a unit of work from the
 * abortable scope. Reserved for critical durability writes (artifact commit):
 * the dispatch deadline exists to stop PAID work (LLM/HTTP), not to roll back
 * an already-evaluated artifact mid-transaction — that was the S32 bug class
 * (held artifact lost → counted failed). Do not use for research work.
 */
export function withExecutionDetached<T>(fn: () => Promise<T>): Promise<T> {
  return executionSignal.run(undefined as unknown as AbortSignal, fn);
}

export function withExecutionSignal<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  const parent = getExecutionSignal();
  const effective = parent && parent !== signal ? AbortSignal.any([parent, signal]) : signal;
  recordParent(effective, parent);
  effective.throwIfAborted();
  return executionSignal.run(effective, fn);
}

/**
 * Child execution scope without a deadline — used to give a unit of work
 * (e.g. one deep-planner scout node) its own fresh budget ledger so it can
 * neither starve nor be starved by sibling nodes. Consumption still charges
 * the job-root ledger via consumeRootBudget, so the global runaway bound is
 * preserved. Aborts when the parent aborts or when the scope closes.
 */
export async function withExecutionScope<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const parent = getExecutionSignal();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  recordParent(signal, parent);
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await executionSignal.run(signal, () => Promise.race([fn(), cancelled]));
  } finally {
    signal.removeEventListener('abort', onAbort);
    controller.abort(new Error(`${label} scope closed`));
  }
}

export async function withExecutionDeadline<T>(ms: number, label: string, fn: () => Promise<T>): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('Invalid execution deadline');
  const controller = new AbortController();
  const parent = getExecutionSignal();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  recordParent(signal, parent);
  scopeDeadlines.set(signal, Date.now() + ms);
  const timeoutError = new Error(`${label} timed out after ${ms}ms`);
  deadlineOwners.set(signal, { controller, error: timeoutError });
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(timeoutError), ms);
  try {
    return await executionSignal.run(signal, async () => {
      const result = await Promise.race([fn(), cancelled]);
      assertExecutionActive();
      return result;
    });
  } catch (err) {
    const costUsd = executionCosts.get(signal) ?? 0;
    if (costUsd > 0 && err instanceof Error) {
      const reported = (err as Error & { costUsd?: number }).costUsd;
      throw Object.assign(new Error(err.message, { cause: err }), err, {
        costUsd: Math.max(costUsd, Number.isFinite(reported) ? reported! : 0),
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    controller.abort(new Error(`${label} scope closed`));
  }
}

// ── Per-execution consumption budgets ──────────────────────────────────────
// Ledgers are keyed on the execution AbortSignal: every job attempt gets a
// fresh ledger, and the ledger dies with the scope. On reclaim a new attempt
// gets the same cap — durable checkpoints (not the budget) are what prevent
// paid work from being replayed. Unscoped callers share a process-global
// ledger that resets hourly so a web route can never be starved forever.
const scopedLedgers = new WeakMap<AbortSignal, Map<string, number>>();
const globalLedger = new Map<string, number>();
let globalLedgerResetAt = Date.now() + 3_600_000;

function ledgerFor(signal: AbortSignal | undefined): Map<string, number> {
  if (signal) {
    let ledger = scopedLedgers.get(signal);
    if (!ledger) {
      ledger = new Map();
      scopedLedgers.set(signal, ledger);
    }
    return ledger;
  }
  if (Date.now() > globalLedgerResetAt) {
    globalLedger.clear();
    globalLedgerResetAt = Date.now() + 3_600_000;
  }
  return globalLedger;
}

function consumeIn(ledger: Map<string, number>, key: string, limit: number): boolean {
  const used = ledger.get(key) ?? 0;
  if (used >= limit) return false;
  ledger.set(key, used + 1);
  return true;
}

export function consumeExecutionBudget(key: string, limit: number): boolean {
  return consumeIn(ledgerFor(getExecutionSignal()), key, limit);
}

/**
 * Charges the ROOT scope's ledger — the job-level safety bound that applies
 * no matter how deeply nested the current scope is. Child scopes get fresh
 * local ledgers (fairness between sibling nodes); this counter is what keeps
 * a job from turning N fresh node budgets into N× the intended total. Keys
 * are namespaced by the caller (e.g. 'root:http:openalex') so a root-scope
 * caller isn't double-charged against its own scope counter.
 */
export function consumeRootBudget(key: string, limit: number): boolean {
  return consumeIn(ledgerFor(rootSignalOf(getExecutionSignal())), key, limit);
}

/** Peek at a scope's consumption — telemetry only, never mutates. */
export function getExecutionBudgetUsage(key: string): number {
  const signal = getExecutionSignal();
  const ledger = signal ? scopedLedgers.get(signal) : globalLedger;
  return ledger?.get(key) ?? 0;
}

// ── Axios execution guard ─────────────────────────────────────────────────
// ~50 institutional providers + the PDF reader call axios directly, bypassing
// http-client — they kept issuing real HTTP requests long after their scope
// was aborted (observed live: a dead 'regen' scope's scout + index kept
// hitting providers and writing to the DB for hours). All axios calls in this
// codebase use the DEFAULT instance, so a single request interceptor here
// (this module is loaded by every pipeline path via http-client/unified-llm)
// aborts the request before it leaves the process and cancels in-flight ones.
const guardedAxios = new WeakSet<object>();
function bindAxiosExecution(instance: AxiosStatic): void {
  if (!instance?.interceptors?.request || guardedAxios.has(instance)) return;
  guardedAxios.add(instance);
  instance.interceptors.request.use(config => {
    const signal = getExecutionSignal();
    signal?.throwIfAborted();
    if (signal) config.signal = config.signal
      ? AbortSignal.any([signal, config.signal as AbortSignal])
      : signal;
    return config;
  });
}
bindAxiosExecution(axios);

try {
  // createRequire works under tsx/ESM and Next bundles alike — a bare
  // `require` is undefined in true ESM and the guard would silently no-op.
  const nodeRequire = createRequire(import.meta.url);
  const axiosModule = nodeRequire('axios');
  const axiosInstance = axiosModule?.default ?? axiosModule;
  bindAxiosExecution(axiosInstance);
} catch { /* axios absent in this bundle — scoped callers all use http-client */ }

// ── Global fetch guard ──────────────────────────────────────────────────────
// ~23 providers/agent modules use bare fetch (undici) — same zombie class as
// axios: requests kept running after their scope died. Wrap globalThis.fetch
// once: calls INSIDE an execution scope get the scope's signal merged into
// init.signal (pre-aborted scopes reject before any socket opens); calls with
// no active scope (Next routes, scripts) pass through untouched.
{
  const nativeFetch = globalThis.fetch;
  if (typeof nativeFetch === 'function' && !(nativeFetch as { __executionScoped?: boolean }).__executionScoped) {
    const scopedFetch: typeof fetch = (input: any, init?: any) => {
      const signal = getExecutionSignal();
      if (!signal) return nativeFetch(input, init);
      signal.throwIfAborted();
      const caller: AbortSignal | undefined = init?.signal
        ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
      const merged = caller ? AbortSignal.any([signal, caller]) : signal;
      if (typeof Request !== 'undefined' && input instanceof Request) {
        // Rebuild preserving `duplex` — undici does NOT inherit it from the
        // input Request and streamed SDK bodies die with a bare "fetch
        // failed" (observed: OpenAI SDK → Groq/NVIDIA under the custom
        // global dispatcher).
        const init2 = { ...(init ?? {}), signal: merged } as RequestInit & { duplex?: 'half' };
        const inputDuplex = (input as Request & { duplex?: 'half' }).duplex;
        if (inputDuplex) init2.duplex = inputDuplex;
        return nativeFetch(new Request(input, init2));
      }
      return nativeFetch(input, { ...(init ?? {}), signal: merged });
    };
    (scopedFetch as { __executionScoped?: boolean }).__executionScoped = true;
    globalThis.fetch = scopedFetch;
  }
}
