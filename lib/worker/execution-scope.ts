import { AsyncLocalStorage } from 'node:async_hooks';

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
  return executionSignal.getStore();
}

// Absolute deadline (epoch ms) per deadline-scope signal. withExecutionScope
// derives child signals without deadlines — consumers walk the parent chain.
const scopeDeadlines = new WeakMap<AbortSignal, number>();

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
  recordParent(signal, getExecutionSignal());
  signal.throwIfAborted();
  return executionSignal.run(signal, fn);
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
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${ms}ms`)), ms);
  try {
    return await withExecutionSignal(signal, () => Promise.race([fn(), cancelled]));
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
