/**
 * Production-grade HTTP client with:
 * - Configurable timeout
 * - Exponential backoff retry
 * - Per-provider rate limiting
 * - Request/response logging
 * - Graceful error handling
 */

import { env } from './env';

// ================================
// TYPES
// ================================

export interface HttpOptions {
  timeout?: number; // ms
  retries?: number;
  retryDelay?: number; // ms
  headers?: Record<string, string>;
  rateLimit?: RateLimitConfig;
  rateLimiterKey?: string; // Key into global rate limiter registry — re-acquires on retry
  responseType?: "json" | "text"; // Type de réponse attendue
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
// CIRCUIT BREAKER (V3.1 — Deep Search resilience)
// ================================
// When a provider returns repeated 429s, trip the circuit breaker.
// All subsequent requests to that provider fail-fast (return []) for a cooldown period.
// This prevents cascading rate-limit blocks from paralyzing the pipeline.

interface CircuitBreakerState {
  consecutive429s: number;
  tripped: boolean;
  trippedAt: number;       // timestamp when tripped
  cooldownMs: number;      // how long to skip requests
  totalTrips: number;      // lifetime counter
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

// Thresholds per provider
const CB_THRESHOLDS: Record<string, { max429s: number; cooldownMs: number }> = {
  'openalex': { max429s: 3, cooldownMs: 10_000 },      // 3× 429 → skip for 10s (polite pool recovers fast)
  'semanticscholar': { max429s: 1, cooldownMs: 120_000 }, // 1× 429 → skip for 2min (S2 is aggressive)
  'arxiv': { max429s: 2, cooldownMs: 15_000 },          // 2× 429 → skip for 15s
  'google-books': { max429s: 1, cooldownMs: 60_000 },   // 1× 429 → skip for 60s
};

/**
 * Check if a provider's circuit breaker is tripped.
 * If tripped but cooldown expired, auto-reset.
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
 * Record a 429 for a provider. Trips the circuit breaker if threshold reached.
 */
function record429(provider: string): void {
  const threshold = CB_THRESHOLDS[provider];
  if (!threshold) return; // no circuit breaker for this provider

  let cb = circuitBreakers.get(provider);
  if (!cb) {
    cb = { consecutive429s: 0, tripped: false, trippedAt: 0, cooldownMs: threshold.cooldownMs, totalTrips: 0 };
    circuitBreakers.set(provider, cb);
  }

  cb.consecutive429s++;
  if (cb.consecutive429s >= threshold.max429s && !cb.tripped) {
    cb.tripped = true;
    cb.trippedAt = Date.now();
    cb.totalTrips++;
    console.warn(`[CIRCUIT BREAKER] ${provider} tripped after ${cb.consecutive429s}× 429 — skipping for ${cb.cooldownMs / 1000}s`);
  }
}

/**
 * Reset a provider's circuit breaker (e.g., after a successful request).
 */
function resetCircuitBreaker(provider: string): void {
  const cb = circuitBreakers.get(provider);
  if (cb) cb.consecutive429s = 0;
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
setRateLimiter("crossref", { requestsPerSecond: 50, burstSize: 100 });
setRateLimiter("semanticscholar", { requestsPerSecond: 1, burstSize: 1 }); // Strict 1 req/s — no burst, S2 rate limits are aggressive
setRateLimiter("unpaywall", { requestsPerSecond: 10, burstSize: 20 });
setRateLimiter("ror", { requestsPerSecond: 10, burstSize: 20 });
setRateLimiter("orcid", { requestsPerSecond: 10, burstSize: 20 });
setRateLimiter("eurostat", { requestsPerSecond: 5, burstSize: 10 });
setRateLimiter("ecb", { requestsPerSecond: 5, burstSize: 10 });
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

// ================================
// HTTP CLIENT
// ================================

export class HttpError extends Error {
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new HttpError(`Request timeout after ${timeoutMs}ms`, undefined, url);
    }
    throw error;
  }
}

export async function httpGet<T = any>(
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
    if (attempt > 0) await acquireLimiter(); // Re-acquire on retry
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "GET",
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
          let backoff = retryDelay * Math.pow(2, attempt);
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
                const cap = url.includes('openalex.org') ? 30000 : 120000;
                retryAfterMs = Math.min(parsed * 1000, cap);
              }
            }
            // SemanticScholar: no Retry-After = rate-limited → fail-fast, don't waste retries
            if (url.includes('semanticscholar.org') && !retryAfterRaw) {
              throw new HttpError(`HTTP 429 ${response.statusText}`, 429, text.slice(0, 500));
            }
            // V3.1: Record 429 for circuit breaker
            if (response.status === 429 && rateLimiterKey) {
              record429(rateLimiterKey);
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
            console.warn(`[HTTP] Retry ${attempt + 1}/${retries} after ${backoff}ms: ${url}`);
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
      return data as T;
    } catch (error: any) {
      lastError = error;

      if (error instanceof HttpError && error.status && error.status < 500) {
        throw error; // Don't retry client errors
      }

      if (attempt < retries) {
        const backoff = retryDelay * Math.pow(2, attempt);
        if (env.NODE_ENV === "development") {
          console.warn(`[HTTP] Retry ${attempt + 1}/${retries} after ${backoff}ms: ${error.message}`);
        }
        await sleep(backoff);
        continue;
      }
    }
  }

  throw lastError || new Error("HTTP request failed");
}

export async function httpPost<T = any>(
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
    if (attempt > 0) await acquireLimiter();
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
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
          let backoff = retryDelay * Math.pow(2, attempt);
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
      return data as T;
    } catch (error: any) {
      lastError = error;

      if (error instanceof HttpError && error.status && error.status < 500) {
        throw error;
      }

      if (attempt < retries) {
        const backoff = retryDelay * Math.pow(2, attempt);
        await sleep(backoff);
        continue;
      }
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
  return httpGet<T>(url, { ...options, headers, rateLimiterKey: limiter ? limiterKey : undefined });
}
