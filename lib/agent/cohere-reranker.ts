/**
 * COHERE RERANKER
 * 
 * Uses Cohere's rerank API to reorder search results by relevance.
 * Cohere's rerank-english-v3.0 is state-of-the-art for search relevance.
 * 
 * Fallback: If Cohere API fails or is not configured, uses local relevance scoring.
 */

import { env } from '../env';
import { isFreeRun } from '../free-run';
import type {EnhancedQuery} from './query-enhancer';
import { scoreRelevance, type SourceForScoring } from './relevance-scorer';

export interface RerankResult<T> {
  source: T;
  relevanceScore: number; // 0.0 - 1.0
  index: number;
  rerankScore?: number; // Cohere's raw score (if used)
}

/**
 * Rerank sources using Cohere API
 * Falls back to local scoring if Cohere is unavailable
 */
export async function rerankSources<T extends SourceForScoring & { id: string }>(
  sources: T[],
  enhancedQuery: EnhancedQuery,
  options: {
    topK?: number;
    minScore?: number;
    useCohere?: boolean;
  } = {}
): Promise<RerankResult<T>[]> {
  const {
    topK = sources.length,
    minScore = 0.0,
    useCohere = true,
  } = options;

  // If Cohere is disabled, no API key, or a zero-cost rehearsal, use local scoring
  if (!useCohere || !env.COHERE_API_KEY || isFreeRun()) {
    console.log("[Reranker] Using local relevance scoring (Cohere not configured)");
    return rerankLocally(sources, enhancedQuery, topK, minScore);
  }

  try {
    return await rerankWithCohere(sources, enhancedQuery, topK, minScore);
  } catch (error: any) {
    console.error(`[Reranker] Cohere failed: ${error.message}. Falling back to local scoring.`);
    return rerankLocally(sources, enhancedQuery, topK, minScore);
  }
}

/**
 * Rerank using Cohere API — with 2 retries + exponential backoff + jitter.
 * Retries on 429 (rate limit) and 5xx (server errors) only.
 */
async function rerankWithCohere<T extends SourceForScoring & { id: string }>(
  sources: T[],
  enhancedQuery: EnhancedQuery,
  topK: number,
  minScore: number
): Promise<RerankResult<T>[]> {
  // Prepare documents for Cohere
  const documents = sources.map(s => ({
    text: `${s.title}\n\n${s.abstract || ""}`.trim(),
  }));

  const body = JSON.stringify({
    model: "rerank-english-v3.0",
    query: enhancedQuery.enhanced,
    documents: documents.map(d => d.text),
    top_n: Math.min(topK, sources.length),
    return_documents: false,
  });

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.cohere.ai/v1/rerank", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.COHERE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Retry on 429 and 5xx only
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
          const retryAfter = response.headers.get('Retry-After');
          let backoff = retryAfter ? parseFloat(retryAfter) * 1000 : 2000 * Math.pow(2, attempt);
          backoff = Math.round(backoff * (0.75 + Math.random() * 0.5)); // jitter
          backoff = Math.min(backoff, 30000); // cap at 30s
          console.warn(`[Reranker] Cohere ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        throw new Error(`Cohere API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const results: RerankResult<T>[] = [];

      for (const result of data.results || []) {
        const index = result.index;
        const score = result.relevance_score; // Cohere returns 0-1 score

        if (score >= minScore) {
          results.push({
            source: sources[index],
            relevanceScore: score,
            index,
            rerankScore: score,
          });
        }
      }

      console.log(`[Reranker] Cohere reranked ${sources.length} sources → ${results.length} results (min score: ${minScore}, attempt ${attempt + 1})`);

      // If Cohere returns too few results, fall back to local scoring to preserve source pool
      if (results.length < 10 && sources.length > 20) {
        console.log(`[Reranker] Cohere returned only ${results.length} results from ${sources.length} sources — falling back to local scoring for better coverage`);
        return rerankLocally(sources, enhancedQuery, topK, minScore);
      }

      return results;
    } catch (error: any) {
      lastError = error;
      // Network errors (not HttpError) — retry
      if (attempt < MAX_RETRIES) {
        const backoff = Math.round(2000 * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5));
        console.warn(`[Reranker] Cohere network error, retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
    }
  }

  throw lastError || new Error("Cohere rerank failed after all retries");
}

/**
 * Rerank using local relevance scoring (fallback)
 */
function rerankLocally<T extends SourceForScoring & { id: string }>(
  sources: T[],
  enhancedQuery: EnhancedQuery,
  topK: number,
  minScore: number
): RerankResult<T>[] {
  const scored = sources.map((source, index) => {
    const relevance = scoreRelevance(source, enhancedQuery);
    return {
      source,
      relevanceScore: relevance.overall,
      index,
    };
  });

  const filtered = scored
    .filter(item => item.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK);

  console.log(`[Reranker] Local scoring: ${sources.length} sources → ${filtered.length} results (min score: ${minScore})`);
  
  return filtered;
}

/**
 * Batch rerank (for large result sets)
 * Splits into chunks to avoid API limits
 */
export async function rerankBatch<T extends SourceForScoring & { id: string }>(
  sources: T[],
  enhancedQuery: EnhancedQuery,
  batchSize = 100
): Promise<RerankResult<T>[]> {
  const batches: T[][] = [];
  
  for (let i = 0; i < sources.length; i += batchSize) {
    batches.push(sources.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    batches.map(batch => rerankSources(batch, enhancedQuery, { topK: batch.length }))
  );

  // Merge and sort all results
  return results
    .flat()
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
