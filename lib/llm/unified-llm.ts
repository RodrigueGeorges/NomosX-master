/**
 * Unified LLM Service — Phase 0 re-cabled (01/07/2026)
 *
 * Six providers (DeepSeek, GLM-5.3/z.ai, OpenAI, Anthropic, Kimi K3/Moonshot, Google):
 * - Task→model assignment table (single source of truth, see TASK_ASSIGNMENT)
 * - Cross-family fallback: Kimi K3 ↔ GPT-6-Astra flagship pair, DeepSeek/GLM/Google fallback
 * - Per-provider configurable timeouts (GLM needs ≥120s for 30-90s first-token latency)
 * - Opposite-family rule for fact_check / citation_verification (anti blind-spot)
 * - Circuit breaker per provider (2 tiers: 60s cooldown, 24h auto-suspend)
 * - Kimi K3: temperature=1 enforced, reasoning_effort low/high per task class
 * - Anthropic Opus 5 / Sonnet 5: temperature parameter omitted (API requirement)
 *
 * Flagship orchestration (2026-08): Kimi K3 = analytical brain (strategic_analyst,
 * analyst_brief, elenchus, harvard_council, stress_test, primary_data_synthesis,
 * auto_revision). GPT-6-Astra = pen & judge (editorial_arbiter, meta_analysis,
 * structural_editor, fact_check, citation_verification). DeepSeek Flash =
 * fast utility + bulk reading. GLM-5.3 = extraction/translation + fallback.
 * Pre-suspension configurable via LLM_PRE_SUSPENDED env (default: anthropic).
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { assertExecutionActive, getExecutionSignal, withExecutionDeadline } from '../worker/execution-scope';
import { isFreeRun } from '../free-run';
import { env } from '../env';
import { getCachedLLMResponse,cacheLLMResponse } from '../cache/redis-cache';
import Sentry from '@sentry/nextjs';
import { traceLLMCall } from '../agent/langfuse';
import { filterByCapability, type LLMCapability } from '../agent/radar-innovations';

// ============================================================================
// FAMILY & PROVIDER TYPES
// ============================================================================

/**
 * LLMFamily groups providers into two "camps" for cross-family fallback and the
 * opposite-family verification rule. Today family === provider 1:1, but this
 * indirection is intentional: it lets us later group e.g. multiple GLM-compatible
 * providers under one family without touching call sites.
 */
export type LLMFamily = "deepseek" | "glm" | "openai" | "anthropic" | "kimi" | "google" | "freepool";
export type LLMProvider = "deepseek" | "glm" | "openai" | "anthropic" | "kimi" | "google" | "freepool";

export type LLMTask =
  // Fast / cheap / frequent — DeepSeek-flash
  | "query_enhancement"
  | "topic_classification"
  | "casting"
  | "editor_in_chief"
  | "swarm_persona"
  // Extraction / verification — opposite-family rule applies at runtime
  | "fact_check"
  | "citation_verification"
  // Heavy context, cache-friendly — GLM-5.2
  | "reader_v3"
  | "strategic_analyst"
  | "harvard_council"
  | "elenchus"
  // Heavy output, cheap tokens — DeepSeek-v4-pro
  | "analyst_brief"
  | "meta_analysis"
  | "editorial_arbiter"
  | "auto_revision"
  // Conversational, routed by depth at call site
  | "studiox"
  // Adaptive enrichment — fast reasoning about evidence sufficiency
  | "enrichment_reasoner"
  // Preflight checks — semantic alignment + query reformulation
  | "preflight_semantic_check"
  | "query_reformulation"
  // Structural review — narrative arc validation (Pyramid Principle, SCR)
  | "structural_editor"
  // Primary data synthesis — expert interviews, surveys, datasets
  | "primary_data_synthesis"
  // Policy stress test — multi-archetype risk review
  | "stress_test"
  // Legacy task names — kept for backward compat during migration, mapped in LEGACY_TASK_ALIAS
  | "classification"
  | "extraction"
  | "citation"
  | "analysis"
  | "strategic_analysis"
  | "critique"
  | "rewrite"
  | "reflection"
  // V3.2: New tasks for 2026 innovations
  | "verbal_rerank"
  | "reflective_rag"
  | "cite_audit"
  // Sprint 17: Delphi foresight — multi-expert scenario calibration
  | "delphi_round1"
  | "delphi_round2"
  | "cross_impact"
  | "translation";

/** Maps deprecated task names (pre-Phase-0) onto the new task vocabulary. */
const LEGACY_TASK_ALIAS: Partial<Record<LLMTask, LLMTask>> = {
  classification: "topic_classification",
  extraction: "reader_v3",
  citation: "citation_verification",
  analysis: "analyst_brief",
  strategic_analysis: "strategic_analyst",
  critique: "elenchus",
  rewrite: "auto_revision",
};

function normalizeTask(task: LLMTask | undefined): LLMTask {
  if (!task) return "studiox";
  return LEGACY_TASK_ALIAS[task] ?? task;
}

const PROVIDER_FAMILY: Record<LLMProvider, LLMFamily> = {
  deepseek: "deepseek",
  glm: "glm",
  openai: "openai",
  anthropic: "anthropic",
  kimi: "kimi",
  google: "google",
  freepool: "freepool",
};

const FAMILY_PROVIDER: Record<LLMFamily, LLMProvider> = {
  deepseek: "deepseek",
  glm: "glm",
  openai: "openai",
  anthropic: "anthropic",
  kimi: "kimi",
  google: "google",
  freepool: "freepool",
};

/**
 * Cross-family fallback order. Primary pair is DeepSeek ↔ Kimi (the two workhorse
 * families); GLM/OpenAI/Anthropic are fallback so a single vendor outage never
 * stops publication.
 */
// "freepool" is appended LAST in every chain: the free-tier safety net only
// engages once every paid provider is suspended or exhausted.
const CROSS_FAMILY_FALLBACK: Record<LLMFamily, LLMFamily[]> = {
  deepseek: ["openai", "kimi", "glm", "freepool"],
  glm: ["openai", "kimi", "deepseek", "freepool"],
  openai: ["kimi", "deepseek", "glm", "freepool"],
  anthropic: ["openai", "kimi", "deepseek", "freepool"],
  kimi: ["openai", "deepseek", "glm", "freepool"],
  // google: removed — no GOOGLE_API_KEY configured; entry kept for type completeness
  google: ["kimi", "glm", "freepool"],
  freepool: ["kimi", "glm", "openai"],
};

/** Opposite family for the fact_check / citation_verification independence rule. */
// While only Kimi + GLM are funded, they audit each other — that preserves the
// cross-family independence invariant. Restore kimi↔openai pairing when the
// OpenAI account is topped up.
// Verifier preferred = google (Gemini 3.8 Flash — best groundedness/$). When
// Google has no key the rule falls through to TASK_ASSIGNMENT and the cross-
// family chain still lands on a different family than the producer — except
// kimi→glm, which must stay GLM-first so kimi-produced text never verifies
// itself when the chain's first live provider is kimi.
const OPPOSITE_FAMILY: Record<LLMFamily, LLMFamily> = {
  deepseek: "google",
  glm: "google",
  openai: "google",
  anthropic: "google",
  kimi: "glm",
  google: "kimi",
  freepool: "google",
};

// ============================================================================
// TASK → MODEL ASSIGNMENT — SINGLE SOURCE OF TRUTH
// ============================================================================

interface TaskAssignment {
  provider: LLMProvider;
  model: string;
  /** Per-task, per-provider timeout override. Falls back to PROVIDER_DEFAULT_TIMEOUT_MS. */
  timeoutMs: number;
}

/**
 * Configurable per-provider default timeout (ms). GLM-5.2 has 30-90s first-token
 * latency on large contexts — its floor is enforced in getCallTimeout() below.
 * These are NOT hardcoded inline at call sites; adjust here as real latency data
 * comes in from the golden-set validation (Étape 5).
 */
const PROVIDER_DEFAULT_TIMEOUT_MS: Record<LLMProvider, number> = {
  deepseek: 60_000,
  glm: 180_000,
  openai: 60_000,
  anthropic: 90_000,
  kimi: 300_000,
  google: 60_000,
  freepool: 90_000,
};

/** Hard floor per provider — never go below this even if a task requests less. */
const PROVIDER_MIN_TIMEOUT_MS: Record<LLMProvider, number> = {
  deepseek: 30_000,
  glm: 180_000,
  openai: 30_000,
  anthropic: 30_000,
  kimi: 120_000,
  google: 30_000,
  freepool: 30_000,
};

/** Resolved once at module load — KIMI_MODEL env override (default kimi-k3). */
const KIMI_MODEL = env.KIMI_MODEL || "kimi-k3";

/** Fast/cheap utility model — glm-4.5-air ($0.20/$1.10 per Mtok, ~15× cheaper
 *  than the kimi-k3 fallback it replaces while OpenAI is out of credits). */
const GLM_FAST = "glm-4.5-air";
const OPENAI_FAST = "gpt-6-luna";
/** Frontier mid-tier — score 81.3 vs Kimi K3's 78.5 at ~2/3 the price ($2/$10
 *  vs $3/$15). Assigned primary for the analytical roles; falls back to Kimi
 *  while the OpenAI account is unfunded. */
const OPENAI_REASONING = "gpt-6-sol";

