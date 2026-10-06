/**
 * Production-grade HTTP client with:
 * - Configurable timeout
 * - Exponential backoff retry
 * - Per-provider rate limiting
 * - Request/response logging
 * - Graceful error handling
 */

import { env } from './env';
import pLimit from 'p-limit';
import { getExecutionSignal, consumeExecutionBudget, consumeRootBudget } from './worker/execution-scope';

// NOTE: do NOT install a custom global dispatcher (e.g. setGlobalDispatcher(
// new Agent({allowH2:false}))). The npm undici Agent bridges into Node's
// INTERNAL undici fetch via the legacy dispatcher symbol — a cross-version
// dispatch that rejects POSTs carrying an explicit content-length
// ("invalid content-length header" → OpenAI SDK "Connection error" against
// Groq/NVIDIA, observed live). The default dispatcher is already HTTP/1.1
// (allowH2 is opt-in), so the guard removed nothing anyway.

// ================================
// GLOBAL IN-FLIGHT BOUND
// ================================

// The scout fan-out pushes ~300 provider calls through a single
// Promise.allSettled with no backpressure — every socket, TLS handshake and
// response buffer lands at once. That burst correlates with container kills.
// A process-wide semaphore bounds simultaneous in-flight requests while
// keeping the queue order-agnostic (all callers share one pool).
const HTTP_MAX_INFLIGHT = Number(process.env.HTTP_MAX_INFLIGHT ?? 24);
if (!Number.isInteger(HTTP_MAX_INFLIGHT) || HTTP_MAX_INFLIGHT < 1 || HTTP_MAX_INFLIGHT > 32) {
  throw new Error('HTTP_MAX_INFLIGHT must be an integer between 1 and 32');
}
const httpInflight = pLimit(HTTP_MAX_INFLIGHT);
const HTTP_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

// ── Per-execution request budgets ─────────────────────────────────────────
// Concurrency caps bound the burst; these bound the VOLUME. A job can never
// issue more real HTTP attempts than these ceilings — retries included.
// Keyed by upstream host (the unit quota is billed on), not provider label:
// 30+ institutional providers all consume the 'openalex' budget.
// Env overrides: HTTP_BUDGET_OPENALEX, HTTP_BUDGET_CROSSREF, ...
// HTTP_MAX_REQUESTS_PER_EXECUTION bounds TOTAL requests (any host) per job.
const HTTP_BUDGET_DEFAULT = Number(process.env.HTTP_BUDGET_DEFAULT ?? 400);
const HTTP_MAX_REQUESTS_PER_EXECUTION = Number(process.env.HTTP_MAX_REQUESTS_PER_EXECUTION ?? 8000);
const HTTP_BUDGET_OVERRIDES: Record<string, number> = {
  // OpenAlex proxies ~8 institutional providers (ROR lookups) × ~12 query
  // variations × retries — a single scout legitimately needs several hundred.
  // Free polite-pool API; the 5-concurrency limiter already throttles courtesy.
  openalex: Number(process.env.HTTP_BUDGET_OPENALEX ?? 800),
  semanticscholar: Number(process.env.HTTP_BUDGET_SEMANTICSCHOLAR ?? 300),
  crossref: Number(process.env.HTTP_BUDGET_CROSSREF ?? 300),
};

// ── Root (job-level) bounds ────────────────────────────────────────────────
// Deep-planner nodes / reader sources run in CHILD execution scopes with fresh
// per-scope ledgers — without a root bound, N scopes could burn N× the caps.
// Every request charges BOTH its scope ledger (fairness between nodes) and the
// root ledger (runaway bound). Defaults: root = 4× scope per upstream.
const HTTP_MAX_REQUESTS_PER_JOB = Number(process.env.HTTP_MAX_REQUESTS_PER_JOB ?? 16000);
const HTTP_ROOT_BUDGET_MULTIPLIER = Number(process.env.HTTP_ROOT_BUDGET_MULTIPLIER ?? 4);
const HTTP_ROOT_BUDGET_OVERRIDES: Record<string, number> = {
  openalex: Number(process.env.HTTP_ROOT_BUDGET_OPENALEX ?? 3200),
  semanticscholar: Number(process.env.HTTP_ROOT_BUDGET_SEMANTICSCHOLAR ?? 1200),
  crossref: Number(process.env.HTTP_ROOT_BUDGET_CROSSREF ?? 1200),
};

function requestBudgetFor(key: string): number {
  return HTTP_BUDGET_OVERRIDES[key] ?? HTTP_BUDGET_DEFAULT;
}

function rootBudgetFor(key: string): number {
  return HTTP_ROOT_BUDGET_OVERRIDES[key] ?? Math.ceil(requestBudgetFor(key) * HTTP_ROOT_BUDGET_MULTIPLIER);
}

function budgetExhausted(message: string): never {
  const err = new HttpError(message, 0);
  err.code = 'HTTP_BUDGET_EXHAUSTED';
  throw err;
}

function consumeHttpBudget(rateLimiterKey?: string): void {
  if (!consumeExecutionBudget('http:all', HTTP_MAX_REQUESTS_PER_EXECUTION)
    || !consumeRootBudget('root:http:all', HTTP_MAX_REQUESTS_PER_JOB)) {
    budgetExhausted('HTTP request budget exhausted for this execution');
  }
  if (rateLimiterKey
    && (!consumeExecutionBudget(`http:${rateLimiterKey}`, requestBudgetFor(rateLimiterKey))
      || !consumeRootBudget(`root:http:${rateLimiterKey}`, rootBudgetFor(rateLimiterKey)))) {
    budgetExhausted(`Request budget exhausted for upstream ${rateLimiterKey}`);
  }
}

