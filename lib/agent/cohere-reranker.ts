/**
 * COHERE RERANKER
 * 
 * Uses Cohere's rerank API to reorder search results by relevance.
 * Cohere's rerank-english-v3.0 is state-of-the-art for search relevance.
 * 
 * Fallback: If Cohere API fails or is not configured, uses local relevance scoring.
 */

import { env } from '../env';
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

  // If Cohere is disabled or no API key, use local scoring
  if (!useCohere || !env.COHERE_API_KEY) {
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
 * Rerank using Cohere API
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

  const response = await fetch("https://api.cohere.ai/v1/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "rerank-english-v3.0",
      query: enhancedQuery.enhanced,
      documents: documents.map(d => d.text),
      top_n: Math.min(topK, sources.length),
      return_documents: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere API error: ${response.status} - ${error}`);
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

  console.log(`[Reranker] Cohere reranked ${sources.length} sources → ${results.length} results (min score: ${minScore})`);
  
  return results;
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