const TASK_ASSIGNMENT: Record<LLMTask, TaskAssignment> = {
  // Fast / cheap / frequent — glm-4.5-air (OpenAI credits exhausted 2026-09,
  // DeepSeek 402. GLM is the live budget workhorse; fallback chain → kimi.)
  query_enhancement:      { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  topic_classification:   { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  casting:                { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  editor_in_chief:        { provider: "glm", model: GLM_FAST, timeoutMs: 60_000 },
  swarm_persona:          { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },

  // Extraction / verification — Gemini 3.8 Flash: best measured groundedness
  // (AA-Omniscience 21, vs 3 for Sonnet 5), 332 tok/s, $0.75/$3.75 — 13×
  // cheaper than gpt-6-astra for the exact job. Needs GOOGLE_API_KEY; without
  // it the opposite-family rule still routes kimi↔glm verification.
  fact_check:             { provider: "google", model: "gemini-3.8-flash", timeoutMs: 60_000 },
  citation_verification:  { provider: "google", model: "gemini-3.8-flash", timeoutMs: 60_000 },

  // Heavy INPUT + OUTPUT — Kimi K3 is the analytical brain (1M ctx, 128K output,
  // frontier reasoning). reader_v3 (bulk reading) runs on cheap GLM — the
  // fallback chain routes to Kimi when GLM can't handle it (ctx or timeout).
  reader_v3:              { provider: "glm", model: GLM_FAST, timeoutMs: 300_000 },
  strategic_analyst:      { provider: "openai", model: OPENAI_REASONING, timeoutMs: 600_000 },
  harvard_council:        { provider: "openai", model: OPENAI_REASONING, timeoutMs: 300_000 },
  elenchus:               { provider: "openai", model: OPENAI_REASONING, timeoutMs: 300_000 },

  // Heavy structured-JSON OUTPUT — Kimi K3 (its original role): 128K output
  // headroom for long structured briefs, reasoning_effort=high on reasoning tasks.
  analyst_brief:          { provider: "openai", model: OPENAI_REASONING, timeoutMs: 300_000 },
  auto_revision:          { provider: "openai", model: OPENAI_REASONING, timeoutMs: 300_000 },
  // Editorial arbiter upgraded to gpt-6-astra for frontier reasoning in scenario synthesis
  editorial_arbiter:      { provider: "openai", model: "gpt-6-astra", timeoutMs: 300_000 },

  // Precision / structure — gpt-6-sol: frontier-enough for these tasks at
  // 5× lower cost than astra (kept only for the editorial arbiter apex).
  meta_analysis:          { provider: "openai", model: OPENAI_REASONING, timeoutMs: 90_000 },
  structural_editor:      { provider: "openai", model: OPENAI_REASONING, timeoutMs: 60_000 },

  // Conversational / utility — GLM fast tier
  studiox:                { provider: "glm", model: GLM_FAST, timeoutMs: 60_000 },
  enrichment_reasoner:    { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  preflight_semantic_check: { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  query_reformulation:    { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },

  // Primary data synthesis — back on Kimi K3 (frontier reasoning for expert
  // interviews / survey synthesis)
  primary_data_synthesis: { provider: "openai", model: OPENAI_REASONING, timeoutMs: 300_000 },
  // Policy stress test — multi-archetype risk review on the frontier mid-tier
  stress_test: { provider: "openai", model: OPENAI_REASONING, timeoutMs: 300_000 },

  // Legacy aliases — never read directly (normalizeTask() redirects before lookup),
  // kept so LLMTask stays a superset and TS doesn't complain about missing keys.
  classification:         { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  extraction:             { provider: "glm", model: GLM_FAST, timeoutMs: 120_000 },
  citation:               { provider: "glm", model: GLM_FAST, timeoutMs: 60_000 },
  analysis:               { provider: "glm", model: GLM_FAST, timeoutMs: 120_000 },
  strategic_analysis:     { provider: "openai", model: OPENAI_REASONING, timeoutMs: 300_000 },
  critique:               { provider: "openai", model: OPENAI_REASONING, timeoutMs: 120_000 },
  rewrite:                { provider: "glm", model: GLM_FAST, timeoutMs: 120_000 },
  reflection:             { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  // V3.2: New tasks for 2026 innovations
  verbal_rerank:          { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  reflective_rag:         { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  cite_audit:             { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  // Sprint 17: Delphi foresight — fast reasoning for multi-expert elicitation
  delphi_round1:          { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  delphi_round2:          { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  cross_impact:           { provider: "glm", model: GLM_FAST, timeoutMs: 30_000 },
  translation:            { provider: "glm", model: GLM_FAST, timeoutMs: 120_000 },
};

/**
 * Tasks that benefit from extended reasoning (thinking / high reasoning_effort).
 * Single source of truth — previously duplicated in 4 call sites with drifting contents.
 */
const REASONING_TASKS: Set<LLMTask> = new Set([
  "elenchus", "reader_v3", "strategic_analyst", "analyst_brief", "auto_revision",
  "editorial_arbiter", "harvard_council", "critique", "extraction", "strategic_analysis",
]);

/** Fast tasks — used to pick fast vs. reasoning model on FALLBACK providers. */
const FAST_TASKS: Set<LLMTask> = new Set([
  "query_enhancement", "topic_classification", "casting", "editor_in_chief",
  "swarm_persona", "fact_check", "citation_verification", "classification", "citation",
  "enrichment_reasoner", "meta_analysis", "structural_editor",
]);

// ============================================================================
// MODEL CONFIGURATIONS (cost per 1K tokens)
// ============================================================================
const MODEL_CONFIG: Record<string, Record<string, {
  contextWindow: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  /** GLM/z.ai prefix-cache hit rate — much cheaper than regular input */
  costPer1kCachedInput?: number;
}>> = {
  deepseek: {
    "deepseek-v4-pro": { contextWindow: 1000000, costPer1kInput: 0.000435, costPer1kOutput: 0.00087 },
    "deepseek-v4-flash": { contextWindow: 1000000, costPer1kInput: 0.00014, costPer1kOutput: 0.00028 },
    "deepseek-flash": { contextWindow: 1000000, costPer1kInput: 0.00022, costPer1kOutput: 0.00066 },
    "deepseek-chat": { contextWindow: 128000, costPer1kInput: 0.00028, costPer1kOutput: 0.00042 },
    "deepseek-reasoner": { contextWindow: 128000, costPer1kInput: 0.00028, costPer1kOutput: 0.00042 },
  },
  glm: {
    // z.ai GLM-4.5/4.6 family — verified against the account 2026-09
    // (glm-5.x model codes returned 400 "Unknown Model").
    "glm-4.6": {
      contextWindow: 200000,
      costPer1kInput: 0.0006,
      costPer1kOutput: 0.0022,
    },
    "glm-4.5": {
      contextWindow: 128000,
      costPer1kInput: 0.0006,
      costPer1kOutput: 0.0022,
    },
    "glm-4.5-air": {
      contextWindow: 128000,
      costPer1kInput: 0.0002,
      costPer1kOutput: 0.0011,
    },
    "glm-4.5-flash": {
      contextWindow: 128000,
      costPer1kInput: 0.0,
      costPer1kOutput: 0.0,
    },
  },
  openai: {
    "gpt-4o": { contextWindow: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015 },
    "gpt-4o-mini": { contextWindow: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },
    "gpt-4-turbo": { contextWindow: 128000, costPer1kInput: 0.01, costPer1kOutput: 0.03 },
    "gpt-5.6-luna": { contextWindow: 256000, costPer1kInput: 0.0003, costPer1kOutput: 0.0015 },
    "gpt-6-luna": { contextWindow: 1100000, costPer1kInput: 0.0001, costPer1kOutput: 0.0005 },
    "gpt-6-sol": { contextWindow: 872000, costPer1kInput: 0.002, costPer1kOutput: 0.01, costPer1kCachedInput: 0.0002 },
    "gpt-6-astra": { contextWindow: 1000000, costPer1kInput: 0.01, costPer1kOutput: 0.05 },
  },
  google: {
    "gemini-3.8-flash": { contextWindow: 1000000, costPer1kInput: 0.00075, costPer1kOutput: 0.00375 },
    "gemini-3.5-flash-lite": { contextWindow: 1000000, costPer1kInput: 0.0003, costPer1kOutput: 0.0025 },
  },
  anthropic: {
    "claude-sonnet-5": { contextWindow: 1000000, costPer1kInput: 0.002, costPer1kOutput: 0.010, costPer1kCachedInput: 0.0002 },
    "claude-opus-5.5": { contextWindow: 1000000, costPer1kInput: 0.004, costPer1kOutput: 0.02, costPer1kCachedInput: 0.0002 },
    "claude-opus-5": { contextWindow: 1000000, costPer1kInput: 0.005, costPer1kOutput: 0.025 },
  },
  kimi: {
    "kimi-k3": {
      contextWindow: 1048576,
      costPer1kInput: 0.003,
      costPer1kOutput: 0.015,
      costPer1kCachedInput: 0.0003,
    },
  },
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

function isRetryableError(error: any): boolean {
  if (!error) return false;
  // Terminal errors are never retryable
  if (isTerminalError(error)) return false;
  const status = error.status || error.statusCode || error?.response?.status;
  if (RETRY_CONFIG.retryableStatusCodes.includes(status)) return true;
  const msg = (error.message || "").toLowerCase();
  // 400 with "balance"/"quota"/"limit"/"suspended" → provider is unusable, trigger cross-family fallback
  if (status === 400 && (msg.includes("balance") || msg.includes("quota") || msg.includes("suspended") || msg.includes("credit") || msg.includes("billing") || msg.includes("plan"))) {
    return true; // Will trigger fallback rather than retry same provider
  }
  return msg.includes("rate limit") || msg.includes("timeout") || msg.includes("overloaded") || msg.includes("capacity");
}

function getRetryDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelayMs
  );
  // Add jitter (±25%)
  return delay * (0.75 + Math.random() * 0.5);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Terminal errors (suspended accounts, auth failures) won't resolve on retry
      if (isTerminalError(error)) {
        throw error;
      }
      if (attempt < RETRY_CONFIG.maxRetries && isRetryableError(error)) {
        const delay = getRetryDelay(attempt);
        console.warn(`⚠️ ${label} attempt ${attempt + 1} failed (${error.status || error.message}), retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Circuit breaker: Redis-backed with in-memory fallback for serverless resilience
// P0-C: Two-tier circuit breaker (VeriSwarm/Cortex pattern 2026)
//   Tier 1: 3 failures → 60s cooldown (transient issues)
//   Tier 2: 5 failures → 24h auto-suspend (dead provider: low balance, suspended account)
const CIRCUIT_BREAKER_THRESHOLD = 3;      // failures before opening circuit (tier 1)
const CIRCUIT_BREAKER_SUSPEND_THRESHOLD = 5; // failures before auto-suspend (tier 2)
const CIRCUIT_BREAKER_RESET_MS = 60000;   // 1 min cooldown (tier 1)
const CIRCUIT_BREAKER_SUSPEND_MS = 86400000; // 24h suspension (tier 2)
const CB_REDIS_TTL = 120;                 // Redis TTL in seconds (2x reset window)
const CB_SUSPEND_TTL = 86400;             // 24h TTL for suspended providers
// v2: namespace bump flushes stale suspensions persisted by the old logic
// (e.g. a daily-quota 429 banning freepool for 24h — Redis TTL survives
// redeploys). Pre-suspended providers re-seed below on boot.
const CB_KEY = (p: string) => `nomosx:cb:llm:v2:${p}`;

interface CBState { failures: number; lastFailure: number; open: boolean; suspended?: boolean; suspendedUntil?: number }
const cbMemory: Record<string, CBState> = {}; // in-process fallback

// P2: Pre-suspend providers with known account issues (balance/credit exhausted)
// This prevents wasted calls and timeouts before the circuit breaker would naturally trip.
// Configurable via LLM_PRE_SUSPENDED (comma-separated). Defaults to accounts
// with confirmed dead credit or no key configured (anthropic, deepseek 402,
// google — no GOOGLE_API_KEY). glm-4.5/4.6 is live on z.ai as of 2026-09.
const SUSPENDED_PROVIDERS = new Set<string>(
  (process.env.LLM_PRE_SUSPENDED ?? 'anthropic,deepseek,google')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
);
const SUSPENDED_UNTIL = Date.now() + CIRCUIT_BREAKER_SUSPEND_MS;
for (const p of SUSPENDED_PROVIDERS) {
  cbMemory[p] = { failures: CIRCUIT_BREAKER_SUSPEND_THRESHOLD, lastFailure: Date.now(), open: true, suspended: true, suspendedUntil: SUSPENDED_UNTIL };
}

async function getCBState(provider: string): Promise<CBState> {
  try {
    const { simpleRedisManager } = await import('../agent/redis-simple');
    if (simpleRedisManager.isRedisConnected()) {
      const remote = await simpleRedisManager.get<CBState>(CB_KEY(provider));
      if (remote) return remote;
    }
  } catch { /* Redis unavailable — use in-memory */ }
  return cbMemory[provider] ?? { failures: 0, lastFailure: 0, open: false };
}

async function setCBState(provider: string, state: CBState): Promise<void> {
  cbMemory[provider] = state;
  try {
    const { simpleRedisManager } = await import('../agent/redis-simple');
    if (simpleRedisManager.isRedisConnected()) {
      await simpleRedisManager.setWithTTL(CB_KEY(provider), state, CB_REDIS_TTL);
    }
  } catch { /* Redis unavailable — in-memory only */ }
}

function isCircuitOpenSync(provider: string): boolean {
  const cb = cbMemory[provider];
  if (!cb) return false;
  // Check suspension (tier 2: 24h)
  if (cb.suspended && cb.suspendedUntil && Date.now() < cb.suspendedUntil) {
    return true; // Still suspended
  }
  if (cb.suspended && cb.suspendedUntil && Date.now() >= cb.suspendedUntil) {
    // Suspension expired — reset
    cbMemory[provider] = { failures: 0, lastFailure: 0, open: false };
    return false;
  }
  // Check normal circuit (tier 1: 60s)
  if (!cb.open) return false;
  if (Date.now() - cb.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
    cbMemory[provider] = { failures: 0, lastFailure: 0, open: false };
    return false;
  }
  return true;
}

async function isCircuitOpen(provider: string): Promise<boolean> {
  const cb = await getCBState(provider);
  // Check suspension (tier 2: 24h)
  if (cb.suspended && cb.suspendedUntil && Date.now() < cb.suspendedUntil) {
    return true; // Still suspended
  }
  if (cb.suspended && cb.suspendedUntil && Date.now() >= cb.suspendedUntil) {
    // Suspension expired — reset
    await setCBState(provider, { failures: 0, lastFailure: 0, open: false });
    console.log(`🔌 Provider ${provider}: suspension expired — resuming`);
    return false;
  }
  // Check normal circuit (tier 1: 60s)
  if (!cb.open) return false;
  if (Date.now() - cb.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
    await setCBState(provider, { failures: 0, lastFailure: 0, open: false });
    return false;
  }
  return true;
}

/**
 * P2-L: Check if a provider is currently suspended (24h auto-suspend).
 * Can be used by SCOUT to dynamically filter dead providers.
 */
export async function isProviderSuspended(provider: string): Promise<boolean> {
  const cb = await getCBState(provider);
  if (cb.suspended && cb.suspendedUntil && Date.now() < cb.suspendedUntil) {
    return true;
  }
  return false;
}

/**
 * P2-L: Get all currently suspended providers.
 * Used by SCOUT to dynamically filter dead providers from the rotation.
 */
export async function getSuspendedProviders(): Promise<string[]> {
  const suspended: string[] = [];
  for (const [provider, cb] of Object.entries(cbMemory)) {
    if (cb.suspended && cb.suspendedUntil && Date.now() < cb.suspendedUntil) {
      suspended.push(provider);
    }
  }
  return suspended;
}

async function recordProviderFailure(provider: string, error?: Error): Promise<void> {
  // Failure-Class Routing (2026): only systemic errors advance the circuit breaker.
  // - Deterministic errors (JSON parse, empty content): per-call issue, don't trip breaker.
  // - Systemic account errors (suspended, balance, auth): provider-wide outage, DO trip breaker.
  // - Transient errors (429, 500, timeout): advance breaker as before.
  if (error && isDeterministicError(error)) {
    return;
  }
  const cb = await getCBState(provider);
  const next: CBState = { failures: cb.failures + 1, lastFailure: Date.now(), open: cb.open, suspended: cb.suspended, suspendedUntil: cb.suspendedUntil };

  // Daily-quota 429s (e.g. Groq "tokens per day" free tier) are NOT dead
  // providers — the quota resets within minutes/hours. Suspend only for the
  // retry window the error advertises instead of escalating to the 24h
  // tier-2 ban, which previously killed the only free LLM for a whole day.
  const quotaMs = dailyQuotaResetMs(error);
  if (quotaMs !== null) {
    next.suspended = true;
    next.suspendedUntil = Date.now() + quotaMs;
    next.open = true;
    console.warn(`🔌 Provider ${provider}: daily quota exhausted — suspending ${Math.round(quotaMs / 60000)}min (quota resets, not a dead account)`);
    try {
      const { simpleRedisManager } = await import('../agent/redis-simple');
      if (simpleRedisManager.isRedisConnected()) {
        await simpleRedisManager.setWithTTL(CB_KEY(provider), next, Math.ceil(quotaMs / 1000));
      }
    } catch { /* Redis unavailable */ }
    cbMemory[provider] = next;
    return;
  }

  // Systemic account errors (402 insufficient balance, suspended account, bad key)
  // suspend IMMEDIATELY — no point spending 4 more failures to learn the account is dead.
  if (error && isSystemicAccountError(error)) {
    next.suspended = true;
    next.suspendedUntil = Date.now() + CIRCUIT_BREAKER_SUSPEND_MS;
    next.open = true;
    console.warn(`🔌 Provider ${provider}: SUSPENDED for 24h (account error: ${error.message?.slice(0, 80)})`);
    try {
      const { simpleRedisManager } = await import('../agent/redis-simple');
      if (simpleRedisManager.isRedisConnected()) {
        await simpleRedisManager.setWithTTL(CB_KEY(provider), next, CB_SUSPEND_TTL);
      }
    } catch { /* Redis unavailable */ }
    cbMemory[provider] = next;
    return;
  }

  // Tier 2: Auto-suspend after 5 consecutive failures (24h)
  if (next.failures >= CIRCUIT_BREAKER_SUSPEND_THRESHOLD) {
    next.suspended = true;
    next.suspendedUntil = Date.now() + CIRCUIT_BREAKER_SUSPEND_MS;
    next.open = true;
    console.warn(`🔌 Provider ${provider}: AUTO-SUSPENDED for 24h (${next.failures} consecutive failures — likely dead: low balance, suspended account, or persistent outage)`);
    // Use longer TTL for suspended providers
    try {
      const { simpleRedisManager } = await import('../agent/redis-simple');
      if (simpleRedisManager.isRedisConnected()) {
        await simpleRedisManager.setWithTTL(CB_KEY(provider), next, CB_SUSPEND_TTL);
      }
    } catch { /* Redis unavailable */ }
    cbMemory[provider] = next;
    return;
  }

  // Tier 1: Open circuit after 3 failures (60s cooldown)
  if (next.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    next.open = true;
    console.warn(`⚡ Circuit breaker OPEN for ${provider} (${next.failures} consecutive failures)`);
  }
  await setCBState(provider, next);
}

/**
 * Deterministic errors: retrying is waste, and tripping the circuit breaker
 * is unnecessary (these are per-call issues, not provider-wide outages).
 * Examples: unparseable JSON, empty content, finish_reason=length.
 */
/**
 * Daily-quota rate limits (free tiers: Groq TPD, OpenRouter daily caps, …)
 * return 429 but resolve on quota reset — suspend only for the advertised
 * retry window, never the 24h tier-2 path. Returns ms until reset, or null.
 */
function dailyQuotaResetMs(error: any): number | null {
  const msg = String(error?.message ?? "").toLowerCase();
  if (!/429|rate limit/.test(msg)) return null;
  if (!(msg.includes("per day") || msg.includes("tpd") || msg.includes("daily"))) return null;
  // Groq embeds the reset window: "Please try again in 6m41.76s"
  const m = /try again in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i.exec(error?.message ?? "");
  if (m && (m[1] || m[2] || m[3])) {
    const ms = (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000;
    if (ms > 0) return Math.min(ms + 60_000, 2 * 3_600_000); // hint + 1min buffer, cap 2h
  }
  return 30 * 60_000; // no parseable hint — modest 30min suspension
}

function isDeterministicError(error: Error): boolean {
  const msg = (error.message || "").toLowerCase();
  return msg.includes("unparseable json") ||
    msg.includes("empty content") ||
    msg.includes("finish_reason=length") ||
    msg.includes("non-parseable json");
}

/**
 * Systemic account errors: retrying is waste (won't resolve), but these ARE
 * provider-wide outages — the circuit breaker SHOULD trip so subsequent calls
 * skip this provider entirely instead of wasting time on a dead account.
 * Examples: suspended account, insufficient balance, invalid API key.
 */
function isSystemicAccountError(error: any): boolean {
  // OpenAI SDK surfaces quota exhaustion as error.code="credit_balance_exhausted"
  // / error.type="insufficient_quota" — check structured fields first so a dead
  // account suspends instantly instead of burning retries on every call.
  const code = String(error?.code ?? error?.error?.code ?? "").toLowerCase();
  const type = String(error?.type ?? error?.error?.type ?? "").toLowerCase();
  if (
    code.includes("insufficient_quota") ||
    code.includes("credit_balance") ||
    code.includes("billing_hard_limit") ||
    type.includes("insufficient_quota")
  ) {
    return true;
  }
  const msg = (error.message || "").toLowerCase();
  return msg.includes("suspended") ||
    msg.includes("insufficient balance") ||
    msg.includes("insufficient_quota") ||
    msg.includes("credit_balance_exhausted") ||
    msg.includes("no credits remaining") ||
    msg.includes("credit balance is too low") ||
    msg.includes("credit balance too low") ||
    msg.includes("authentication") ||
    msg.includes("invalid api key");
}

/** Non-retryable = deterministic + systemic account errors. */
function isTerminalError(error: Error): boolean {
  return isDeterministicError(error) || isSystemicAccountError(error);
}

async function recordProviderSuccess(provider: string): Promise<void> {
  await setCBState(provider, { failures: 0, lastFailure: 0, open: false });
}

// ============================================================================
// CLIENTS
// ============================================================================
let openaiClient: OpenAI | null = null;
let deepseekClient: OpenAI | null = null;
let glmClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let kimiClient: OpenAI | null = null;
let googleClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getDeepSeekClient(): OpenAI | null {
  if (!env.DEEPSEEK_API_KEY) return null;
  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    });
  }
  return deepseekClient;
}

/** GLM-5.2 (z.ai) — OpenAI-compatible API, 1M context, prefix caching. */
function getGLMClient(): OpenAI | null {
  if (!env.GLM_API_KEY) return null;
  if (!glmClient) {
    glmClient = new OpenAI({
      apiKey: env.GLM_API_KEY,
      baseURL: env.GLM_BASE_URL || 'https://api.z.ai/v1',
    });
  }
  return glmClient;
}

function getAnthropicClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

/** Kimi K3 (Moonshot AI) — OpenAI-compatible API, 1M context, 128K output, $3/$15 per M. */
function getKimiClient(): OpenAI | null {
  if (!env.MOONSHOT_API_KEY) return null;
  if (!kimiClient) {
    kimiClient = new OpenAI({
      apiKey: env.MOONSHOT_API_KEY,
      baseURL: env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1',
    });
  }
  return kimiClient;
}

/** Google Gemini 3.8 Flash — OpenAI-compatible endpoint, 1M context, $0.75/$3.75 per M. */
function getGoogleClient(): OpenAI | null {
  if (!env.GOOGLE_API_KEY) return null;
  if (!googleClient) {
    googleClient = new OpenAI({
      apiKey: env.GOOGLE_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  }
  return googleClient;
}

// ============================================================================
// FREEPOOL — free-tier last-resort safety net
// ============================================================================
// A single provider facade that internally cascades across free-tier
// OpenAI-compatible endpoints (Groq → Cerebras → NVIDIA NIM → OpenRouter :free
// → Mistral). It is dormant until at least one key is configured, and only
// reached once every paid provider is suspended — it is appended LAST in every
// CROSS_FAMILY_FALLBACK chain. Cost is $0; quality is degraded vs flagships
// but infinitely better than a dead pipeline.

interface FreepoolEndpoint {
  name: string;
  apiKey: string;
  baseURL: string;
  /** Model for fast/utility tasks. */
  fastModel: string;
  /** Model for reasoning/heavy tasks. */
  reasoningModel: string;
  /** Free-tier context ceiling — skip the endpoint when the request exceeds it. */
  maxContextTokens?: number;
}

const FREEPOOL_ENDPOINTS: Array<Omit<FreepoolEndpoint, "apiKey"> & { envKey: keyof typeof env }> = [
  { name: "groq",       envKey: "GROQ_API_KEY",       baseURL: "https://api.groq.com/openai/v1",          fastModel: "openai/gpt-oss-20b",                      reasoningModel: "openai/gpt-oss-120b" },
  { name: "cerebras",   envKey: "CEREBRAS_API_KEY",   baseURL: "https://api.cerebras.ai/v1",              fastModel: "llama-3.3-70b",                         reasoningModel: "llama-3.3-70b", maxContextTokens: 8_000 },
  { name: "nvidia",     envKey: "NVIDIA_API_KEY",     baseURL: "https://integrate.api.nvidia.com/v1",     fastModel: "meta/llama-3.1-8b-instruct",              reasoningModel: "meta/llama-3.3-70b-instruct" },
  { name: "openrouter", envKey: "OPENROUTER_API_KEY", baseURL: "https://openrouter.ai/api/v1",            fastModel: "liquid/lfm-2.5-2.6b:free",              reasoningModel: "nvidia/nemotron-3.5-lightning:free" },
  { name: "mistral",    envKey: "MISTRAL_API_KEY",    baseURL: "https://api.mistral.ai/v1",               fastModel: "mistral-small-latest",                    reasoningModel: "mistral-small-latest" },
];

function getFreepoolEndpoints(): FreepoolEndpoint[] {
  const endpoints: FreepoolEndpoint[] = [];
  for (const e of FREEPOOL_ENDPOINTS) {
    const apiKey = env[e.envKey] as string | undefined;
    if (apiKey) {
      const { envKey: _omit, ...rest } = e;
      endpoints.push({ ...rest, apiKey });
    }
  }
  return endpoints;
}

const freepoolClients = new Map<string, OpenAI>();

function getFreepoolClient(endpoint: FreepoolEndpoint): OpenAI {
  let client = freepoolClients.get(endpoint.name);
  if (!client) {
    client = new OpenAI({ apiKey: endpoint.apiKey, baseURL: endpoint.baseURL });
    freepoolClients.set(endpoint.name, client);
  }
  return client;
}

/**
 * Estimate prompt size in tokens (chars/4 heuristic — no tokenizer dep).
 * Used to skip freepool endpoints whose free-tier context can't hold the call.
 */
function estimatePromptTokens(request: LLMRequest): number {
  let chars = 0;
  for (const m of request.messages) chars += (m.content?.length ?? 0);
  return Math.ceil(chars / 4);
}

async function callFreepool(request: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
  const endpoints = getFreepoolEndpoints();
  if (endpoints.length === 0) throw new Error("freepool: no free-tier key configured");

  const task = normalizeTask(request.task);
  const isFast = FAST_TASKS.has(task);
  const promptTokens = estimatePromptTokens(request);
  let lastError: Error | null = null;

  for (const ep of endpoints) {
    if (ep.maxContextTokens && promptTokens > ep.maxContextTokens) continue;
    const model = isFast ? ep.fastModel : ep.reasoningModel;
    try {
      const client = getFreepoolClient(ep);
      const completion = await client.chat.completions.create(
        {
          model,
          messages: request.messages as any,
          temperature: request.temperature ?? 0.2,
          max_tokens: Math.max(request.maxTokens ?? 4000, 1000),
          ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
          ...(request.tools?.length ? { tools: request.tools as any } : {}),
        },
        signal ? { signal } : {},
      );
      const content = completion.choices?.[0]?.message?.content ?? "";
      if (!content) throw new Error(`freepool/${ep.name} returned empty content`);
      const tokensInput = completion.usage?.prompt_tokens ?? promptTokens;
      const tokensOutput = completion.usage?.completion_tokens ?? 0;
      console.log(`   ↳ freepool via ${ep.name}/${model}`);
      return {
        content,
        model: `${ep.name}/${model}`,
        provider: "freepool",
        family: "freepool",
        tokensInput,
        tokensOutput,
        costUsd: 0,
        cached: false,
      };
    } catch (err) {
      lastError = err as Error;
      console.error(`   ↳ freepool/${ep.name} failed: ${(err as Error).message}`);
    }
  }
  throw lastError ?? new Error("freepool: all free-tier endpoints failed");
}

function getClientForProvider(provider: LLMProvider): OpenAI | Anthropic | null {
  switch (provider) {
    case "deepseek": return getDeepSeekClient();
    case "glm": return getGLMClient();
    case "openai": return getOpenAIClient();
    case "anthropic": return getAnthropicClient();
    case "kimi": return getKimiClient();
    case "google": return getGoogleClient();
    // Sentinel: the provider is "configured" when ≥1 free key exists. The real
    // per-endpoint clients are created lazily inside callFreepool.
    case "freepool": {
      const [first] = getFreepoolEndpoints();
      return first ? getFreepoolClient(first) : null;
    }
  }
}

// ============================================================================
// TASK-BASED RESOLUTION (single source of truth: TASK_ASSIGNMENT)
// ============================================================================

/**
 * Resolve the primary provider for a request.
 * Priority: explicit request.provider > opposite-family rule (fact_check /
 * citation_verification with producerFamily) > TASK_ASSIGNMENT table.
 * Legacy request.model (e.g. "gpt-4o") is honored only if explicitly set AND
 * no task is given — this keeps old call sites working during migration but
 * task-based routing always wins once a task is specified.
 */
function resolvePrimaryProvider(request: LLMRequest): LLMProvider {
  if (request.provider) return request.provider;

  const task = normalizeTask(request.task);

  // Opposite-family rule: fact_check / citation_verification
  // must run on a DIFFERENT family than the one that produced the text being
  // checked (anti blind-spot confirmation bias).
  if (request.producerFamily && (task === "fact_check" || task === "citation_verification")) {
    const opposite = OPPOSITE_FAMILY[request.producerFamily];
    const oppositeProvider = FAMILY_PROVIDER[opposite];
    if (getClientForProvider(oppositeProvider) && !isCircuitOpenSync(oppositeProvider)) {
      return oppositeProvider;
    }
    // Opposite family unavailable — fall through to task default
  }

  // Explicit legacy model string without a task — infer provider from prefix
  if (!request.task && request.model) {
    const m = request.model;
    if (m.startsWith("claude")) return "anthropic";
    if (m.startsWith("deepseek")) return "deepseek";
    if (m.startsWith("glm")) return "glm";
    if (m.startsWith("gpt-")) return "openai";
  }

  return TASK_ASSIGNMENT[task].provider;
}

/**
 * Resolve the model name for a given provider handling a given task.
 * On the task's assigned provider, use the assigned model. On a FALLBACK
 * provider (cross-family failover), pick the provider's fast/reasoning model
 * based on whether the task is categorized as fast.
 */
function resolveModelForTask(provider: LLMProvider, task: LLMTask): string {
  const assignment = TASK_ASSIGNMENT[task];
  if (provider === assignment.provider) return assignment.model;

  const isFast = FAST_TASKS.has(task);
  switch (provider) {
    case "deepseek":
      return isFast ? env.DEEPSEEK_MODEL_FAST : env.DEEPSEEK_MODEL_REASONING;
    case "glm":
      return isFast ? (env.GLM_MODEL_FAST || "glm-4.5-air") : (env.GLM_MODEL || "glm-4.6");
    case "openai":
      return isFast ? "gpt-6-luna" : (env.OPENAI_MODEL || "gpt-6-sol");
    case "anthropic":
      return isFast ? "claude-sonnet-5" : "claude-opus-5.5";
    case "kimi":
      return env.KIMI_MODEL || "kimi-k3";
    case "google":
      return "gemini-3.8-flash";
    case "freepool":
      // The concrete model is chosen per-endpoint inside callFreepool —
      // "auto" only feeds the cache key and logs.
      return "auto";
  }
}

/**
 * Effective timeout for a provider handling a task. Configurable via
 * PROVIDER_DEFAULT_TIMEOUT_MS / TASK_ASSIGNMENT, never below PROVIDER_MIN_TIMEOUT_MS
 * (GLM's floor is 120s to accommodate 30-90s first-token latency on large contexts).
 */
function getCallTimeout(provider: LLMProvider, task: LLMTask): number {
  const assignment = TASK_ASSIGNMENT[task];
  // On fallback providers, keep the task's assigned timeout as a floor:
  // a heavy task (300s on Kimi) must NOT drop to the provider default (60s)
  // when failing over — that guarantees a second timeout.
  const taskTimeout = provider === assignment.provider
    ? assignment.timeoutMs
    : Math.max(assignment.timeoutMs, PROVIDER_DEFAULT_TIMEOUT_MS[provider]);
  return Math.max(taskTimeout, PROVIDER_MIN_TIMEOUT_MS[provider]);
}

/** Public helper: what model would this task+provider resolve to? (used by callers that want to know). */
export function getModelForTask(task: LLMTask, provider?: LLMProvider): string {
  const normalized = normalizeTask(task);
  const resolvedProvider = provider ?? TASK_ASSIGNMENT[normalized].provider;
  return resolveModelForTask(resolvedProvider, normalized);
}

export interface LLMRequest {
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }>;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** Legacy explicit override — prefer `task` for new call sites. */
  model?: string;
  /** Explicit provider override — bypasses TASK_ASSIGNMENT. Use sparingly. */
  provider?: LLMProvider;
  task?: LLMTask;
  enableCache?: boolean;
  /** Family that produced the text being verified — required for opposite-family rule to activate. */
  producerFamily?: LLMFamily;
  /** F-B12: Per-call cost cap in USD. If the response exceeds this, throw to trigger failover. */
  maxCostUsd?: number;
  /** Trace/run ID for observability (Langfuse, durable execution, etc.) */
  runId?: string;
  /** Trace name for observability. Default: the task name. */
  traceName?: string;
  /** Tool definitions for function/tool calling (ReAct pattern). When provided,
   * the model can request tool executions instead of (or before) producing a
   * final answer. The caller is responsible for executing the tools and
   * feeding results back via a `tool` role message. */
  tools?: ToolDefinition[];
  /** Controls tool selection: "auto" (model decides), "required" (must call a tool),
   * "none" (don't call tools). Default: "auto" when tools are provided. */
  toolChoice?: "auto" | "required" | "none";
}

/** A tool/function that the LLM can call during reasoning (ReAct pattern). */
export interface ToolDefinition {
  /** Function name — verbs, snake_case (e.g., "search_sources"). */
  name: string;
  /** One-two sentences: what it does, when to use, when NOT to use. */
  description: string;
  /** JSON Schema for the parameters object. */
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: any;
    }>;
    required?: string[];
  };
}

/** A tool call requested by the LLM. */
export interface ToolCall {
  id: string;
  /** The function name to call. */
  name: string;
  /** JSON-stringified arguments matching the tool's parameter schema. */
  arguments: string;
}

export interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
  family: LLMFamily;
  tokensInput: number;
  tokensOutput: number;
  /** Tokens served from provider-side prompt cache (GLM prefix caching), if any. */
  cachedInputTokens?: number;
  costUsd: number;
  cached: boolean;
  /** Tool calls requested by the model (empty if the model produced a final answer). */
  toolCalls?: ToolCall[];
  /** Why the model stopped generating: "stop" (final answer), "tool_calls" (wants tools), "length" (token limit). */
  finishReason?: "stop" | "tool_calls" | "length" | "content_filter";
}

/**
 * Calculate cost based on provider and model, accounting for cached input
 * tokens (GLM/z.ai prefix caching bills cached tokens at costPer1kCachedInput).
 */
function calculateCost(
  provider: LLMProvider,
  model: string,
  tokensInput: number,
  tokensOutput: number,
  cachedInputTokens?: number,
): number {
  const providerConfig = MODEL_CONFIG[provider as keyof typeof MODEL_CONFIG];
  const config = (providerConfig as any)?.[model];
  if (!config || !config.costPer1kInput || !config.costPer1kOutput) return 0;

  const cached = cachedInputTokens ?? 0;
  const regularInput = Math.max(0, tokensInput - cached);
  const cachedCost = (cached / 1000) * (config.costPer1kCachedInput ?? config.costPer1kInput);
  const inputCost = (regularInput / 1000) * config.costPer1kInput;
  const outputCost = (tokensOutput / 1000) * config.costPer1kOutput;
  return cachedCost + inputCost + outputCost;
}

/**
 * Call any OpenAI-compatible provider (DeepSeek, GLM, OpenAI share the same
 * chat.completions.create() shape). Anthropic has its own implementation below.
 */
async function callOpenAICompatible(
  provider: LLMProvider,
  client: OpenAI,
  model: string,
  request: LLMRequest,
  signal?: AbortSignal,
): Promise<LLMResponse> {
  // Reasoning models (deepseek-v4-pro, deepseek-reasoner) ignore
  // response_format: { type: "json_object" } and output prose/reasoning
  // traces, causing systematic JSON parse failures. When jsonMode is
  // requested, auto-substitute with the non-reasoning variant which
  // honours the parameter and returns clean JSON.
  let effectiveModel = model;
  if (request.jsonMode && provider === "deepseek") {
    const REASONING_MODELS = new Set(["deepseek-v4-pro", "deepseek-reasoner", "deepseek-r1"]);
    if (REASONING_MODELS.has(model)) {
      effectiveModel = env.DEEPSEEK_MODEL_FAST || "deepseek-flash";
    }
  }

  const normalizedTask = normalizeTask(request.task);
  const isReasoningTask = REASONING_TASKS.has(normalizedTask);
  // Thinking is only enabled for reasoning tasks in non-JSON mode (see per-provider blocks below).
  const thinkingEnabled = isReasoningTask && !request.jsonMode;

  // Provider-specific maxTokens adjustments:
  // - GLM: thinking enabled → double budget (reasoning_content consumes tokens);
  //   disabled → no extra budget needed
  // - Kimi: reasoning_effort=low still uses some tokens, enforce min 2000
  // - DeepSeek: thinking disabled for fast tasks but enabled for reasoning, double budget
  // - OpenAI: use requested value as-is
  let effectiveMaxTokens = request.maxTokens ?? 4000;
  if (provider === "glm") {
    effectiveMaxTokens = thinkingEnabled
      ? Math.max(effectiveMaxTokens * 2, 8000)
      : Math.max(effectiveMaxTokens, 1000);
  }
  if (provider === "kimi") {
    effectiveMaxTokens = Math.max(effectiveMaxTokens, 2000);
  }
  // Luna (and other reasoning-fast OpenAI models) return EMPTY content when the
  // token budget is exhausted by JSON structure — a truncated partial response
  // is never returned. reader_v3 call sites pass maxTokens 1600-3000 which is
  // not enough for multi-claim JSON extractions. Floor at 6000 — 4000 still
  // triggered finish_reason=length → ~80s kimi fallback per call.
  if (provider === "openai" && normalizedTask === "reader_v3") {
    effectiveMaxTokens = Math.max(effectiveMaxTokens, 6000);
  }
  if (provider === "deepseek") {
    // Only reserve extra budget for reasoning_content when thinking is actually on.
    effectiveMaxTokens = thinkingEnabled ? Math.max(effectiveMaxTokens * 2, 2000) : Math.max(effectiveMaxTokens, 2000);
  }

  // Kimi K3: always thinks, reasoning_effort controls depth (low/high/max).
  // Use "low" for fast/JSON tasks to minimize token waste, "high" for reasoning.
  // Per docs: temperature, top_p, n are fixed — do NOT pass them explicitly.
  const kimiExtraBody: Record<string, unknown> = {};
  if (provider === "kimi") {
    // thinkingEnabled (not isReasoningTask): in jsonMode the budget must go to
    // the JSON answer, not reasoning_content — otherwise content comes back empty.
    kimiExtraBody.reasoning_effort = thinkingEnabled ? "high" : "low";
  }

  // GLM-4.5/4.6 thinking control: thinking CAN be disabled — do it for
  // fast/JSON tasks, otherwise the model burns the whole budget on
  // reasoning_content and returns empty content (verified live: a 60-token
  // classification call timed out at 120s). reasoning_effort is NOT a z.ai
  // parameter — do not send it.
  const glmExtraBody: Record<string, unknown> = {};
  if (provider === "glm") {
    glmExtraBody.thinking = { type: thinkingEnabled ? "enabled" : "disabled" };
  }

  // Temperature handling per provider:
  // - Kimi K3: fixed at 1.0, must NOT be passed explicitly (API returns error)
  // - GLM-5.2: default 1.0, adjustable — use requested temperature
  // - DeepSeek: adjustable, use requested temperature
  // - OpenAI gpt-5+/gpt-6+: only supports temperature=1 (default), must NOT be passed explicitly
  // - OpenAI gpt-4o and earlier: adjustable, use requested temperature
  const effectiveTemperature = request.temperature ?? 0.2;
  const isOpenAINewModel = provider === "openai" && (effectiveModel.startsWith("gpt-5") || effectiveModel.startsWith("gpt-6"));
  const shouldSendTemperature = provider !== "kimi" && !isOpenAINewModel;

  // DeepSeek V4: thinking is ON by default. Disable for fast/JSON tasks.
  const deepseekExtraBody: Record<string, unknown> = {};
  if (provider === "deepseek") {
    deepseekExtraBody.thinking = { type: thinkingEnabled ? "enabled" : "disabled" };
  }

  // Tool calling support (ReAct pattern) — OpenAI-compatible API format.
  // DeepSeek, GLM, Kimi all support the OpenAI tool calling format.
  const toolsParam = request.tools?.length
    ? request.tools.map(t => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as any,
        },
      }))
    : undefined;
  const toolChoiceParam = request.tools?.length
    ? request.toolChoice === "required"
      ? "required"
      : request.toolChoice === "none"
        ? "none"
        : "auto"
    : undefined;

  // OpenAI gpt-5+/gpt-6+ models require max_completion_tokens instead of max_tokens.
  // gpt-4o and earlier, plus all other providers, still use max_tokens.
  const needsCompletionTokens = provider === "openai" && (effectiveModel.startsWith("gpt-5") || effectiveModel.startsWith("gpt-6"));

  const completion = await withRetry(
    () => client.chat.completions.create({
      model: effectiveModel,
      messages: request.messages as any,
      ...(shouldSendTemperature ? { temperature: effectiveTemperature } : {}),
      ...(needsCompletionTokens
        ? { max_completion_tokens: effectiveMaxTokens }
        : { max_tokens: effectiveMaxTokens }),
      response_format: request.jsonMode ? { type: "json_object" } as any : undefined,
      ...(provider === "glm" ? glmExtraBody : {}),
      ...(provider === "kimi" ? kimiExtraBody : {}),
      ...(provider === "deepseek" ? deepseekExtraBody : {}),
      ...(toolsParam ? { tools: toolsParam } : {}),
      ...(toolChoiceParam ? { tool_choice: toolChoiceParam } : {}),
    } as any, signal ? { signal } : undefined),
    `${provider}/${effectiveModel}`,
  );

  const choice = (completion as any).choices?.[0];
  const message = choice?.message;
  let content = message?.content || "";
  // Reasoning models (GLM-5.2, DeepSeek-R1, Kimi K3) can leave `content` empty
  // and stream the answer — or exhaust the token budget — inside `reasoning_content`.
  // Fall back to it so we don't discard a whole (paid) call — BUT NOT in jsonMode,
  // where reasoning_content is prose and will never be valid JSON.
  if (!content.trim() && message?.reasoning_content && !request.jsonMode) {
    content = message.reasoning_content;
  }
  const finishReason = choice?.finish_reason;
  const tokensInput = (completion as any).usage?.prompt_tokens || 0;
  const tokensOutput = (completion as any).usage?.completion_tokens || 0;
  // GLM/z.ai and Kimi K3 report prefix-cache hits here when the request prefix matched a prior call
  const cachedInputTokens = (completion as any).usage?.prompt_tokens_details?.cached_tokens || 0;

  // Extract tool calls if present (ReAct pattern)
  const rawToolCalls = message?.tool_calls;
  const toolCalls: ToolCall[] | undefined = rawToolCalls?.length
    ? rawToolCalls.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || "",
        arguments: tc.function?.arguments || "{}",
      }))
    : undefined;

  // If the model burned tokens but produced no usable text AND no tool calls
  // (typically a reasoning model that hit `length` mid-thought), throw so
  // callLLM fails over to the next provider.
  if (!content.trim() && !toolCalls?.length) {
    throw new Error(
      `${provider}/${effectiveModel} returned empty content (finish_reason=${finishReason}, out_tokens=${tokensOutput})`
    );
  }

  return {
    content,
    provider,
    model: effectiveModel,
    family: PROVIDER_FAMILY[provider],
    tokensInput,
    tokensOutput,
    cachedInputTokens: cachedInputTokens > 0 ? cachedInputTokens : undefined,
    costUsd: calculateCost(provider, effectiveModel, tokensInput, tokensOutput, cachedInputTokens || undefined),
    cached: false,
    toolCalls,
    finishReason: finishReason as any,
  };
}

/**
 * Call Anthropic Claude
 */
async function callAnthropic(request: LLMRequest, model: string, signal?: AbortSignal): Promise<LLMResponse> {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error("Anthropic API key not configured");
  }
  const requestOptions = signal ? { signal } : undefined;

  // Extract system message
  const systemMessage = request.messages.find((m) => m.role === "system")?.content || "";
  const userMessages = request.messages.filter((m) => m.role !== "system");
  
  // Claude Opus 5 / Sonnet 5: temperature/top_p/top_k return 400 error if non-default.
  // Thinking is ON by default and shares max_tokens budget (thinking + text).
  // For fast/JSON tasks, disable thinking to save tokens and avoid empty content.
  const isNewClaude = model.startsWith("claude-opus-5") || model.startsWith("claude-sonnet-5");
  const normalizedTask = normalizeTask(request.task);
  const shouldThink = REASONING_TASKS.has(normalizedTask);

  // For new Claude with thinking: max_tokens covers thinking + text, so double it.
  // For new Claude without thinking: use requested max_tokens as-is.
  let effectiveMaxTokens = request.maxTokens ?? 4000;
  if (isNewClaude && shouldThink) {
    effectiveMaxTokens = Math.max(effectiveMaxTokens * 2, 8000);
  }

  // Use streaming for heavy tasks to avoid Anthropic's 10-minute non-streaming limit.
  // Light tasks (fact_check, citation_verification, structural_editor, meta_analysis) use non-streaming.
  const heavyTasks = new Set(["analyst_brief", "auto_revision", "editorial_arbiter", "elenchus", "reader_v3", "strategic_analyst", "harvard_council"]);
  const useStreaming = heavyTasks.has(normalizedTask) && !request.tools?.length;

  // Tool calling support for Anthropic (different format from OpenAI)
  const anthropicTools = request.tools?.length
    ? request.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as any,
      }))
    : undefined;

  let content: string;
  let tokensInput: number;
  let tokensOutput: number;
  let toolCalls: ToolCall[] | undefined;
  let finishReason: string | undefined;

  if (useStreaming) {
    // Stream the response to avoid the 10-minute timeout error.
    // NOTE: stream creation is synchronous and never rejects — errors surface in
    // finalMessage(). Both must live inside withRetry, otherwise there is no retry.
    const finalMessage = await withRetry<Anthropic.Message>(
      async () => {
        const stream = client.messages.stream({
          model,
          max_tokens: effectiveMaxTokens,
          ...(isNewClaude ? {} : { temperature: request.temperature ?? 0.2 }),
          ...(isNewClaude && !shouldThink ? { thinking: { type: "disabled" as const } } : {}),
          system: systemMessage,
          messages: userMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        } as any, requestOptions);
        return await stream.finalMessage();
      },
      `Anthropic/${model} (stream)`
    );
    const textBlock = finalMessage.content.find((b: any) => b.type === "text") as { text?: string } | undefined;
    content = textBlock?.text ?? "";
    tokensInput = finalMessage.usage.input_tokens;
    tokensOutput = finalMessage.usage.output_tokens;
    finishReason = finalMessage.stop_reason ?? undefined;
    // Extract tool_use blocks
    const toolUseBlocks = finalMessage.content.filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length > 0) {
      toolCalls = toolUseBlocks.map((b: any) => ({
        id: b.id,
        name: b.name,
        arguments: JSON.stringify(b.input || {}),
      }));
    }
  } else {
    const completion = await withRetry<Anthropic.Message>(
      () => client.messages.create({
        model,
        max_tokens: effectiveMaxTokens,
        ...(isNewClaude ? {} : { temperature: request.temperature ?? 0.2 }),
        ...(isNewClaude && !shouldThink ? { thinking: { type: "disabled" as const } } : {}),
        system: systemMessage,
        messages: userMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        ...(anthropicTools ? { tools: anthropicTools as any } : {}),
        ...(request.toolChoice === "required" ? { tool_choice: { type: "any" } as any } : {}),
        ...(request.toolChoice === "none" ? { tool_choice: { type: "none" } as any } : {}),
      } as any, requestOptions),
      `Anthropic/${model}`
    );
    const textBlock = completion.content.find((b) => b.type === "text") as { text?: string } | undefined;
    content = textBlock?.text ?? "";
    tokensInput = completion.usage.input_tokens;
    tokensOutput = completion.usage.output_tokens;
    finishReason = completion.stop_reason ?? undefined;
    // Extract tool_use blocks
    const toolUseBlocks = completion.content.filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length > 0) {
      toolCalls = toolUseBlocks.map((b: any) => ({
        id: b.id,
        name: b.name,
        arguments: JSON.stringify(b.input || {}),
      }));
    }
  }

  if (!content.trim() && !toolCalls?.length) {
    throw new Error(`anthropic/${model} returned empty content (out_tokens=${tokensOutput})`);
  }
  if (request.jsonMode) {
    let directlyParseable = false;
    try { JSON.parse(content); directlyParseable = true; } catch { /* not directly parseable */ }
    if (!directlyParseable) {
      const repaired = attemptJsonRepair(content);
      if (repaired) {
        console.log(`🔧 anthropic/${model} JSON repaired in-place (len=${content.length}→${repaired.length})`);
        content = repaired;
      } else {
        throw new Error(`anthropic/${model} returned non-parseable JSON (jsonMode=true) — triggering failover`);
      }
    }
  }

  return {
    content,
    provider: "anthropic",
    model,
    family: "anthropic",
    tokensInput,
    tokensOutput,
    costUsd: calculateCost("anthropic", model, tokensInput, tokensOutput),
    cached: false,
    toolCalls,
    finishReason: finishReason as any,
  };
}

/**
 * Build a fast hash-based cache key instead of full JSON.stringify
 */
function buildCacheKey(request: LLMRequest): string {
  const hash = crypto.createHash('sha256');
  
  // CRITICAL FIX: Validate request.messages exists and is iterable
  if (!request.messages || !Array.isArray(request.messages)) {
    console.warn('[CACHE] Invalid messages format, using fallback key');
    return `fallback_${request.task || request.model || 'unknown'}_${request.temperature || 0.2}`;
  }
  
  hash.update(JSON.stringify(request.messages));
  hash.update(JSON.stringify([
    request.provider ?? null, request.model ?? null, request.producerFamily ?? null,
    request.maxCostUsd ?? null,
  ]));
  hash.update(String(request.temperature ?? 0.2));
  hash.update(String(request.jsonMode ?? false));
  hash.update(String(request.maxTokens ?? 4000));
  hash.update(String(request.task ?? ''));
  if (request.tools?.length) {
    hash.update(JSON.stringify(request.tools.map(t => [t.name, t.parameters])));
    hash.update(String(request.toolChoice ?? 'auto'));
  }
  return hash.digest('hex').slice(0, 32);
}

/**
 * Run a provider call under a hard deadline. Unlike a bare Promise.race, the
 * AbortController is passed down to the SDK so the HTTP request is actually
 * cancelled — otherwise the provider keeps generating (and billing) tokens for
 * a response nobody will read, and the socket stays open for minutes.
 */
async function withTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return withExecutionDeadline(ms, label, () => factory(getExecutionSignal()!));
}

/**
 * Tolerant JSON parseability check — mirrors the strategies in agent/json-utils
 * (direct parse → markdown-fence strip → first-brace extraction → truncation
 * repair) so that repairable (e.g. length-truncated) payloads still count as
 * valid and DON'T trigger an unnecessary cross-provider failover. Kept inline
 * here to avoid a lib/llm → lib/agent dependency.
 */
function isParseableJson(raw: string): boolean {
  if (!raw || typeof raw !== "string") return false;
  const tryParse = (s: string): boolean => {
    try { JSON.parse(s); return true; } catch { return false; }
  };
  if (tryParse(raw)) return true;

  // Strip markdown fences + extract the outermost {...} or [...] envelope.
  let s = raw.trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.replace(/^```(?:json|JSON)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj) ? firstArr : firstObj;
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (start === -1) return false;
  if (end > start && tryParse(s.slice(start, end + 1))) return true;

  // Best-effort truncation repair: close any unterminated string / brackets.
  let body = s.slice(start);
  body = body.replace(/,\s*([}\]])/g, "$1");
  let inString = false, escape = false, braces = 0, brackets = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++; else if (ch === "}") braces--;
    else if (ch === "[") brackets++; else if (ch === "]") brackets--;
  }
  if (inString) body += '"';
  while (brackets-- > 0) body += "]";
  while (braces-- > 0) body += "}";
  return tryParse(body);
}

/**
 * Attempt to repair slightly malformed JSON returned by an LLM.
 * Strategies (in order):
 *   1. Strip markdown fences (```json ... ```)
 *   2. Extract the outermost { ... } or [ ... ] envelope
 *   3. Remove trailing commas before closing brackets
 *   4. Close unterminated strings and brackets
 * Returns the repaired JSON string if successful, or null if unrepairable.
 */
function attemptJsonRepair(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;

  // If it already parses, return as-is
  try { JSON.parse(raw); return raw; } catch { /* continue */ }

  let s = raw.trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  // Strip markdown fences
  s = s.replace(/^```(?:json|JSON)?\s*\n?/, "").replace(/\n?```\s*$/, "");

  // Extract the outermost JSON envelope
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj) ? firstArr : firstObj;
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (start === -1) return null;
  // If no closing bracket found (truncated response), take everything from start to end of string
  const bodyEnd = end > start ? end + 1 : s.length;
  let body = s.slice(start, bodyEnd);

  // Remove trailing commas before closing brackets
  body = body.replace(/,\s*([}\]])/g, "$1");

  // Try to parse after each repair step
  try { JSON.parse(body); return body; } catch { /* continue */ }

  // Close unterminated strings and brackets
  let inString = false, escape = false, braces = 0, brackets = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++; else if (ch === "}") braces--;
    else if (ch === "[") brackets++; else if (ch === "]") brackets--;
  }
  if (inString) body += '"';
  while (brackets-- > 0) body += "]";
  while (braces-- > 0) body += "}";

  try { JSON.parse(body); return body; } catch { /* continue */ }

  // Last resort: try to fix common LLM JSON issues
  // Remove control characters (newlines inside strings)
  let cleaned = body.replace(/[\x00-\x1f]/g, (ch) => {
    if (ch === '\n' || ch === '\r' || ch === '\t') return ch;
    return '';
  });
  try { JSON.parse(cleaned); return cleaned; } catch { /* give up */ }

  return null;
}

/**
 * Unified LLM call — task-based routing, cross-family fallback, per-provider
 * configurable timeouts, circuit breaker.
 *
 * Fallback order: primary provider (from task or explicit override) → the
 * two families in CROSS_FAMILY_FALLBACK order. DeepSeek and GLM fall back to
 * each other FIRST; OpenAI/Anthropic are last resort so a single vendor
 * outage never halts publication.
 */
/** Identical in-flight requests share one provider round-trip (see callLLM).
 *  Scoped callers coalesce only within their own AbortSignal — two jobs with
 *  different leases must never share a request either can't abort. */
const IN_FLIGHT_LLM = new Map<string, Promise<LLMResponse>>();
const SCOPED_IN_FLIGHT_LLM = new WeakMap<AbortSignal, Map<string, Promise<LLMResponse>>>();

export class LLMCostLimitError extends Error {}

/**
 * In-flight request coalescing on top of the persistent Redis cache:
 * two concurrent calls with identical (messages, params, task) bill twice on
 * a cache miss — the second caller now awaits the first's promise instead.
 * Tool-calling turns are excluded (stateful, like the cache rule below).
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  assertExecutionActive();
  if (request.maxCostUsd !== undefined && (!Number.isFinite(request.maxCostUsd) || request.maxCostUsd <= 0)) {
    throw new LLMCostLimitError('Invalid per-call cost cap');
  }
  const cacheable = request.enableCache !== false && !request.tools?.length;
  if (!cacheable) return callLLMCore(request);
  const cacheKey = buildCacheKey(request);
  const signal = getExecutionSignal();
  let map = IN_FLIGHT_LLM;
  if (signal) {
    map = SCOPED_IN_FLIGHT_LLM.get(signal) ?? new Map();
    SCOPED_IN_FLIGHT_LLM.set(signal, map);
  }
  const inFlight = map.get(cacheKey);
  if (inFlight) {
    console.log(`[LLM] coalesced in-flight duplicate [${request.task ?? request.model ?? "call"}]`);
    const shared = await inFlight;
    return { ...shared, cached: true };
  }
  const run = callLLMCore(request).finally(() => {
    if (map.get(cacheKey) === run) map.delete(cacheKey);
  });
  map.set(cacheKey, run);
  return run;
}

async function callLLMCore(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();
  const task = normalizeTask(request.task);
  const primaryProvider = resolvePrimaryProvider(request);
  const primaryFamily = PROVIDER_FAMILY[primaryProvider];
  const model = resolveModelForTask(primaryProvider, task);

  // Check cache first if enabled. Tool-calling turns are stateful (the model's
  // tool_calls depend on the conversation so far and must be executed once) —
  // never serve them from cache.
  const cacheable = request.enableCache !== false && !request.tools?.length;
  const cacheKey = cacheable ? buildCacheKey(request) : null;
  if (cacheKey) {
    try {
      const cached = await getCachedLLMResponse(cacheKey, model);
      if (cached) {
        return { ...cached, cached: true, family: cached.family ?? PROVIDER_FAMILY[cached.provider as LLMProvider] };
      }
    } catch {
      // Cache miss or error — proceed to LLM call
    }
  }

  // Build fallback chain: primary provider, then cross-family order, deduped,
  // skipping providers with no client configured or an open circuit.
  const orderedProviders: LLMProvider[] = [];
  if (isFreeRun()) {
    // Zero-cost rehearsal: every call routes to the free-tier cascade.
    // Fail closed — no free key configured must NOT silently fall back to a
    // paid provider.
    if (!getClientForProvider('freepool')) {
      throw new Error('NOMOSX_FREE_RUN is set but no free-tier LLM key is configured (GROQ_API_KEY/CEREBRAS_API_KEY/NVIDIA_API_KEY/OPENROUTER_API_KEY/MISTRAL_API_KEY)');
    }
    orderedProviders.push('freepool');
  } else {
    // Skip a primary with no configured client (e.g. MOONSHOT_API_KEY missing
    // in this env) — go straight to fallbacks instead of wasting a throw.
    if (getClientForProvider(primaryProvider) && !await isCircuitOpen(primaryProvider)) {
      orderedProviders.push(primaryProvider);
    }
    for (const family of CROSS_FAMILY_FALLBACK[primaryFamily]) {
      const p = FAMILY_PROVIDER[family];
      if (!orderedProviders.includes(p) && getClientForProvider(p) && !await isCircuitOpen(p)) {
        orderedProviders.push(p);
      }
    }
    // If all circuits open, still try primary (half-open retry)
    if (orderedProviders.length === 0) orderedProviders.push(primaryProvider);
  }

  // ── J: CAPABILITY-AWARE FAILOVER (DVARA pattern) ──
  // Filter the fallback chain by what the request actually needs.
  // If the request uses tools, only keep tool_calling-capable providers.
  // If jsonMode, only keep structured_output-capable providers.
  {
    const requiredCaps: LLMCapability[] = [];
    if (request.tools && request.tools.length > 0) requiredCaps.push('tool_calling');
    if (request.jsonMode) requiredCaps.push('structured_output');
    if (requiredCaps.length > 0) {
      const filtered = filterByCapability(orderedProviders as unknown as string[], requiredCaps) as unknown as LLMProvider[];
      // Only use filtered list if it's non-empty (otherwise keep original — better to try than to give up)
      if (filtered.length > 0) {
        // Ensure primary is still included if it was filtered out (it's the primary, we trust it)
        if (!filtered.includes(primaryProvider) && orderedProviders.includes(primaryProvider)) {
          filtered.unshift(primaryProvider);
        }
        orderedProviders.length = 0;
        orderedProviders.push(...filtered);
      }
    }
  }

  let lastError: Error | null = null;

  for (const provider of orderedProviders) {
    assertExecutionActive();
    const fallbackModel = resolveModelForTask(provider, task);
    const timeoutMs = getCallTimeout(provider, task);

    try {
      let response: LLMResponse;
      if (provider === "anthropic") {
        response = await withTimeout(
          (signal) => callAnthropic(request, fallbackModel, signal),
          timeoutMs,
          `Anthropic/${fallbackModel}`,
        );
      } else if (provider === "freepool") {
        response = await withTimeout(
          (signal) => callFreepool(request, signal),
          timeoutMs,
          `freepool`,
        );
      } else {
        const client = getClientForProvider(provider) as OpenAI | null;
        if (!client) throw new Error(`${provider} client not configured`);
        response = await withTimeout(
          (signal) => callOpenAICompatible(provider, client, fallbackModel, request, signal),
          timeoutMs,
          `${provider}/${fallbackModel}`,
        );
      }

      // Robustness: when the caller asked for JSON, verify the payload is
      // directly parseable by JSON.parse(). Reasoning models sometimes wrap
      // JSON in markdown fences, truncate it, or emit prose. Try to repair
      // in-place first — saves a costly cross-provider failover when the
      // response is just slightly malformed.
      if (request.jsonMode) {
        let directlyParseable = false;
        try { JSON.parse(response.content); directlyParseable = true; } catch { /* not directly parseable */ }

        if (!directlyParseable) {
          const repaired = attemptJsonRepair(response.content);
          if (repaired) {
            console.log(`🔧 ${provider}/${response.model} JSON repaired in-place (len=${response.content.length}→${repaired.length})`);
            response.content = repaired;
          } else {
            throw new Error(
              `${provider}/${response.model} returned unparseable JSON (len=${response.content.length})`
            );
          }
        }
      }

      // F-B12: Per-call cost budget enforcement
      if (request.maxCostUsd !== undefined && response.costUsd > request.maxCostUsd) {
        throw new LLMCostLimitError(
          `${provider}/${response.model} exceeded per-call cost cap: $${response.costUsd.toFixed(4)} > $${request.maxCostUsd} (in=${response.tokensInput}, out=${response.tokensOutput})`
        );
      }

      await recordProviderSuccess(provider);

      const duration = Date.now() - startTime;
      const cacheNote = response.cachedInputTokens ? ` (${response.cachedInputTokens} cache-hit)` : "";
      console.log(
        `✅ ${provider}/${response.model} [${task}] | ${duration}ms | ${response.tokensInput}+${response.tokensOutput} tok${cacheNote} | $${response.costUsd.toFixed(4)}`
      );

      // Trace to Langfuse (fire-and-forget)
      if (request.runId) {
        traceLLMCall(request, response, request.runId, request.traceName || task, undefined, Date.now() - startTime);
      }

      // Cache successful response (fire-and-forget)
      if (cacheKey) {
        cacheLLMResponse(cacheKey, response.model, response).catch(() => {});
      }

      return response;
    } catch (error) {
      assertExecutionActive();
      if (error instanceof LLMCostLimitError) throw error;
      lastError = error as Error;
      await recordProviderFailure(provider, error as Error);
      console.error(`❌ ${provider} failed for task "${task}": ${(error as Error).message}`);

      Sentry.captureException(error, {
        tags: { provider, model: fallbackModel, task },
        contexts: { llm: { provider, task, temperature: request.temperature, jsonMode: request.jsonMode } },
      });

      continue;
    }
  }

  const errorMsg = `All LLM providers failed for task "${task}". Last error: ${lastError?.message}`;
  Sentry.captureMessage(errorMsg, "error");
  throw new Error(errorMsg);
}

