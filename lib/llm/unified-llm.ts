/**
 * Unified LLM Service — Phase 0 re-cabled (01/07/2026)
 *
 * Five providers (DeepSeek, GLM-5.2/z.ai, OpenAI, Anthropic, Kimi K3/Moonshot):
 * - Task→model assignment table (single source of truth, see TASK_ASSIGNMENT)
 * - Cross-family fallback: DeepSeek ↔ Kimi primary pair, GLM/OpenAI/Anthropic fallback
 * - Per-provider configurable timeouts (GLM needs ≥120s for 30-90s first-token latency)
 * - Opposite-family rule for fact_check / citation_verification (anti blind-spot)
 * - Circuit breaker per provider
 * - Kimi K3: temperature=1 enforced, thinking_budget=0 for JSON tasks
 * - Anthropic Opus 5 / Sonnet 5: temperature parameter omitted (API requirement)
 *
 * 2026-07 upgrade: Kimi K3 (Index 57, 1M ctx, 128K output) for heavy reasoning,
 * Claude Sonnet 5 for verification, DeepSeek Flash for fast tasks.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
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
export type LLMFamily = "deepseek" | "glm" | "openai" | "anthropic" | "kimi";
export type LLMProvider = "deepseek" | "glm" | "openai" | "anthropic" | "kimi";

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
  | "cross_impact";

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
};

const FAMILY_PROVIDER: Record<LLMFamily, LLMProvider> = {
  deepseek: "deepseek",
  glm: "glm",
  openai: "openai",
  anthropic: "anthropic",
  kimi: "kimi",
};

/**
 * Cross-family fallback order. Primary pair is DeepSeek ↔ Kimi (the two workhorse
 * families); GLM/OpenAI/Anthropic are fallback so a single vendor outage never
 * stops publication.
 */
const CROSS_FAMILY_FALLBACK: Record<LLMFamily, LLMFamily[]> = {
  deepseek: ["kimi", "glm", "openai", "anthropic"],
  glm: ["deepseek", "kimi", "openai", "anthropic"],
  openai: ["deepseek", "kimi", "glm", "anthropic"],
  anthropic: ["kimi", "openai", "deepseek", "glm"],
  kimi: ["deepseek", "glm", "openai", "anthropic"],
};

/** Opposite family for the fact_check / citation_verification independence rule. */
const OPPOSITE_FAMILY: Record<LLMFamily, LLMFamily> = {
  deepseek: "kimi",
  glm: "deepseek",
  openai: "deepseek",
  anthropic: "kimi",
  kimi: "anthropic",
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
};

/** Hard floor per provider — never go below this even if a task requests less. */
const PROVIDER_MIN_TIMEOUT_MS: Record<LLMProvider, number> = {
  deepseek: 30_000,
  glm: 180_000,
  openai: 30_000,
  anthropic: 30_000,
  kimi: 120_000,
};

