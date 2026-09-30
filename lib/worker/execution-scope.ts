import { AsyncLocalStorage } from 'node:async_hooks';

const executionSignal = new AsyncLocalStorage<AbortSignal>();

export function getExecutionSignal(): AbortSignal | undefined {
  return executionSignal.getStore();
}

export function assertExecutionActive(): void {
  getExecutionSignal()?.throwIfAborted();
}

export function withExecutionSignal<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return executionSignal.run(signal, fn);
}

export async function withExecutionDeadline<T>(ms: number, label: string, fn: () => Promise<T>): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('Invalid execution deadline');
  const controller = new AbortController();
  const parent = getExecutionSignal();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
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

export function consumeExecutionBudget(key: string, limit: number): boolean {
  const signal = getExecutionSignal();
  let ledger: Map<string, number>;
  if (signal) {
    ledger = scopedLedgers.get(signal) ?? new Map();
    scopedLedgers.set(signal, ledger);
  } else {
    if (Date.now() > globalLedgerResetAt) {
      globalLedger.clear();
      globalLedgerResetAt = Date.now() + 3_600_000;
    }
    ledger = globalLedger;
  }
  const used = ledger.get(key) ?? 0;
  if (used >= limit) return false;
  ledger.set(key, used + 1);
  return true;
}

/** Peek at a scope's consumption — telemetry only, never mutates. */
export function getExecutionBudgetUsage(key: string): number {
  const signal = getExecutionSignal();
  const ledger = signal ? scopedLedgers.get(signal) : globalLedger;
  return ledger?.get(key) ?? 0;
}