// ============================================================================
// K15: C3PO — Cost-Controlled Cascaded Prediction Optimization
// arXiv 2026 — "Optimized Large Language Model Cascades with Probabilistic
// Cost Constraints for Reasoning"
// ============================================================================
//
// C3PO uses cascaded inference: small, cheap models handle easy queries, and
// only the hardest examples are escalated to more powerful models. It uses
// conformal prediction to bound the probability that inference cost exceeds a
// user-specified budget, with theoretical guarantees on both cost control and
// generalization error.
//
// Cascade architecture:
//   1. Try the cheap model first (DeepSeek Flash / GLM Flash)
//   2. Assess confidence of the cheap model's output
//   3. If confidence < threshold, escalate to the powerful model (DeepSeek Reasoner)
//   4. The threshold is calibrated using conformal prediction to meet the budget
//
// Result (paper): SOTA across GSM8K, MATH-500, BigBench-Hard, AIME — outperforms
// strong LLM cascading baselines in both accuracy and cost-efficiency.

export interface C3POCascadeConfig {
  /** Cheap model provider (tries first) */
  cheapProvider: LLMProvider;
  /** Expensive model provider (escalation) */
  expensiveProvider: LLMProvider;
  /** Confidence threshold for escalation (calibrated by conformal prediction) */
  escalationThreshold: number;
  /** Budget cap in USD for the cascade */
  budgetCapUsd: number;
  /** Target probability of exceeding budget (conformal prediction parameter) */
  budgetExceedProbability: number; // e.g., 0.1 = 10% chance of exceeding budget
  /** Calibration data: (confidence, correct) pairs from past runs */
  calibrationData: Array<{ confidence: number; correct: boolean }>;
  /** Whether to use conformal prediction for threshold calibration */
  useConformalCalibration: boolean;
}

