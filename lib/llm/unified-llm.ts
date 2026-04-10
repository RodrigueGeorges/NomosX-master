/**
 * Unified LLM Service
 * Supports multiple providers (OpenAI, Anthropic) with automatic fallback
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { env } from '../env';
import { getCachedLLMResponse,cacheLLMResponse } from '../cache/redis-cache';
import Sentry from '@sentry/nextjs';

// Provider types
export type LLMProvider = "openai" | "anthropic";

// Model configurations
const MODEL_CONFIG = {
  openai: {
    "gpt-4o": { contextWindow: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015 },
    "gpt-4o-mini": { contextWindow: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },
    "gpt-4-turbo": { contextWindow: 128000, costPer1kInput: 0.01, costPer1kOutput: 0.03 },
  },
  anthropic: {
    "claude-3-5-sonnet-20241022": { contextWindow: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
    "claude-3-5-haiku-20241022": { contextWindow: 200000, costPer1kInput: 0.001, costPer1kOutput: 0.005 },
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

// Clients
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getAnthropicClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

export interface LLMRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  model?: string;
  provider?: LLMProvider;
  enableCache?: boolean;
}

export interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  cached: boolean;
}

/**
 * Calculate cost based on provider and model
 */
function calculateCost(
  provider: LLMProvider,
  model: string,
  tokensInput: number,
  tokensOutput: number
): number {
  const providerConfig = MODEL_CONFIG[provider as keyof typeof MODEL_CONFIG];
  const config = (providerConfig as any)?.[model];
  if (!config || !config.costPer1kInput || !config.costPer1kOutput) return 0;
  
  const inputCost = (tokensInput / 1000) * config.costPer1kInput;
  const outputCost = (tokensOutput / 1000) * config.costPer1kOutput;
  return inputCost + outputCost;
}

/**
 * Call OpenAI
 */
async function callOpenAI(request: LLMRequest): Promise<LLMResponse> {
  const client = getOpenAIClient();
  const model = request.model || env.OPENAI_MODEL || "gpt-4o";
  
  const completion = await withRetry<Awaited<ReturnType<typeof client.chat.completions.create>>>(
    () => client.chat.completions.create({
      model,
      messages: request.messages as any,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 4000,
      response_format: request.jsonMode ? { type: "json_object" } : undefined,
    }),
    `OpenAI/${model}`
  );
  
  const content = (completion as any).choices?.[0]?.message?.content || "";
  const tokensInput = (completion as any).usage?.prompt_tokens || 0;
  const tokensOutput = (completion as any).usage?.completion_tokens || 0;
  
  return {
    content,
    provider: "openai",
    model,
    tokensInput,
    tokensOutput,
    costUsd: calculateCost("openai", model, tokensInput, tokensOutput),
    cached: false,
  };
}

/**
 * Call Anthropic Claude
 */
async function callAnthropic(request: LLMRequest): Promise<LLMResponse> {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error("Anthropic API key not configured");
  }
  
  const model = request.model || "claude-3-5-sonnet-20241022";
  
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
    return `fallback_${request.model || 'gpt-4'}_${request.temperature || 0.2}`;
  }
  
  for (const msg of request.messages) {
    hash.update(msg.role);
    hash.update(msg.content);
  }
  hash.update(String(request.temperature ?? 0.2));
  hash.update(String(request.jsonMode ?? false));
  hash.update(String(request.maxTokens ?? 4000));
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
 * Unified LLM call with automatic fallback, circuit breaker, and timeout
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();
  const model = request.model || env.OPENAI_MODEL || "gpt-4o";
  
  // Check cache first if enabled
  const cacheKey = request.enableCache !== false ? buildCacheKey(request) : null;
  if (cacheKey) {
    try {
      const cached = await getCachedLLMResponse(cacheKey, model);
      if (cached) {
        return { ...cached, cached: true };
      }
    } catch {
      // Cache miss or error — proceed to LLM call
    }
  }
  
  // Determine provider order (with fallback), skip circuit-broken providers
  const primaryProvider = request.provider || "openai";
  const fallbackProvider: LLMProvider = primaryProvider === "openai" ? "anthropic" : "openai";
  
  const providers: LLMProvider[] = [];
  if (!isCircuitOpen(primaryProvider)) providers.push(primaryProvider);
  if (getAnthropicClient() && !isCircuitOpen(fallbackProvider)) providers.push(fallbackProvider);
  // If all circuits open, still try primary (half-open)
  if (providers.length === 0) providers.push(primaryProvider);
  
  // Timeout: 60s for normal calls, 120s for large token requests
  const timeoutMs = (request.maxTokens && request.maxTokens > 8000) ? 120_000 : 60_000;
  
  let lastError: Error | null = null;
  
  for (const provider of providers) {
    try {
      let response: LLMResponse;
      if (provider === "openai") {
        response = await withTimeout(callOpenAI(request), timeoutMs, `OpenAI/${model}`);
      } else {
        response = await withTimeout(callAnthropic(request), timeoutMs, `Anthropic/${request.model || 'claude'}`);
      }
      
      recordProviderSuccess(provider);
      
      const duration = Date.now() - startTime;
      console.log(
        `✅ ${provider} | ${duration}ms | ${response.tokensInput}+${response.tokensOutput} tok | $${response.costUsd.toFixed(4)}`
      );
      
      // Cache successful response (fire-and-forget)
      if (cacheKey) {
        cacheLLMResponse(cacheKey, response.model, response).catch(() => {});
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      recordProviderFailure(provider);
      console.error(`❌ ${provider} failed: ${(error as Error).message}`);
      
      Sentry.captureException(error, {
        tags: { provider, model: request.model },
        contexts: { llm: { provider, temperature: request.temperature, jsonMode: request.jsonMode } },
      });
      
      continue;
    }
  }
  
  const errorMsg = `All LLM providers failed. Last error: ${lastError?.message}`;
  Sentry.captureMessage(errorMsg, "error");
  throw new Error(errorMsg);
}

/**
 * Streaming LLM call (OpenAI only for now)
 */
export async function streamLLM(
  request: LLMRequest,
  onChunk: (chunk: string) => void
): Promise<LLMResponse> {
  const client = getOpenAIClient();
  const model = request.model || env.OPENAI_MODEL || "gpt-4o";
  
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
    provider: "openai",
    model,
    tokensInput,
    tokensOutput,
    costUsd: calculateCost("openai", model, tokensInput, tokensOutput),
    cached: false,
  };
}

/**
 * Get available providers
 */
export function getAvailableProviders(): LLMProvider[] {
  const providers: LLMProvider[] = ["openai"];
  if (getAnthropicClient()) {
    providers.push("anthropic");
  }
  return providers;
}

/**
 * Health check for providers
 */
export async function checkLLMHealth(): Promise<{
  openai: boolean;
  anthropic: boolean;
}> {
  const health = { openai: false, anthropic: false };
  
  // Test OpenAI
  try {
    const client = getOpenAIClient();
    await client.models.list();
    health.openai = true;
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
