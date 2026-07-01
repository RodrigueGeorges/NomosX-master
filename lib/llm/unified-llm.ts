/**
 * Unified LLM Service — Phase 0 re-cabled (01/07/2026)
 *
 * Four providers (DeepSeek, GLM-5.2/z.ai, OpenAI, Anthropic) organized by FAMILY:
 * - Task→model assignment table (single source of truth, see TASK_ASSIGNMENT)
 * - Cross-family fallback: DeepSeek ↔ GLM primary pair, OpenAI/Anthropic last resort
 * - Per-provider configurable timeouts (GLM needs ≥120s for 30-90s first-token latency)
 * - Opposite-family rule for fact_check / citation_verification (anti blind-spot)
 * - Circuit breaker per provider (unchanged behavior)
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { env } from '../env';
import { getCachedLLMResponse,cacheLLMResponse } from '../cache/redis-cache';
import Sentry from '@sentry/nextjs';

// ============================================================================
// FAMILY & PROVIDER TYPES
// ============================================================================

/**
 * LLMFamily groups providers into two "camps" for cross-family fallback and the
 * opposite-family verification rule. Today family === provider 1:1, but this
 * indirection is intentional: it lets us later group e.g. multiple GLM-compatible
 * providers under one family without touching call sites.
 */
export type LLMFamily = "deepseek" | "glm" | "openai" | "anthropic";
export type LLMProvider = "deepseek" | "glm" | "openai" | "anthropic";

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
  // Legacy task names — kept for backward compat during migration, mapped in LEGACY_TASK_ALIAS
  | "classification"
  | "extraction"
  | "citation"
  | "analysis"
  | "strategic_analysis"
  | "critique"
  | "rewrite";

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
};

const FAMILY_PROVIDER: Record<LLMFamily, LLMProvider> = {
  deepseek: "deepseek",
  glm: "glm",
  openai: "openai",
  anthropic: "anthropic",
};

/**
 * Cross-family fallback order. Primary pair is DeepSeek ↔ GLM (the two workhorse
 * families); OpenAI/Anthropic are last-resort so a single vendor outage never
 * stops publication.
 */
const CROSS_FAMILY_FALLBACK: Record<LLMFamily, LLMFamily[]> = {
  deepseek: ["glm", "openai", "anthropic"],
  glm: ["deepseek", "openai", "anthropic"],
  openai: ["deepseek", "glm", "anthropic"],
  anthropic: ["deepseek", "glm", "openai"],
};

/** Opposite family for the fact_check / citation_verification independence rule. */
const OPPOSITE_FAMILY: Record<LLMFamily, LLMFamily> = {
  deepseek: "glm",
  glm: "deepseek",
  openai: "deepseek",
  anthropic: "deepseek",
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
  glm: 120_000,
  openai: 60_000,
  anthropic: 60_000,
};

/** Hard floor per provider — never go below this even if a task requests less. */
const PROVIDER_MIN_TIMEOUT_MS: Record<LLMProvider, number> = {
  deepseek: 30_000,
  glm: 120_000,
  openai: 30_000,
  anthropic: 30_000,
};