export const DEFAULT_C3PO_CONFIG: C3POCascadeConfig = {
  cheapProvider: 'deepseek',
  expensiveProvider: 'deepseek',
  escalationThreshold: 0.7,
  budgetCapUsd: 0.50,
  budgetExceedProbability: 0.1,
  calibrationData: [],
  useConformalCalibration: true,
};

/**
 * Calibrate the escalation threshold using conformal prediction.
 *
 * Given calibration data (confidence, correct) pairs and a target budget
 * exceed probability α, compute the threshold τ such that:
 *   P(cost > budget) ≤ α
 *
 * The conformal prediction approach: sort calibration confidences, find the
 * (1-α) quantile. Below this threshold, the cheap model is reliable enough.
 */
export function calibrateEscalationThreshold(
  calibrationData: Array<{ confidence: number; correct: boolean }>,
  alpha: number = 0.1,
): number {
  if (calibrationData.length === 0) return 0.7; // Default threshold

  // Sort by confidence
  const sorted = [...calibrationData].sort((a, b) => a.confidence - b.confidence);

  // Find the (1-α) quantile of confidences where the model was correct
  const correct = sorted.filter(d => d.correct);
  if (correct.length === 0) return 0.9; // No correct predictions — high threshold

  const quantileIndex = Math.floor((1 - alpha) * correct.length);
  const threshold = correct[Math.min(quantileIndex, correct.length - 1)].confidence;

  // Clamp to reasonable range
  return Math.max(0.3, Math.min(0.95, threshold));
}