export function getHttpInflightStats() {
  return { active: httpInflight.activeCount, pending: httpInflight.pendingCount, cap: HTTP_MAX_INFLIGHT };
}

// ================================
// TYPES
// ================================

export interface HttpOptions {
  signal?: AbortSignal;
  timeout?: number; // ms
  retries?: number;
  retryDelay?: number; // ms
  headers?: Record<string, string>;
  rateLimit?: RateLimitConfig;
  rateLimiterKey?: string; // Key into global rate limiter registry — re-acquires on retry
  responseType?: "json" | "text"; // Type de réponse attendue
  cache?: boolean; // default true for httpGet — set false for freshness-critical calls
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize?: number;
}

// ================================
// RATE LIMITER
// ================================

class RateLimiter {
  private queue: Array<() => void> = [];
  private tokens: number;
  private lastRefill: number;
  private readonly requestsPerSecond: number;
  private readonly burstSize: number;

  constructor(config: RateLimitConfig) {
    this.requestsPerSecond = config.requestsPerSecond;
    this.burstSize = config.burstSize ?? config.requestsPerSecond;
    this.tokens = this.burstSize;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.requestsPerSecond;
    this.tokens = Math.min(this.burstSize, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    // Loop until a token is actually available — prevents thundering herd:
    // N concurrent waiters must NOT all proceed after a single wait period.
    while (true) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Wait for next token, then RE-CHECK (another waiter may have taken it)
      const waitTime = (1 - this.tokens) / this.requestsPerSecond * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.max(waitTime, 25)));
    }
  }
}

// ================================
// RATE LIMITER REGISTRY
// ================================

const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(provider: string): RateLimiter | null {
  return rateLimiters.get(provider) ?? null;
}

export function setRateLimiter(provider: string, config: RateLimitConfig) {
  rateLimiters.set(provider, new RateLimiter(config));
}

// ================================
// CIRCUIT BREAKER (V4 — Redis-backed, distributed)
// ================================
// When a provider returns repeated 429s, trip the circuit breaker.
// All subsequent requests to that provider fail-fast (return []) for a cooldown period.
// State is persisted to Redis so it survives restarts and is shared across instances.
// Falls back to in-memory if Redis is unavailable.

