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
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return Promise.resolve();
    }

    // Wait for next token
    const waitTime = (1 - this.tokens) / this.requestsPerSecond * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    this.tokens = 0;
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
setRateLimiter("openalex", { requestsPerSecond: 10, burstSize: 20 });
setRateLimiter("crossref", { requestsPerSecond: 50, burstSize: 100 });
setRateLimiter("semanticscholar", { requestsPerSecond: 1, burstSize: 2 });
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
    responseType = "json",
  } = options;

  // Apply rate limiting if configured
  if (rateLimit) {
    const limiter = new RateLimiter(rateLimit);
    await limiter.acquire();
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
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
          const backoff = retryDelay * Math.pow(2, attempt);
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
  } = options;

  // Apply rate limiting if configured
  if (rateLimit) {
    const limiter = new RateLimiter(rateLimit);
    await limiter.acquire();
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
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
          const backoff = retryDelay * Math.pow(2, attempt);
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
  const limiter = getRateLimiter(provider);
  if (limiter) {
    await limiter.acquire();
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

  return httpGet<T>(url, { ...options, headers });
}