/**
 * Assess the confidence of an LLM response.
 * Uses a combination of:
 *   - Token-level entropy (if available)
 *   - Response length (longer = more confident for reasoning tasks)
 *   - Presence of hedging language (less confident)
 *   - Presence of citations (more confident for analysis tasks)
 */
export function assessResponseConfidence(response: LLMResponse): number {
  let confidence = 0.5; // Base confidence

  // Length: longer responses are generally more confident for analysis
  const lengthScore = Math.min(1, response.content.length / 2000);
  confidence += lengthScore * 0.15;

  // Hedging language: reduces confidence
  const hedgingWords = /\b(may|might|possibly|perhaps|likely|uncertain|unclear|unknown|uncertain)\b/gi;
  const hedgingCount = (response.content.match(hedgingWords) || []).length;
  const hedgingPenalty = Math.min(0.2, hedgingCount * 0.02);
  confidence -= hedgingPenalty;

  // Citations: increases confidence for analysis tasks
  const citationCount = (response.content.match(/\[SRC-\d+\]/g) || []).length;
  const citationBonus = Math.min(0.15, citationCount * 0.01);
  confidence += citationBonus;

  // Definitive language: increases confidence
  const definitiveWords = /\b(therefore|thus|consequently|clearly|demonstrably|evidently|established)\b/gi;
  const definitiveCount = (response.content.match(definitiveWords) || []).length;
  const definitiveBonus = Math.min(0.1, definitiveCount * 0.02);
  confidence += definitiveBonus;

  // Cost: very cheap responses might be too short (less confident)
  if (response.costUsd < 0.001) confidence -= 0.05;

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Run a C3PO cascade: try the cheap model first, escalate if confidence is low.
 *
 * @param request The LLM request
 * @param config C3PO cascade configuration
 * @returns The LLM response (from cheap or expensive model) with cascade metadata
 */
export async function callLLMWithCascade(
  request: LLMRequest,
  config: C3POCascadeConfig = DEFAULT_C3PO_CONFIG,
): Promise<LLMResponse & { cascadeEscalated: boolean; cheapConfidence: number }> {
  // Calibrate threshold if conformal prediction is enabled
  let threshold = config.escalationThreshold;
  if (config.useConformalCalibration && config.calibrationData.length > 0) {
    threshold = calibrateEscalationThreshold(config.calibrationData, config.budgetExceedProbability);
  }

  // Step 1: Try the cheap model
  const cheapRequest: LLMRequest = {
    ...request,
    provider: config.cheapProvider,
    maxCostUsd: config.budgetCapUsd * 0.3, // Cheap model gets 30% of budget
  };

  try {
    const cheapResponse = await callLLM(cheapRequest);
    const confidence = assessResponseConfidence(cheapResponse);

    // Step 2: Check if confidence is high enough
    if (confidence >= threshold) {
      return {
        ...cheapResponse,
        cascadeEscalated: false,
        cheapConfidence: confidence,
      };
    }

    console.log(`[C3PO] Cheap model confidence ${confidence.toFixed(2)} < threshold ${threshold.toFixed(2)} — escalating to ${config.expensiveProvider}`);

    // Step 3: Escalate to the expensive model
    const expensiveRequest: LLMRequest = {
      ...request,
      provider: config.expensiveProvider,
      maxCostUsd: config.budgetCapUsd,
    };

    const expensiveResponse = await callLLM(expensiveRequest);

    return {
      ...expensiveResponse,
      cascadeEscalated: true,
      cheapConfidence: confidence,
    };
  } catch (err) {
    // If cheap model fails, directly use expensive model
    console.warn(`[C3PO] Cheap model failed, escalating directly:`, err);
    const expensiveResponse = await callLLM({
      ...request,
      provider: config.expensiveProvider,
      maxCostUsd: config.budgetCapUsd,
    });

    return {
      ...expensiveResponse,
      cascadeEscalated: true,
      cheapConfidence: 0,
    };
  }
}

/**
 * Streaming LLM call — task-based routing across any OpenAI-compatible provider
 * (DeepSeek, GLM, OpenAI). Anthropic streaming is not implemented; if the
 * resolved provider is Anthropic, falls back to OpenAI for the stream.
 */
export async function streamLLM(
  request: LLMRequest,
  onChunk: (chunk: string) => void
): Promise<LLMResponse> {
  const task = normalizeTask(request.task);
  let provider = resolvePrimaryProvider(request);

  // Zero-cost rehearsal: never open a paid stream — emulate via the freepool
  // cascade with a single chunk.
  if (isFreeRun()) {
    const response = await callLLM(request);
    onChunk(response.content);
    return response;
  }

  // Freepool endpoints are used non-streaming — emulate the stream with a
  // single chunk so callers still get their content.
  if (provider === "freepool") {
    const response = await callLLM(request);
    onChunk(response.content);
    return response;
  }

  if (provider === "anthropic") {
    provider = getOpenAIClient() ? "openai" : (getDeepSeekClient() ? "deepseek" : provider);
  }

  const client = getClientForProvider(provider) as OpenAI | null;
  if (!client) {
    throw new Error(`Streaming provider "${provider}" not configured`);
  }
  const model = resolveModelForTask(provider, task);

  // Kimi K3: temperature is fixed at 1.0 and must not be passed explicitly.
  // OpenAI gpt-5+/gpt-6+: only supports temperature=1 (default), must not be passed explicitly.
  const streamIsOpenAINewModel = provider === "openai" && (model.startsWith("gpt-5") || model.startsWith("gpt-6"));
  const shouldSendTemp = provider !== "kimi" && !streamIsOpenAINewModel;
  const streamTemperature = request.temperature ?? 0.2;

  const streamMaxTokens = request.maxTokens ?? 4000;
  const streamNeedsCompletionTokens = provider === "openai" && (model.startsWith("gpt-5") || model.startsWith("gpt-6"));

  const stream = await client.chat.completions.create({
    model,
    messages: request.messages as any,
    ...(shouldSendTemp ? { temperature: streamTemperature } : {}),
    ...(streamNeedsCompletionTokens
      ? { max_completion_tokens: streamMaxTokens }
      : { max_tokens: streamMaxTokens }),
    stream: true,
  }) as AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>;
  
  let fullContent = "";
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      fullContent += content;
      onChunk(content);
    }
  }
  
  // P0-FIX: Estimate tokens from actual content length (~4 chars/token for English)
  const tokensInput = Math.ceil(
    request.messages.reduce((sum, m) => sum + m.content.length, 0) / 4
  );
  const tokensOutput = Math.ceil(fullContent.length / 4);
  
  return {
    content: fullContent,
    provider,
    model,
    family: PROVIDER_FAMILY[provider],
    tokensInput,
    tokensOutput,
    costUsd: calculateCost(provider, model, tokensInput, tokensOutput),
    cached: false,
  };
}