const TASK_ASSIGNMENT: Record<LLMTask, TaskAssignment> = {
  // Fast / cheap / frequent
  query_enhancement:      { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  topic_classification:   { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  casting:                { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  editor_in_chief:        { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 60_000 },
  swarm_persona:          { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },

  // Extraction / verification — Anthropic Sonnet 5 for precision (Index ~55, $2/$10 intro)
  // Opposite-family rule still applies at runtime via resolveTaskProvider().
  fact_check:             { provider: "anthropic", model: "claude-sonnet-5", timeoutMs: 60_000 },
  citation_verification:  { provider: "anthropic", model: "claude-sonnet-5", timeoutMs: 60_000 },

  // Heavy INPUT + OUTPUT — DeepSeek Flash as primary (10x cheaper than Kimi,
  // sufficient for abstract/PDF reading). Kimi K3 as fallback for long PDFs.
  reader_v3:              { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 300_000 },
  strategic_analyst:      { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 600_000 },
  harvard_council:        { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 300_000 },
  elenchus:               { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 300_000 },

  // Heavy structured-JSON OUTPUT — Kimi K3 for deep reasoning + 128K output.
  // Produces 5000+ word analyses without truncation. DeepSeek Flash as fallback.
  // DeepSeek as primary for analyst_brief: Kimi K3 consistently times out (180s+)
  // on strategic-depth passes. DeepSeek Flash is faster and cheaper, with Kimi as fallback.
  analyst_brief:          { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 300_000 },
  auto_revision:          { provider: "kimi", model: "kimi-k3", timeoutMs: 300_000 },
  editorial_arbiter:      { provider: "kimi", model: "kimi-k3", timeoutMs: 300_000 },

  // Verification / analysis — Anthropic Opus 5 (best reasoning, $5/$25 per M)
  meta_analysis:          { provider: "anthropic", model: "claude-opus-5", timeoutMs: 90_000 },
  structural_editor:      { provider: "anthropic", model: "claude-opus-5", timeoutMs: 60_000 },

  // Conversational
  studiox:                { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 60_000 },
  enrichment_reasoner:    { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  preflight_semantic_check: { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 15_000 },
  query_reformulation:    { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 15_000 },

  // Primary data synthesis — Kimi K3 for nuance and structured output from interviews/surveys
  primary_data_synthesis: { provider: "kimi", model: "kimi-k3", timeoutMs: 300_000 },
  // Policy stress test — multiple specialist personas in one call
  stress_test: { provider: "kimi", model: "kimi-k3", timeoutMs: 300_000 },

  // Legacy aliases — never read directly (normalizeTask() redirects before lookup),
  // kept so LLMTask stays a superset and TS doesn't complain about missing keys.
  classification:         { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  extraction:             { provider: "glm", model: "glm-5.2", timeoutMs: 120_000 },
  citation:               { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 60_000 },
  analysis:               { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 120_000 },
  strategic_analysis:     { provider: "glm", model: "glm-5.2", timeoutMs: 180_000 },
  critique:               { provider: "glm", model: "glm-5.2", timeoutMs: 120_000 },
  rewrite:                { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 120_000 },
  reflection:             { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  // V3.2: New tasks for 2026 innovations
  verbal_rerank:          { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  reflective_rag:         { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  cite_audit:             { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  // Sprint 17: Delphi foresight — fast reasoning for multi-expert elicitation
  delphi_round1:          { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  delphi_round2:          { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  cross_impact:           { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
};

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
    "deepseek-chat": { contextWindow: 128000, costPer1kInput: 0.00028, costPer1kOutput: 0.00042 },
    "deepseek-reasoner": { contextWindow: 128000, costPer1kInput: 0.00028, costPer1kOutput: 0.00042 },
  },
  glm: {
    "glm-5.2": {
      contextWindow: 1000000,
      costPer1kInput: 0.00140,
      costPer1kOutput: 0.00440,
      costPer1kCachedInput: 0.00026,
    },
  },
  openai: {
    "gpt-4o": { contextWindow: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015 },
    "gpt-4o-mini": { contextWindow: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },
    "gpt-4-turbo": { contextWindow: 128000, costPer1kInput: 0.01, costPer1kOutput: 0.03 },
  },
  anthropic: {
    "claude-sonnet-5": { contextWindow: 1000000, costPer1kInput: 0.002, costPer1kOutput: 0.010 },
    "claude-opus-5": { contextWindow: 1000000, costPer1kInput: 0.005, costPer1kOutput: 0.025 },
    "claude-haiku-4-5-20251001": { contextWindow: 200000, costPer1kInput: 0.0008, costPer1kOutput: 0.004 },
    "claude-sonnet-4-6": { contextWindow: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
    "claude-opus-4-7": { contextWindow: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075 },
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
const CB_KEY = (p: string) => `nomosx:cb:llm:${p}`;

interface CBState { failures: number; lastFailure: number; open: boolean; suspended?: boolean; suspendedUntil?: number }
const cbMemory: Record<string, CBState> = {}; // in-process fallback

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
function isSystemicAccountError(error: Error): boolean {
  const msg = (error.message || "").toLowerCase();
  return msg.includes("suspended") ||
    msg.includes("insufficient balance") ||
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

function getClientForProvider(provider: LLMProvider): OpenAI | Anthropic | null {
  switch (provider) {
    case "deepseek": return getDeepSeekClient();
    case "glm": return getGLMClient();
    case "openai": return getOpenAIClient();
    case "anthropic": return getAnthropicClient();
    case "kimi": return getKimiClient();
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
      return "glm-5.2";
    case "openai":
      return isFast ? "gpt-4o-mini" : (env.OPENAI_MODEL || "gpt-4o");
    case "anthropic":
      return isFast ? "claude-sonnet-5" : "claude-opus-5";
    case "kimi":
      return "kimi-k3";
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
      effectiveModel = env.DEEPSEEK_MODEL_FAST || "deepseek-v4-flash";
    }
  }

  // Provider-specific maxTokens adjustments:
  // - GLM: reasoning model, doubles token budget (reasoning_content consumes tokens)
  // - Kimi: reasoning_effort=low still uses some tokens, enforce min 2000
  // - DeepSeek: thinking disabled for fast tasks but enabled for reasoning, double budget
  // - OpenAI: use requested value as-is
  let effectiveMaxTokens = request.maxTokens ?? 4000;
  if (provider === "glm") {
    effectiveMaxTokens = Math.max(effectiveMaxTokens * 2, 8000);
  }
  if (provider === "kimi") {
    effectiveMaxTokens = Math.max(effectiveMaxTokens, 2000);
  }
  if (provider === "deepseek") {
    effectiveMaxTokens = Math.max(effectiveMaxTokens * 2, 2000);
  }

  // Kimi K3: always thinks, reasoning_effort controls depth (low/high/max).
  // Use "low" for fast/JSON tasks to minimize token waste, "high" for reasoning.
  // Per docs: temperature, top_p, n are fixed — do NOT pass them explicitly.
  const kimiExtraBody: Record<string, unknown> = {};
  if (provider === "kimi") {
    const normalizedTask = normalizeTask(request.task);
    const reasoningTasks = new Set(["elenchus", "reader_v3", "strategic_analyst", "analyst_brief", "auto_revision", "editorial_arbiter", "harvard_council", "critique", "extraction", "strategic_analysis"]);
    kimiExtraBody.reasoning_effort = reasoningTasks.has(normalizedTask) ? "high" : "low";
  }

  // GLM-5.2 thinking control: disable reasoning for fast/JSON tasks to save
  // tokens + latency. Keep thinking enabled for reasoning-heavy tasks.
  // Per docs: thinking={type:"enabled"|"disabled"}, reasoning_effort="max"|"high"|"low"|"none".
  const glmExtraBody: Record<string, unknown> = {};
  if (provider === "glm") {
    const normalizedTask = normalizeTask(request.task);
    const reasoningTasks = new Set(["elenchus", "reader_v3", "strategic_analyst", "critique", "extraction", "strategic_analysis"]);
    const shouldThink = reasoningTasks.has(normalizedTask) && !request.jsonMode;
    glmExtraBody.thinking = { type: shouldThink ? "enabled" : "disabled" };
    if (shouldThink) {
      glmExtraBody.reasoning_effort = "high";
    }
  }

  // Temperature handling per provider:
  // - Kimi K3: fixed at 1.0, must NOT be passed explicitly (API returns error)
  // - GLM-5.2: default 1.0, adjustable — use requested temperature
  // - DeepSeek: adjustable, use requested temperature
  // - OpenAI: adjustable, use requested temperature
  const effectiveTemperature = request.temperature ?? 0.2;
  const shouldSendTemperature = provider !== "kimi";

  // DeepSeek V4: thinking is ON by default. Disable for fast/JSON tasks.
  const deepseekExtraBody: Record<string, unknown> = {};
  if (provider === "deepseek") {
    const normalizedTask = normalizeTask(request.task);
    const reasoningTasks = new Set(["elenchus", "reader_v3", "strategic_analyst", "analyst_brief", "auto_revision", "editorial_arbiter", "harvard_council", "critique", "extraction", "strategic_analysis"]);
    const shouldThink = reasoningTasks.has(normalizedTask) && !request.jsonMode;
    deepseekExtraBody.thinking = { type: shouldThink ? "enabled" : "disabled" };
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

  const completion = await withRetry(
    () => client.chat.completions.create({
      model: effectiveModel,
      messages: request.messages as any,
      ...(shouldSendTemperature ? { temperature: effectiveTemperature } : {}),
      max_tokens: effectiveMaxTokens,
      response_format: request.jsonMode ? { type: "json_object" } as any : undefined,
      ...(provider === "glm" ? glmExtraBody : {}),
      ...(provider === "kimi" ? kimiExtraBody : {}),
      ...(provider === "deepseek" ? deepseekExtraBody : {}),
      ...(toolsParam ? { tools: toolsParam } : {}),
      ...(toolChoiceParam ? { tool_choice: toolChoiceParam } : {}),
    } as any),
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
async function callAnthropic(request: LLMRequest, model: string): Promise<LLMResponse> {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error("Anthropic API key not configured");
  }

  // Extract system message
  const systemMessage = request.messages.find((m) => m.role === "system")?.content || "";
  const userMessages = request.messages.filter((m) => m.role !== "system");
  
  // Claude Opus 5 / Sonnet 5: temperature/top_p/top_k return 400 error if non-default.
  // Thinking is ON by default and shares max_tokens budget (thinking + text).
  // For fast/JSON tasks, disable thinking to save tokens and avoid empty content.
  const isNewClaude = model.startsWith("claude-opus-5") || model.startsWith("claude-sonnet-5");
  const normalizedTask = normalizeTask(request.task);
  const reasoningTasks = new Set(["elenchus", "reader_v3", "strategic_analyst", "analyst_brief", "auto_revision", "editorial_arbiter", "harvard_council", "critique", "extraction", "strategic_analysis"]);
  const shouldThink = reasoningTasks.has(normalizedTask);

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
    // Stream the response to avoid the 10-minute timeout error
    const stream = await withRetry<any>(
      () => Promise.resolve(client.messages.stream({
        model,
        max_tokens: effectiveMaxTokens,
        ...(isNewClaude ? {} : { temperature: request.temperature ?? 0.2 }),
        ...(isNewClaude && !shouldThink ? { thinking: { type: "disabled" as const } } : {}),
        system: systemMessage,
        messages: userMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      } as any)),
      `Anthropic/${model} (stream)`
    );
    const finalMessage = await stream.finalMessage();
    const textBlock = finalMessage.content.find((b: any) => b.type === "text") as { text?: string } | undefined;
    content = textBlock?.text ?? "";
    tokensInput = finalMessage.usage.input_tokens;
    tokensOutput = finalMessage.usage.output_tokens;
    finishReason = finalMessage.stop_reason;
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
      } as any),
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
  if (request.jsonMode && !isParseableJson(content)) {
    throw new Error(`anthropic/${model} returned non-parseable JSON (jsonMode=true) — triggering failover`);
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
  
  for (const msg of request.messages) {
    hash.update(msg.role);
    hash.update(msg.content);
  }
  hash.update(String(request.temperature ?? 0.2));
  hash.update(String(request.jsonMode ?? false));
  hash.update(String(request.maxTokens ?? 4000));
  hash.update(String(request.task ?? ''));
  return hash.digest('hex').slice(0, 32);
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
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
 * Unified LLM call — task-based routing, cross-family fallback, per-provider
 * configurable timeouts, circuit breaker.
 *
 * Fallback order: primary provider (from task or explicit override) → the
 * two families in CROSS_FAMILY_FALLBACK order. DeepSeek and GLM fall back to
 * each other FIRST; OpenAI/Anthropic are last resort so a single vendor
 * outage never halts publication.
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();
  const task = normalizeTask(request.task);
  const primaryProvider = resolvePrimaryProvider(request);
  const primaryFamily = PROVIDER_FAMILY[primaryProvider];
  const model = resolveModelForTask(primaryProvider, task);

  // Check cache first if enabled
  const cacheKey = request.enableCache !== false ? buildCacheKey(request) : null;
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
  if (!await isCircuitOpen(primaryProvider)) orderedProviders.push(primaryProvider);
  for (const family of CROSS_FAMILY_FALLBACK[primaryFamily]) {
    const p = FAMILY_PROVIDER[family];
    if (!orderedProviders.includes(p) && getClientForProvider(p) && !await isCircuitOpen(p)) {
      orderedProviders.push(p);
    }
  }
  // If all circuits open, still try primary (half-open retry)
  if (orderedProviders.length === 0) orderedProviders.push(primaryProvider);

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
    const fallbackModel = resolveModelForTask(provider, task);
    const timeoutMs = getCallTimeout(provider, task);

    try {
      let response: LLMResponse;
      if (provider === "anthropic") {
        response = await withTimeout(callAnthropic(request, fallbackModel), timeoutMs, `Anthropic/${fallbackModel}`);
      } else {
        const client = getClientForProvider(provider) as OpenAI | null;
        if (!client) throw new Error(`${provider} client not configured`);
        response = await withTimeout(
          callOpenAICompatible(provider, client, fallbackModel, request),
          timeoutMs,
          `${provider}/${fallbackModel}`,
        );
      }

      // Robustness: when the caller asked for JSON, verify the payload is
      // actually parseable (tolerant of fences/truncation). Reasoning models
      // occasionally emit prose or hidden-thought text; failing over to the
      // next provider is far better than returning unparseable content that
      // forces every downstream agent into its degraded fallback.
      if (request.jsonMode && !isParseableJson(response.content)) {
        throw new Error(
          `${provider}/${response.model} returned unparseable JSON (len=${response.content.length})`
        );
      }

      // F-B12: Per-call cost budget enforcement
      if (request.maxCostUsd && response.costUsd > request.maxCostUsd) {
        throw new Error(
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

  if (provider === "anthropic") {
    provider = getOpenAIClient() ? "openai" : (getDeepSeekClient() ? "deepseek" : provider);
  }

  const client = getClientForProvider(provider) as OpenAI | null;
  if (!client) {
    throw new Error(`Streaming provider "${provider}" not configured`);
  }
  const model = resolveModelForTask(provider, task);

  // Kimi K3: temperature is fixed at 1.0 and must not be passed explicitly.
  const shouldSendTemp = provider !== "kimi";
  const streamTemperature = request.temperature ?? 0.2;

  const stream = await client.chat.completions.create({
    model,
    messages: request.messages as any,
    ...(shouldSendTemp ? { temperature: streamTemperature } : {}),
    max_tokens: request.maxTokens ?? 4000,
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
  return providers;
}

/**
 * Health check for all five providers.
 */
export async function checkLLMHealth(): Promise<Record<LLMProvider, boolean>> {
  const health: Record<LLMProvider, boolean> = { deepseek: false, glm: false, openai: false, anthropic: false, kimi: false };

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
        model: "glm-5.2",
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
        model: "kimi-k3",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      } as any);
      health.kimi = true;
    }
  } catch (err) {
    console.error("Kimi health check failed:", err);
  }
  
  return health;
}

/** Get the LLMFamily for a completed response — pass this to producerFamily on subsequent verification calls. */
export function getResponseFamily(response: LLMResponse): LLMFamily {
  return response.family;
}