interface CircuitBreakerState {
  consecutive429s: number;
  tripped: boolean;
  trippedAt: number;       // timestamp when tripped
  cooldownMs: number;      // how long to skip requests
  totalTrips: number;      // lifetime counter
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
const CB_REDIS_KEY = (p: string) => `nomosx:cb:http:${p}`;
const CB_REDIS_TTL_SEC = 300; // 5 min TTL — longer than any cooldown

// Thresholds per provider
const CB_THRESHOLDS: Record<string, { max429s: number; cooldownMs: number }> = {
  'openalex': { max429s: 3, cooldownMs: 10_000 },      // 3× 429 → skip for 10s (polite pool recovers fast)
  'semanticscholar': { max429s: 1, cooldownMs: 120_000 }, // 1× 429 → skip for 2min (S2 is aggressive)
  'semantic-scholar-graph': { max429s: 1, cooldownMs: 120_000 },
  'arxiv': { max429s: 2, cooldownMs: 15_000 },          // 2× 429 → skip for 15s
  'google-books': { max429s: 1, cooldownMs: 60_000 },   // 1× 429 → skip for 60s
  // ── V4.1: the dry-run showed gdelt-news retry-storming for 150s without ever
  // tripping — it had no threshold. Breakers for every provider observed
  // rate-limiting in live runs, plus the rest of the metered/volatile set.
  'gdelt-news': { max429s: 2, cooldownMs: 45_000 },
  'gdelt-independent': { max429s: 2, cooldownMs: 45_000 },
  'tavily': { max429s: 2, cooldownMs: 60_000 },
  'exa': { max429s: 1, cooldownMs: 120_000 },           // 402/432 = quota dead for the session anyway
  'linkup': { max429s: 2, cooldownMs: 60_000 },
  'crossref': { max429s: 3, cooldownMs: 30_000 },
  'jstor': { max429s: 2, cooldownMs: 60_000 },
  'core': { max429s: 2, cooldownMs: 60_000 },
  'base': { max429s: 3, cooldownMs: 30_000 },
  'pubmed': { max429s: 3, cooldownMs: 30_000 },
  'europepmc': { max429s: 3, cooldownMs: 30_000 },
  'gnews': { max429s: 1, cooldownMs: 60_000 },
  'newsapi': { max429s: 2, cooldownMs: 60_000 },
  'eventregistry': { max429s: 2, cooldownMs: 60_000 },
  'mediastack': { max429s: 2, cooldownMs: 60_000 },
  'thenewsapi': { max429s: 2, cooldownMs: 60_000 },
  'apitube': { max429s: 2, cooldownMs: 60_000 },
  'imf': { max429s: 2, cooldownMs: 60_000 },
  'worldbank': { max429s: 3, cooldownMs: 30_000 },
  'unhcr': { max429s: 2, cooldownMs: 60_000 },
  'internet-archive': { max429s: 2, cooldownMs: 45_000 },
  'hathitrust': { max429s: 2, cooldownMs: 60_000 },
  'searxng': { max429s: 1, cooldownMs: 30_000 },        // rotates instances anyway; trip fast
  'datacommons': { max429s: 2, cooldownMs: 60_000 },
};

/**
 * Load circuit breaker state from Redis (if available), falling back to in-memory.
 */
async function loadCBState(provider: string): Promise<CircuitBreakerState | null> {
  // Fast path: in-memory hit
  const mem = circuitBreakers.get(provider);
  if (mem && mem.tripped && Date.now() - mem.trippedAt < mem.cooldownMs) {
    return mem; // Still tripped in memory — skip Redis round-trip
  }
  // Try Redis for cross-instance state
  try {
    const { simpleRedisManager } = await import('./agent/redis-simple');
    if (simpleRedisManager.isRedisConnected()) {
      const remote = await simpleRedisManager.get<CircuitBreakerState>(CB_REDIS_KEY(provider));
      if (remote) {
        // Merge: take the worse state (higher 429s, or tripped)
        if (remote.tripped && (!mem || !mem.tripped)) {
          circuitBreakers.set(provider, remote);
          return remote;
        }
      }
    }
  } catch { /* Redis unavailable — use in-memory */ }
  return mem ?? null;
}

/**
 * Save circuit breaker state to Redis (if available) + in-memory.
 */
async function saveCBState(provider: string, cb: CircuitBreakerState): Promise<void> {
  circuitBreakers.set(provider, cb);
  try {
    const { simpleRedisManager } = await import('./agent/redis-simple');
    if (simpleRedisManager.isRedisConnected()) {
      await simpleRedisManager.setWithTTL(CB_REDIS_KEY(provider), cb, CB_REDIS_TTL_SEC);
    }
  } catch { /* Redis unavailable — in-memory only */ }
}

/**
 * Check if a provider's circuit breaker is tripped.
 * If tripped but cooldown expired, auto-reset.
 * Sync version — uses in-memory state only (fast path).
 */
export function isCircuitBreakerTripped(provider: string): boolean {
  const cb = circuitBreakers.get(provider);
  if (!cb || !cb.tripped) return false;
  // Auto-reset after cooldown
  if (Date.now() - cb.trippedAt > cb.cooldownMs) {
    cb.tripped = false;
    cb.consecutive429s = 0;
    return false;
  }
  return true;
}

/**
 * Async version — checks Redis for cross-instance circuit breaker state.
 * Use this when you can afford an async check (e.g., before starting a batch).
 */
export async function isCircuitBreakerTrippedAsync(provider: string): Promise<boolean> {
  const cb = await loadCBState(provider);
  if (!cb || !cb.tripped) return false;
  if (Date.now() - cb.trippedAt > cb.cooldownMs) {
    await saveCBState(provider, { ...cb, tripped: false, consecutive429s: 0 });
    return false;
  }
  return true;
}

/**
 * Record a 429 for a provider. Trips the circuit breaker if threshold reached.
 * Persists state to Redis for cross-instance awareness.
 */
async function record429(provider: string): Promise<void> {
  const threshold = CB_THRESHOLDS[provider];
  if (!threshold) return; // no circuit breaker for this provider

  const existing = circuitBreakers.get(provider);
  const cb: CircuitBreakerState = existing ?? {
    consecutive429s: 0, tripped: false, trippedAt: 0, cooldownMs: threshold.cooldownMs, totalTrips: 0
  };

  cb.consecutive429s++;
  if (cb.consecutive429s >= threshold.max429s && !cb.tripped) {
    cb.tripped = true;
    cb.trippedAt = Date.now();
    cb.totalTrips++;
    // Escalating cooldown: a provider that keeps failing after cooldown is
    // quota-dead, not rate-limited — probing every 2min forever just burns
    // requests. ×2 per repeat trip, capped at 8× the base cooldown.
    cb.cooldownMs = threshold.cooldownMs * Math.min(2 ** (cb.totalTrips - 1), 8);
    console.warn(`[CIRCUIT BREAKER] ${provider} tripped after ${cb.consecutive429s}× 429 — skipping for ${cb.cooldownMs / 1000}s (trip #${cb.totalTrips})`);
  }

  await saveCBState(provider, cb);
}

/**
 * V4.2: Network-failure circuit breaking — timeouts, DNS failures and 5xx
 * never hit record429, so a dead host could retry-storm indefinitely (gdelt
 * burned ~150s of a dry-run this way). One exhausted call = one failure tick;
 * trips at max429s×2 consecutive dead calls (more tolerant than rate limits —
 * a single timeout is common, a dead provider fails every call).
 */
async function recordNetFail(provider: string): Promise<void> {
  const threshold = CB_THRESHOLDS[provider];
  if (!threshold) return;

  const existing = circuitBreakers.get(provider);
  const cb: CircuitBreakerState = existing ?? {
    consecutive429s: 0, tripped: false, trippedAt: 0, cooldownMs: threshold.cooldownMs, totalTrips: 0
  };

  cb.consecutive429s++;
  const netThreshold = threshold.max429s * 2;
  if (cb.consecutive429s >= netThreshold && !cb.tripped) {
    cb.tripped = true;
    cb.trippedAt = Date.now();
    cb.totalTrips++;
    cb.cooldownMs = threshold.cooldownMs * Math.min(2 ** (cb.totalTrips - 1), 8);
    console.warn(`[CIRCUIT BREAKER] ${provider} tripped after ${cb.consecutive429s} consecutive dead calls — skipping for ${cb.cooldownMs / 1000}s (trip #${cb.totalTrips})`);
  }

  await saveCBState(provider, cb);
}

/**
 * Reset a provider's circuit breaker (e.g., after a successful request).
 */
async function resetCircuitBreaker(provider: string): Promise<void> {
  const cb = circuitBreakers.get(provider);
  if (cb) {
    cb.consecutive429s = 0;
    await saveCBState(provider, cb);
  }
}

/**
 * Get circuit breaker stats for monitoring.
 */
export function getCircuitBreakerStats(): Record<string, any> {
  const stats: Record<string, any> = {};
  for (const [provider, cb] of circuitBreakers) {
    stats[provider] = {
      tripped: cb.tripped,
      consecutive429s: cb.consecutive429s,
      totalTrips: cb.totalTrips,
      cooldownRemaining: cb.tripped ? Math.max(0, cb.cooldownMs - (Date.now() - cb.trippedAt)) : 0,
    };
  }
  return stats;
}

// Default rate limits for known providers
// OpenAlex: premium api_key = 10 req/s guaranteed; polite pool = ~2 req/s (conservative)
// V3.1: If API key credits are exhausted, polite pool is much slower.
setRateLimiter("openalex", process.env.OPENALEX_API_KEY
  ? { requestsPerSecond: 10, burstSize: 20 }
  : { requestsPerSecond: 2, burstSize: 3 }); // Polite pool: 2 req/s, small burst
setRateLimiter("crossref", { requestsPerSecond: 8, burstSize: 8 }); // Crossref polite pool (with mailto): 10 req/s — conservative 8
setRateLimiter("semanticscholar", { requestsPerSecond: 1, burstSize: 1 }); // Strict 1 req/s — no burst, S2 rate limits are aggressive
setRateLimiter("unpaywall", { requestsPerSecond: 10, burstSize: 20 });
setRateLimiter("ror", { requestsPerSecond: 10, burstSize: 20 });
setRateLimiter("orcid", { requestsPerSecond: 10, burstSize: 20 });
setRateLimiter("eurostat", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("ecb", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("fred", { requestsPerSecond: 5, burstSize: 10 }); // FRED API: 120 req/min
setRateLimiter("insee", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("melodi", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("arxiv", { requestsPerSecond: 3, burstSize: 5 }); // NCBI guidelines
setRateLimiter("hal", { requestsPerSecond: 10, burstSize: 20 });
setRateLimiter("pubmed", { requestsPerSecond: 3, burstSize: 5 }); // NCBI guidelines
setRateLimiter("base", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("isidore", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("eric", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("fao", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("unodc", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("philpapers", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("persee", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("openaire", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("zenodo", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("psychology", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("sociology", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("history", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("geography", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("chemistry", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("biology", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("political-science", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("business", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("dblp", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("zbmath", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("gdelt-news", { requestsPerSecond: 0.5, burstSize: 1 }); // GDELT is very strict — 1 req per 2s
setRateLimiter("google-books", { requestsPerSecond: 1, burstSize: 1 }); // Google Books 429s easily
setRateLimiter("springer", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("osti", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("doaj", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("plos", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("federal-register", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("sec-edgar", { requestsPerSecond: 5, burstSize: 8 }); // SEC allows 10 req/s
setRateLimiter("worldbank-docs", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("cordis", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("brookings", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("rand", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("cnas", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("ecfr", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("swp", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("sipri", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("france-strategie", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("allen-ai", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("max-planck", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("harvard-dash", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("mit-dspace", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("openreview", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("biorxiv", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("papers-with-code", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("jstor", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("unesco", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("ipcc", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("internet-archive", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("hathitrust", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("club-of-rome", { requestsPerSecond: 1, burstSize: 2 });
setRateLimiter("millennium-project", { requestsPerSecond: 1, burstSize: 2 });
setRateLimiter("inria", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("eth-zurich", { requestsPerSecond: 2, burstSize: 3 });
setRateLimiter("datacite", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("newsapi", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("mediastack", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("thenewsapi", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("gnews", { requestsPerSecond: 1, burstSize: 2 });
setRateLimiter("eventregistry", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("apitube", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("rss", { requestsPerSecond: 10, burstSize: 15 }); // RSS feeds — generous, most feeds have no rate limit

// ─── Realtime Data Hub providers ────────────────────────────────────────────
setRateLimiter("gdelt", { requestsPerSecond: 1, burstSize: 2 }); // GDELT GKG/doc API
setRateLimiter("worldbank", { requestsPerSecond: 5, burstSize: 10 }); // World Bank API: generous
setRateLimiter("who", { requestsPerSecond: 3, burstSize: 5 }); // WHO RSS + API
setRateLimiter("usgs", { requestsPerSecond: 5, burstSize: 10 }); // USGS Earthquake API
setRateLimiter("open-meteo", { requestsPerSecond: 10, burstSize: 20 }); // Open-Meteo: free, generous
setRateLimiter("nvd", { requestsPerSecond: 2, burstSize: 3 }); // NVD: strict rate limits
setRateLimiter("eurlex", { requestsPerSecond: 3, burstSize: 5 }); // EUR-Lex RSS
setRateLimiter("nasa-giss", { requestsPerSecond: 2, burstSize: 3 }); // NASA GISS CSV
setRateLimiter("paperswithcode", { requestsPerSecond: 2, burstSize: 3 }); // Papers With Code

// ─── Quant Agent providers ───────────────────────────────────────────────────
setRateLimiter("energy-charts", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("rte-france", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("treasury-fiscal", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("energi-data", { requestsPerSecond: 3, burstSize: 5 });

// ─── Social providers ────────────────────────────────────────────────────────
setRateLimiter("bluesky", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("hackernews", { requestsPerSecond: 3, burstSize: 5 }); // Algolia HN API
setRateLimiter("reddit", { requestsPerSecond: 1, burstSize: 2 }); // Reddit: strict OAuth rate limits

// ─── Other providers ─────────────────────────────────────────────────────────
setRateLimiter("altmetric", { requestsPerSecond: 3, burstSize: 5 });
setRateLimiter("overton", { requestsPerSecond: 2, burstSize: 3 }); // Overton: policy docs
setRateLimiter("opencitations", { requestsPerSecond: 3, burstSize: 5 }); // OpenCitations: free citation graph
setRateLimiter("newsdata", { requestsPerSecond: 1, burstSize: 2 }); // NewsData.io: free tier 200 credits/day
setRateLimiter("hf-papers", { requestsPerSecond: 2, burstSize: 3 }); // HuggingFace Papers: free, CDN-cached
setRateLimiter("data-europa", { requestsPerSecond: 3, burstSize: 5 }); // data.europa.eu: EU open data portal
setRateLimiter("ietf", { requestsPerSecond: 2, burstSize: 3 }); // IETF Datatracker: Django REST API
setRateLimiter("wanfang", { requestsPerSecond: 2, burstSize: 3 }); // Wanfang: Chinese academic DB
setRateLimiter("resend", { requestsPerSecond: 5, burstSize: 10 }); // Resend email API
setRateLimiter("twitter", { requestsPerSecond: 1, burstSize: 2 }); // Twitter v2: strict rate limits
setRateLimiter("openai-image", { requestsPerSecond: 1, burstSize: 2 }); // OpenAI Image API
setRateLimiter("sendgrid", { requestsPerSecond: 5, burstSize: 10 }); // SendGrid email API
setRateLimiter("posthog", { requestsPerSecond: 10, burstSize: 20 }); // PostHog analytics

// ================================
// HTTP CLIENT
// ================================

export class HttpError extends Error {
  public code?: string;
  constructor(
    message: string,
    public status?: number,
    public response?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Add jitter to backoff delay to prevent retry storms.
 * Pattern: delay * (0.75 + Math.random() * 0.5) → 75%-125% of base delay.
 */
function withJitter(delay: number): number {
  return Math.round(delay * (0.75 + Math.random() * 0.5));
}

export async function readBoundedText(
  response: Response,
  maxBytes = HTTP_MAX_RESPONSE_BYTES,
  signal?: AbortSignal,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid response byte limit');
  if (Number(response.headers.get('content-length')) > maxBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw new HttpError('Response exceeds byte limit', 413);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal?.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes || chunks.length >= 8192) throw new HttpError('Response exceeds byte or chunk limit', 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
  try {
    signal.throwIfAborted();
    const response = await fetch(url, { ...init, signal });
    const text = await readBoundedText(response, HTTP_MAX_RESPONSE_BYTES, signal);
    const noBody = [204, 205, 304].includes(response.status);
    return new Response(noBody ? null : text, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } catch (error: any) {
    if (controller.signal.aborted || (error.name === 'AbortError' && !init.signal?.aborted)) {
      throw new HttpError(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Short-TTL GET cache + in-flight dedupe. The scout fans out per query
// variation and multiple waves/nodes re-issue byte-identical provider
// queries (observed: 12× the same OpenAlex search in one run). Responses
// are shared by promise so concurrent duplicates join the same request.
// Keyed on url + responseType + headers (auth-bearing calls stay distinct).
const GET_CACHE_TTL_MS = 10 * 60 * 1000;
const GET_CACHE_MAX = 4000;
// Per-value ceiling: 4000 × 8MB responses could OOM a small container.
// Provider JSON is typically <500KB; anything larger isn't worth retaining.
const GET_CACHE_MAX_VALUE_BYTES = 1024 * 1024;
interface GetCacheEntry { promise: Promise<any>; expires: number }
const getCache = new Map<string, GetCacheEntry>();
let getCacheHits = 0;

export function getHttpCacheStats() {
  return { entries: getCache.size, hits: getCacheHits };
}

export async function httpGet<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  const parent = getExecutionSignal();
  const signal = parent && options.signal ? AbortSignal.any([parent, options.signal]) : parent ?? options.signal;
  signal?.throwIfAborted();

  const cacheable = options.cache !== false && process.env.HTTP_GET_CACHE !== "0";
  const key = cacheable
    ? `${url}|${options.responseType ?? "json"}|${JSON.stringify(options.headers ?? {})}`
    : "";
  if (cacheable) {
    const hit = getCache.get(key);
    if (hit && hit.expires > Date.now()) {
      getCacheHits++;
      // Clone on hit: callers receive a private copy — a mutating consumer
      // must not corrupt the shared cached payload for later callers.
      return hit.promise.then(v =>
        (v !== null && typeof v === "object" ? structuredClone(v) : v) as T
      );
    }
    getCache.delete(key);
  }

  const promise = httpInflight(() => {
    signal?.throwIfAborted();
    return httpGetImpl<T>(url, { ...options, signal });
  });

  if (cacheable) {
    if (getCache.size >= GET_CACHE_MAX) getCache.clear();
    // Store a clone so the first caller's mutations can't corrupt the cache.
    const stored = promise.then(v =>
      v !== null && typeof v === "object" ? structuredClone(v) : v
    );
    getCache.set(key, { promise: stored, expires: Date.now() + GET_CACHE_TTL_MS });
    // Self-evict oversized payloads once resolved — one stringify per unique
    // URL is cheap against the wire call it replaces.
    stored.then(v => {
      const size = typeof v === "string" ? v.length : JSON.stringify(v)?.length ?? 0;
      if (size > GET_CACHE_MAX_VALUE_BYTES) getCache.delete(key);
    }).catch(() => {});
    stored.catch(() => getCache.delete(key)); // don't cache failures
  }
  return promise;
}

async function httpGetImpl<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  const {
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
    headers = {},
    rateLimit,
    rateLimiterKey,
    responseType = "json",
  } = options;

  // V3.1: Circuit breaker — fail-fast if provider is tripped
  if (rateLimiterKey && isCircuitBreakerTripped(rateLimiterKey)) {
    const cb = circuitBreakers.get(rateLimiterKey);
    const remaining = cb ? Math.ceil((cb.cooldownMs - (Date.now() - cb.trippedAt)) / 1000) : 0;
    throw new HttpError(
      `Circuit breaker tripped for ${rateLimiterKey} (${remaining}s remaining)`,
      429,
      'CIRCUIT_BREAKER_TRIPPED'
    );
  }

  // Acquire shared rate limiter (re-acquired on retry via rateLimiterKey)
  async function acquireLimiter() {
    if (rateLimiterKey) {
      const limiter = getRateLimiter(rateLimiterKey);
      if (limiter) await limiter.acquire();
    } else if (rateLimit) {
      const limiter = new RateLimiter(rateLimit);
      await limiter.acquire();
    }
  }

  await acquireLimiter();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // V3.1: Check circuit breaker before each attempt
    if (rateLimiterKey && isCircuitBreakerTripped(rateLimiterKey)) {
      throw new HttpError(
        `Circuit breaker tripped for ${rateLimiterKey}`,
        429,
        'CIRCUIT_BREAKER_TRIPPED'
      );
    }
    // Every real attempt consumes budget — retries can't evade the cap.
    consumeHttpBudget(rateLimiterKey);
    if (attempt > 0) await acquireLimiter(); // Re-acquire on retry
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "GET",
          signal: options.signal,
          headers: {
            Accept: "application/json",
            "User-Agent": "NomosX/1.0 (Academic Research Tool)",
            ...headers,
          },
        },
        timeout
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        
        // Don't retry on client errors (4xx except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new HttpError(
            `HTTP ${response.status} ${response.statusText}`,
            response.status,
            text.slice(0, 500)
          );
        }

        // Retry on server errors (5xx) and rate limits (429)
        if (attempt < retries) {
          let backoff = withJitter(retryDelay * Math.pow(2, attempt));
          if (response.status === 429) {
            // Honour Retry-After header if present.
            // Some APIs (OpenAlex) send a Unix timestamp instead of duration — detect and convert.
            const retryAfterRaw = response.headers.get('Retry-After');
            let retryAfterMs = 0;
            if (retryAfterRaw) {
              const parsed = parseFloat(retryAfterRaw);
              if (parsed > 1_000_000_000) {
                // Unix timestamp: convert to relative duration, cap at 30s for OpenAlex, 120s others
                const cap = url.includes('openalex.org') ? 30000 : 120000;
                retryAfterMs = Math.min((parsed - Date.now() / 1000) * 1000, cap);
              } else {
                const cap = url.includes('openalex.org') ? 15000 : 120000;
                retryAfterMs = Math.min(parsed * 1000, cap);
              }
            }
            // A provider asking us to wait >20s is effectively down for scout
            // purposes — fail fast instead of stalling the whole fan-out
            // (Wikisource ~59-60s, OpenAlex ~30s — honoring them per-request
            // burns minutes across hundreds of calls).
            if (retryAfterMs > 20000) {
              throw new HttpError(`HTTP 429 ${response.statusText} (Retry-After ${Math.round(retryAfterMs / 1000)}s exceeds cap)`, 429, text.slice(0, 500));
            }
            // SemanticScholar: no Retry-After = rate-limited → fail-fast, don't waste retries
            if (url.includes('semanticscholar.org') && !retryAfterRaw) {
              throw new HttpError(`HTTP 429 ${response.statusText}`, 429, text.slice(0, 500));
            }
            // V4: Record 429 for circuit breaker (async — persists to Redis)
            if (response.status === 429 && rateLimiterKey) {
              await record429(rateLimiterKey);
              // V4: Adaptive rate limiting — reduce rate on 429
              try {
                const { recordAdaptive429 } = await import('./agent/resilience');
                recordAdaptive429(rateLimiterKey);
              } catch { /* non-blocking */ }
              // If circuit breaker just tripped, fail-fast
              if (isCircuitBreakerTripped(rateLimiterKey)) {
                throw new HttpError(`Circuit breaker tripped for ${rateLimiterKey}`, 429, 'CIRCUIT_BREAKER_TRIPPED');
              }
            }
            // V3.1: Detect exhausted OpenAlex API key credits → switch to polite pool
            if (response.status === 429 && url.includes('openalex.org')) {
              const remaining = response.headers.get('x-ratelimit-remaining');
              if (remaining === '0') {
                // Credits exhausted — dynamically import and mark
                try {
                  const { markOpenAlexKeyExhausted } = await import('./providers/openalex');
                  markOpenAlexKeyExhausted();
                } catch { /* non-blocking */ }
                // Don't retry with the exhausted key — fail-fast, next call will use mailto
                throw new HttpError(`OpenAlex API key credits exhausted`, 429, 'KEY_EXHAUSTED');
              }
            }
            // OpenAlex: allow 1 retry with short backoff (polite pool recovers fast)
            if (url.includes('openalex.org') && !retryAfterRaw) {
              backoff = 3000; // 3s cooldown — much shorter than before
            }
            // OpenAlex: at least 3s; generic: at least 5s
            const minCooldown = url.includes('openalex.org') ? 3000 : 5000;
            backoff = Math.max(backoff, retryAfterMs, minCooldown);
          }
          if (env.NODE_ENV === "development") {
            console.warn(`[HTTP] Retry ${attempt + 1}/${retries} after ${backoff}ms: ${rateLimiterKey ?? 'request'}`);
          }
          await sleep(backoff);
          continue;
        }

        throw new HttpError(
          `HTTP ${response.status} ${response.statusText}`,
          response.status,
          text.slice(0, 500)
        );
      }

      // Parse response based on type
      const data = responseType === "text"
        ? await response.text()
        : await response.json();

      // V4: Reset circuit breaker on success (provider recovered)
      if (rateLimiterKey) {
        await resetCircuitBreaker(rateLimiterKey).catch(() => {});
        // V4: Adaptive rate limiting — increase rate on success
        try {
          const { recordAdaptiveSuccess } = await import('./agent/resilience');
          recordAdaptiveSuccess(rateLimiterKey);
        } catch { /* non-blocking */ }
      }
      return data as T;
    } catch (error: any) {
      options.signal?.throwIfAborted();
      lastError = error;

      if (error instanceof HttpError && error.status && error.status < 500) {
        throw error; // Don't retry client errors
      }

      if (attempt < retries) {
        const backoff = withJitter(retryDelay * Math.pow(2, attempt));
        if (env.NODE_ENV === "development") {
          console.warn(`[HTTP] Retry ${attempt + 1}/${retries} after ${backoff}ms: ${error.message}`);
        }
        await sleep(backoff);
        continue;
      }
    }
  }

  // V4.2: A call that exhausted retries on network errors/5xx counts toward the
  // breaker. Client errors (4xx ≠ 429) are structural — they don't indicate an
  // overloaded host and are rethrown earlier without reaching here.
  if (rateLimiterKey && lastError) {
    const isClientError = lastError instanceof HttpError &&
      typeof lastError.status === 'number' &&
      lastError.status >= 400 && lastError.status < 500;
    if (!isClientError) {
      await recordNetFail(rateLimiterKey).catch(() => {});
    }
  }

  throw lastError || new Error("HTTP request failed");
}

export async function httpPost<T = any>(
  url: string,
  body: any,
  options: HttpOptions = {}
): Promise<T> {
  const parent = getExecutionSignal();
  const signal = parent && options.signal ? AbortSignal.any([parent, options.signal]) : parent ?? options.signal;
  signal?.throwIfAborted();
  return httpInflight(() => {
    signal?.throwIfAborted();
    return httpPostImpl<T>(url, body, { ...options, signal });
  });
}

async function httpPostImpl<T = any>(
  url: string,
  body: any,
  options: HttpOptions = {}
): Promise<T> {
  const {
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
    headers = {},
    rateLimit,
    rateLimiterKey,
  } = options;

  async function acquireLimiter() {
    if (rateLimiterKey) {
      const limiter = getRateLimiter(rateLimiterKey);
      if (limiter) await limiter.acquire();
    } else if (rateLimit) {
      const limiter = new RateLimiter(rateLimit);
      await limiter.acquire();
    }
  }

  await acquireLimiter();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    consumeHttpBudget(rateLimiterKey);
    if (attempt > 0) await acquireLimiter();
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          signal: options.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "NomosX/1.0 (Academic Research Tool)",
            ...headers,
          },
          body: JSON.stringify(body),
        },
        timeout
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new HttpError(
            `HTTP ${response.status} ${response.statusText}`,
            response.status,
            text.slice(0, 500)
          );
        }

        if (attempt < retries) {
          let backoff = withJitter(retryDelay * Math.pow(2, attempt));
          if (response.status === 429) {
            const retryAfterRaw = response.headers.get('Retry-After');
            if (retryAfterRaw) {
              const parsed = parseFloat(retryAfterRaw);
              if (parsed > 1_000_000_000) {
                backoff = Math.min((parsed - Date.now() / 1000) * 1000, 120000);
              } else {
                backoff = Math.min(parsed * 1000, 120000);
              }
            }
            backoff = Math.max(backoff, 10000);
          }
          await sleep(backoff);
          continue;
        }

        throw new HttpError(
          `HTTP ${response.status} ${response.statusText}`,
          response.status,
          text.slice(0, 500)
        );
      }

      const data = await response.json();

      // V4: Reset circuit breaker on success (provider recovered)
      if (rateLimiterKey) {
        await resetCircuitBreaker(rateLimiterKey).catch(() => {});
        // V4: Adaptive rate limiting — increase rate on success
        try {
          const { recordAdaptiveSuccess } = await import('./agent/resilience');
          recordAdaptiveSuccess(rateLimiterKey);
        } catch { /* non-blocking */ }
      }

      return data as T;
    } catch (error: any) {
      options.signal?.throwIfAborted();
      lastError = error;

      if (error instanceof HttpError && error.status && error.status < 500) {
        throw error;
      }

      if (attempt < retries) {
        const backoff = withJitter(retryDelay * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }
    }
  }

  if (rateLimiterKey && lastError) {
    const isClientError = lastError instanceof HttpError &&
      typeof lastError.status === 'number' &&
      lastError.status >= 400 && lastError.status < 500;
    if (!isClientError) {
      await recordNetFail(rateLimiterKey).catch(() => {});
    }
  }

  throw lastError || new Error("HTTP request failed");
}

// ================================
// PROVIDER-SPECIFIC HELPERS
// ================================

export async function fetchFromProvider<T = any>(
  provider: string,
  url: string,
  options: Omit<HttpOptions, "rateLimit"> = {}
): Promise<T> {
  // Shared-upstream detection: many providers piggyback on the same API
  // (30+ institutional providers hit api.openalex.org). Rate-limit by the
  // ACTUAL upstream host, not the provider label, to avoid 429 cascades.
  let limiterKey = provider;
  if (url.includes("openalex.org")) limiterKey = "openalex";
  else if (url.includes("semanticscholar.org")) limiterKey = "semanticscholar";
  else if (url.includes("api.crossref.org")) limiterKey = "crossref";
  else if (url.includes("doaj.org")) limiterKey = "doaj";
  else if (url.includes("api.gdeltproject.org")) limiterKey = "gdelt-news";
  else if (url.includes("googleapis.com/books")) limiterKey = "google-books";
  else if (url.includes("api.springer.com")) limiterKey = "springer";
  else if (url.includes("api.osti.gov")) limiterKey = "osti";
  else if (url.includes("api.datacite.org")) limiterKey = "datacite";
  else if (url.includes("zenodo.org")) limiterKey = "zenodo";
  else if (url.includes("api.openaire.eu")) limiterKey = "openaire";
  else if (url.includes("api.plos.org")) limiterKey = "plos";
  else if (url.includes("www.federalregister.gov")) limiterKey = "federal-register";

  const limiter = getRateLimiter(limiterKey);

  // Central OpenAlex auth: inject api_key (premium credit) or mailto (polite pool)
  // on ALL openalex.org calls — piggybacking providers previously called anonymously.
  if (limiterKey === "openalex") {
    const oaKey = env.OPENALEX_API_KEY || process.env.OPENALEX_API_KEY;
    if (oaKey && !url.includes("api_key=")) {
      url += (url.includes("?") ? "&" : "?") + `api_key=${encodeURIComponent(oaKey)}`;
    } else if (!oaKey && !url.includes("mailto=")) {
      const mailto = process.env.OPENALEX_MAILTO || env.UNPAYWALL_EMAIL || "contact@nomosx.com";
      url += (url.includes("?") ? "&" : "?") + `mailto=${encodeURIComponent(mailto)}`;
    }
  }

  // Crossref polite pool: inject mailto parameter for 2x rate limit (5→10 req/s)
  if (limiterKey === "crossref" && !url.includes("mailto=")) {
    const mailto = process.env.CROSSREF_MAILTO || env.UNPAYWALL_EMAIL || "contact@nomosx.com";
    url += (url.includes("?") ? "&" : "?") + `mailto=${encodeURIComponent(mailto)}`;
  }

  // Add provider-specific headers
  const headers = { ...options.headers };
  
  // INSEE Melodi/BDM APIs require authentication (bearer token)
  if (provider === "insee" || provider === "melodi") {
    const token = env.INSEE_API_KEY || process.env.INSEE_API_KEY || process.env.INSEE_KEY;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      // Keep it as a warning (some endpoints may still work unauthenticated)
      console.warn(`[${provider.toUpperCase()}] No INSEE_API_KEY found in environment`);
    }
  }

  // Pass rateLimiterKey so httpGet re-acquires the shared limiter on retry
  // V4: Wrap in queuedProviderCall for backpressure control + dedup
  const httpCall = () => httpGet<T>(url, { ...options, headers, rateLimiterKey: limiter ? limiterKey : undefined });

  // Use the provider queue for concurrency control + dedup
  // Lazy import to avoid circular dependency
  try {
    const { queuedProviderCall } = await import('./agent/provider-queue');
    return queuedProviderCall(limiterKey, httpCall, {
      dedupKey: `http:${limiterKey}:${url}`,
    });
  } catch {
    // Queue module unavailable — direct call (graceful degradation)
    return httpCall();
  }
}