/**
 * Get available providers (client configured, regardless of circuit state)
 */
export function getAvailableProviders(): LLMProvider[] {
  const providers: LLMProvider[] = [];
  if (getDeepSeekClient()) providers.push("deepseek");
  if (getGLMClient()) providers.push("glm");
  if (getOpenAIClient()) providers.push("openai");
  if (getAnthropicClient()) providers.push("anthropic");
  if (getKimiClient()) providers.push("kimi");
  if (getGoogleClient()) providers.push("google");
  if (getFreepoolEndpoints().length > 0) providers.push("freepool");
  return providers;
}

/**
 * Health check for all five providers.
 */
export async function checkLLMHealth(): Promise<Record<LLMProvider, boolean>> {
  const health: Record<LLMProvider, boolean> = { deepseek: false, glm: false, openai: false, anthropic: false, kimi: false, google: false, freepool: false };

  // Zero-cost rehearsal: a health check is still a billed call on paid
  // providers — only ping the free tier.
  if (isFreeRun()) {
    try {
      const [first] = getFreepoolEndpoints();
      if (first) {
        const client = getFreepoolClient(first);
        await client.chat.completions.create({
          model: first.fastModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        });
        health.freepool = true;
      }
    } catch (err) {
      console.error("Freepool health check failed:", err);
    }
    return health;
  }

  // Test DeepSeek
  try {
    const client = getDeepSeekClient();
    if (client) {
      await client.chat.completions.create({
        model: env.DEEPSEEK_MODEL_FAST,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      health.deepseek = true;
    }
  } catch (err) {
    console.error("DeepSeek health check failed:", err);
  }

  // Test GLM (z.ai)
  try {
    const client = getGLMClient();
    if (client) {
      await client.chat.completions.create({
        model: env.GLM_MODEL || "glm-4.5",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      health.glm = true;
    }
  } catch (err) {
    console.error("GLM health check failed:", err);
  }

  // Test OpenAI
  try {
    const client = getOpenAIClient();
    if (client) {
      await client.models.list();
      health.openai = true;
    }
  } catch (err) {
    console.error("OpenAI health check failed:", err);
  }
  
  // Test Anthropic — P0-FIX: actual API call instead of just checking if client exists
  try {
    const client = getAnthropicClient();
    if (client) {
      await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      } as any);
      health.anthropic = true;
    }
  } catch (err) {
    console.error("Anthropic health check failed:", err);
  }

  // Test Kimi (Moonshot)
  try {
    const client = getKimiClient();
    if (client) {
      await client.chat.completions.create({
        model: KIMI_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      } as any);
      health.kimi = true;
    }
  } catch (err) {
    console.error("Kimi health check failed:", err);
  }

  // Test Google (Gemini)
  try {
    const client = getGoogleClient();
    if (client) {
      await client.chat.completions.create({
        model: "gemini-3.8-flash",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      health.google = true;
    }
  } catch (err) {
    console.error("Google health check failed:", err);
  }

  // Test freepool — ping the first configured free-tier endpoint only
  // (a full cascade ping would burn free quota on every health check).
  try {
    const [first] = getFreepoolEndpoints();
    if (first) {
      const client = getFreepoolClient(first);
      await client.chat.completions.create({
        model: first.fastModel,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      health.freepool = true;
    }
  } catch (err) {
    console.error("Freepool health check failed:", err);
  }

  return health;
}

/** Get the LLMFamily for a completed response — pass this to producerFamily on subsequent verification calls. */
export function getResponseFamily(response: LLMResponse): LLMFamily {
  return response.family;
}
