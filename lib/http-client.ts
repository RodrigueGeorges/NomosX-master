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

// Default rate limits for known providers
// OpenAlex: premium api_key = 10 req/s guaranteed; polite pool = ~5 req/s
setRateLimiter("openalex", process.env.OPENALEX_API_KEY
  ? { requestsPerSecond: 10, burstSize: 20 }
  : { requestsPerSecond: 5, burstSize: 10 });
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
            // OpenAlex: allow 1 retry with proper backoff (rate limiter is now 5 req/s)
            if (url.includes('openalex.org') && !retryAfterRaw) {
              backoff = 15000; // 15s cooldown for OpenAlex
            }
            // OpenAlex: at least 15s; generic: at least 10s
            const minCooldown = url.includes('openalex.org') ? 15000 : 10000;
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