const TASK_ASSIGNMENT: Record<LLMTask, TaskAssignment> = {
  // Fast / cheap / frequent
  query_enhancement:      { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  topic_classification:   { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  casting:                { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  editor_in_chief:        { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  swarm_persona:          { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },

  // Extraction / verification — default provider below is overridden at runtime
  // by resolveTaskProvider() when producerFamily is passed (opposite-family rule).
  fact_check:             { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 60_000 },
  citation_verification:  { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 60_000 },

  // Heavy context, cache-friendly (GLM-5.2: 1M window, $0.26/M cached input)
  reader_v3:              { provider: "glm", model: "glm-5.2", timeoutMs: 120_000 },
  strategic_analyst:      { provider: "glm", model: "glm-5.2", timeoutMs: 180_000 },
  harvard_council:        { provider: "glm", model: "glm-5.2", timeoutMs: 120_000 },
  elenchus:               { provider: "glm", model: "glm-5.2", timeoutMs: 120_000 },

  // Heavy output, cheap tokens (DeepSeek-v4-pro: ~$0.87/M blended output)
  analyst_brief:          { provider: "deepseek", model: "deepseek-v4-pro", timeoutMs: 120_000 },
  meta_analysis:          { provider: "deepseek", model: "deepseek-v4-pro", timeoutMs: 60_000 },
  editorial_arbiter:      { provider: "deepseek", model: "deepseek-v4-pro", timeoutMs: 120_000 },
  auto_revision:          { provider: "deepseek", model: "deepseek-v4-pro", timeoutMs: 120_000 },

  // Conversational
  studiox:                { provider: "deepseek", model: "deepseek-v4-pro", timeoutMs: 60_000 },

  // Legacy aliases — never read directly (normalizeTask() redirects before lookup),
  // kept so LLMTask stays a superset and TS doesn't complain about missing keys.
  classification:         { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  extraction:             { provider: "glm", model: "glm-5.2", timeoutMs: 120_000 },
  citation:               { provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 60_000 },
  analysis:               { provider: "deepseek", model: "deepseek-v4-pro", timeoutMs: 120_000 },
  strategic_analysis:     { provider: "glm", model: "glm-5.2", timeoutMs: 180_000 },
  critique:               { provider: "glm", model: "glm-5.2", timeoutMs: 120_000 },
  rewrite:                { provider: "deepseek", model: "deepseek-v4-pro", timeoutMs: 120_000 },
};

/** Fast tasks — used to pick fast vs. reasoning model on FALLBACK providers. */
const FAST_TASKS: Set<LLMTask> = new Set([
  "query_enhancement", "topic_classification", "casting", "editor_in_chief",
  "swarm_persona", "fact_check", "citation_verification", "classification", "citation",
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
    "deepseek-v4-pro": { contextWindow: 1000000, costPer1kInput: 0.00174, costPer1kOutput: 0.00348 },
    "deepseek-v4-flash": { contextWindow: 1000000, costPer1kInput: 0.00014, costPer1kOutput: 0.00028 },
    "deepseek-chat": { contextWindow: 128000, costPer1kInput: 0.00028, costPer1kOutput: 0.00042 },
    "deepseek-reasoner": { contextWindow: 128000, costPer1kInput: 0.00028, costPer1kOutput: 0.00042 },
  },
  glm: {
    "glm-5.2": {
      contextWindow: 1000000,
      costPer1kInput: 0.00140,
      costPer1kOutput: 0.00140,
      costPer1kCachedInput: 0.00026,
    },
  },
  openai: {
    "gpt-4o": { contextWindow: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015 },
    "gpt-4o-mini": { contextWindow: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },
    "gpt-4-turbo": { contextWindow: 128000, costPer1kInput: 0.01, costPer1kOutput: 0.03 },
  },
  anthropic: {
    "claude-sonnet-4-6": { contextWindow: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
    "claude-haiku-4-5-20251001": { contextWindow: 200000, costPer1kInput: 0.0008, costPer1kOutput: 0.004 },
    "claude-opus-4-7": { contextWindow: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075 },
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
  const status = error.status || error.statusCode || error?.response?.status;
  if (RETRY_CONFIG.retryableStatusCodes.includes(status)) return true;
  const msg = (error.message || "").toLowerCase();
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

// Circuit breaker: track provider failures to avoid hammering dead APIs
const circuitBreaker: Record<string, { failures: number; lastFailure: number; open: boolean }> = {};
const CIRCUIT_BREAKER_THRESHOLD = 3;   // failures before opening circuit
const CIRCUIT_BREAKER_RESET_MS = 60000; // 1 min cooldown

function isCircuitOpen(provider: string): boolean {
  const cb = circuitBreaker[provider];
  if (!cb || !cb.open) return false;
  if (Date.now() - cb.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
    cb.open = false;
    cb.failures = 0;
    return false;
  }
  return true;
}

function recordProviderFailure(provider: string): void {
  if (!circuitBreaker[provider]) {
    circuitBreaker[provider] = { failures: 0, lastFailure: 0, open: false };
  }
  const cb = circuitBreaker[provider];
  cb.failures++;
  cb.lastFailure = Date.now();
  if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    cb.open = true;
    console.warn(`⚡ Circuit breaker OPEN for ${provider} (${cb.failures} consecutive failures)`);
  }
}

function recordProviderSuccess(provider: string): void {
  circuitBreaker[provider] = { failures: 0, lastFailure: 0, open: false };
}

// ============================================================================
// CLIENTS
// ============================================================================
let openaiClient: OpenAI | null = null;
let deepseekClient: OpenAI | null = null;
let glmClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

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

function getClientForProvider(provider: LLMProvider): OpenAI | Anthropic | null {
  switch (provider) {
    case "deepseek": return getDeepSeekClient();
    case "glm": return getGLMClient();
    case "openai": return getOpenAIClient();
    case "anthropic": return getAnthropicClient();
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

  // Opposite-family rule: fact_check / citation_verification must run on a
  // DIFFERENT family than the one that produced the text being checked.
  if (request.producerFamily && (task === "fact_check" || task === "citation_verification")) {
    const opposite = OPPOSITE_FAMILY[request.producerFamily];
    const oppositeProvider = FAMILY_PROVIDER[opposite];
    if (getClientForProvider(oppositeProvider) && !isCircuitOpen(oppositeProvider)) {
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
      return isFast ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  }
}

/**
 * Effective timeout for a provider handling a task. Configurable via
 * PROVIDER_DEFAULT_TIMEOUT_MS / TASK_ASSIGNMENT, never below PROVIDER_MIN_TIMEOUT_MS
 * (GLM's floor is 120s to accommodate 30-90s first-token latency on large contexts).
 */
function getCallTimeout(provider: LLMProvider, task: LLMTask): number {
  const assignment = TASK_ASSIGNMENT[task];
  const taskTimeout = provider === assignment.provider
    ? assignment.timeoutMs
    : PROVIDER_DEFAULT_TIMEOUT_MS[provider];
  return Math.max(taskTimeout, PROVIDER_MIN_TIMEOUT_MS[provider]);
}

/** Public helper: what model would this task+provider resolve to? (used by callers that want to know). */
export function getModelForTask(task: LLMTask, provider?: LLMProvider): string {
  const normalized = normalizeTask(task);
  const resolvedProvider = provider ?? TASK_ASSIGNMENT[normalized].provider;
  return resolveModelForTask(resolvedProvider, normalized);
}

export interface LLMRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
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
  const completion = await withRetry(
    () => client.chat.completions.create({
      model,
      messages: request.messages as any,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 4000,
      response_format: request.jsonMode ? { type: "json_object" } as any : undefined,
    }),
    `${provider}/${model}`,
  );

  const content = (completion as any).choices?.[0]?.message?.content || "";
  const tokensInput = (completion as any).usage?.prompt_tokens || 0;
  const tokensOutput = (completion as any).usage?.completion_tokens || 0;
  // GLM/z.ai reports prefix-cache hits here when the request prefix matched a prior call
  const cachedInputTokens = (completion as any).usage?.prompt_tokens_details?.cached_tokens || 0;

  return {
    content,
    provider,
    model,
    family: PROVIDER_FAMILY[provider],
    tokensInput,
    tokensOutput,
    cachedInputTokens: cachedInputTokens > 0 ? cachedInputTokens : undefined,
    costUsd: calculateCost(provider, model, tokensInput, tokensOutput, cachedInputTokens || undefined),
    cached: false,
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
  
  const completion = await withRetry<Anthropic.Message>(
    () => client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 4000,
      temperature: request.temperature ?? 0.2,
      system: systemMessage,
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    }),
    `Anthropic/${model}`
  );
  
  const content = completion.content[0]?.type === "text" ? completion.content[0].text : "";
  const tokensInput = completion.usage.input_tokens;
  const tokensOutput = completion.usage.output_tokens;
  
  return {
    content,
    provider: "anthropic",
    model,
    family: "anthropic",
    tokensInput,
    tokensOutput,
    costUsd: calculateCost("anthropic", model, tokensInput, tokensOutput),
    cached: false,
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
  if (!isCircuitOpen(primaryProvider)) orderedProviders.push(primaryProvider);
  for (const family of CROSS_FAMILY_FALLBACK[primaryFamily]) {
    const p = FAMILY_PROVIDER[family];
    if (!orderedProviders.includes(p) && getClientForProvider(p) && !isCircuitOpen(p)) {
      orderedProviders.push(p);
    }
  }
  // If all circuits open, still try primary (half-open retry)
  if (orderedProviders.length === 0) orderedProviders.push(primaryProvider);

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

      recordProviderSuccess(provider);

      const duration = Date.now() - startTime;
      const cacheNote = response.cachedInputTokens ? ` (${response.cachedInputTokens} cache-hit)` : "";
      console.log(
        `✅ ${provider}/${response.model} [${task}] | ${duration}ms | ${response.tokensInput}+${response.tokensOutput} tok${cacheNote} | $${response.costUsd.toFixed(4)}`
      );

      // Cache successful response (fire-and-forget)
      if (cacheKey) {
        cacheLLMResponse(cacheKey, response.model, response).catch(() => {});
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      recordProviderFailure(provider);
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

  const stream = await client.chat.completions.create({
    model,
    messages: request.messages as any,
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 4000,
    stream: true,
  });
  
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
  return providers;
}

/**
 * Health check for all four providers.
 */
export async function checkLLMHealth(): Promise<Record<LLMProvider, boolean>> {
  const health: Record<LLMProvider, boolean> = { deepseek: false, glm: false, openai: false, anthropic: false };

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
        model: "claude-3-haiku-20240307",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      health.anthropic = true;
    }
  } catch (err) {
    console.error("Anthropic health check failed:", err);
  }
  
  return health;
}

/** Get the LLMFamily for a completed response — pass this to producerFamily on subsequent verification calls. */
export function getResponseFamily(response: LLMResponse): LLMFamily {
  return response.family;
}
