/**
 * NomosX Semantic Engine
 * 
 * Replaces keyword/n-gram matching with real vector embeddings.
 * Uses OpenAI text-embedding-3-small (1536 dims) for:
 * 
 * 1. Source embedding — embed title+abstract at ingestion time
 * 2. Query embedding — embed search queries for semantic retrieval
 * 3. Cosine similarity — rank sources by true semantic relevance
 * 4. Hybrid scoring — combine semantic + keyword + metadata signals
 * 5. Batch operations — embed multiple texts efficiently
 * 
 * Storage: Prisma Float[] field (Source.embeddings)
 * Future: pgvector native column for SQL-level similarity search
 */

import OpenAI from 'openai';
import { prisma } from '../db';
import { getCachedLLMResponse, cacheLLMResponse } from '../cache/redis-cache';
import Sentry from '@sentry/nextjs';
import type { EnhancedQuery } from './query-enhancer';
import type { SourceForScoring, RelevanceScore } from './relevance-scorer';

// ============================================================================
// CONFIG
// ============================================================================

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const BATCH_SIZE = 100; // OpenAI supports up to 2048 inputs per call
const MAX_INPUT_TOKENS = 8191; // Model limit per input

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.startsWith('sk-place') || key.length < 20) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function zeroVector(): number[] {
  return new Array(EMBEDDING_DIMS).fill(0);
}

// ============================================================================
// CORE: EMBED TEXT
// ============================================================================

/**
 * Embed a single text string. Returns 1536-dim float array.
 */
export async function embedText(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    return new Array(EMBEDDING_DIMS).fill(0);
  }

  // Truncate to ~30k chars (~8k tokens) to stay within model limits
  const truncated = text.slice(0, 30000);

  const client = getClient();
  if (!client) {
    console.warn('[SemanticEngine] OpenAI API key not configured — returning zero vector. Semantic search will be degraded.');
    return zeroVector();
  }
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncated,
    dimensions: EMBEDDING_DIMS,
  });

  return response.data[0].embedding;
}

/**
 * Embed multiple texts in a single API call (much cheaper).
 * Returns array of embeddings in same order as inputs.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  if (!client) {
    console.warn('[SemanticEngine] OpenAI API key not configured — returning zero vectors. Semantic search will be degraded.');
    return texts.map(() => zeroVector());
  }
  const results: number[][] = [];

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => {
      if (!t || t.trim().length === 0) return " "; // OpenAI rejects empty strings
      return t.slice(0, 30000);
    });

    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMS,
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      results.push(...sorted.map(d => d.embedding));
    } catch (error: any) {
      console.error(`[SemanticEngine] Batch embed failed (batch ${i / BATCH_SIZE}): ${error.message}`);
      Sentry.captureException(error, { tags: { agent: "semantic-engine", operation: "embedBatch" } });
      // Fill failed batch with zero vectors
      results.push(...batch.map(() => new Array(EMBEDDING_DIMS).fill(0)));
    }
  }

  return results;
}

// ============================================================================
// COSINE SIMILARITY
// ============================================================================

/**
 * Compute cosine similarity between two vectors.
 * Returns value between -1 and 1 (typically 0 to 1 for normalized embeddings).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ============================================================================
// SOURCE EMBEDDING (at ingestion time)
// ============================================================================

/**
 * Embed a source's title + abstract and store in DB.
 * Should be called during SCOUT/INDEX phase.
 */
export async function embedSource(sourceId: string): Promise<void> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { id: true, title: true, abstract: true, embeddings: true, embeddingModel: true },
  });

  if (!source) return;

  // Skip if already embedded with current model
  if (source.embeddings.length === EMBEDDING_DIMS && source.embeddingModel === EMBEDDING_MODEL) {
    return;
  }

  const text = `${source.title}\n\n${source.abstract || ""}`.trim();
  const embedding = await embedText(text);

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      embeddings: embedding,
      embeddingModel: EMBEDDING_MODEL,
    },
  });
}

/**
 * Batch embed multiple sources. Much more efficient than one-by-one.
 * Returns count of newly embedded sources.
 */
export async function embedSourcesBatch(sourceIds: string[]): Promise<{ embedded: number; skipped: number; failed: number }> {
  const sources = await prisma.source.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, title: true, abstract: true, embeddings: true, embeddingModel: true },
  });

  // Filter out already-embedded sources
  const needsEmbedding = sources.filter(
    s => s.embeddings.length !== EMBEDDING_DIMS || s.embeddingModel !== EMBEDDING_MODEL
  );

  if (needsEmbedding.length === 0) {
    return { embedded: 0, skipped: sources.length, failed: 0 };
  }

  console.log(`[SemanticEngine] Embedding ${needsEmbedding.length} sources (${sources.length - needsEmbedding.length} already done)...`);

  const texts = needsEmbedding.map(s => `${s.title}\n\n${s.abstract || ""}`.trim());
  const embeddings = await embedBatch(texts);

  let failed = 0;

  // Batch update in DB
  const updates = needsEmbedding.map((source, i) => {
    const embedding = embeddings[i];
    if (!embedding || embedding.every(v => v === 0)) {
      failed++;
      return null;
    }
    return prisma.source.update({
      where: { id: source.id },
      data: { embeddings: embedding, embeddingModel: EMBEDDING_MODEL },
    });
  }).filter(Boolean);

  if (updates.length > 0) {
    await prisma.$transaction(updates as any);
    // Also write to native vector column (pgvector) — best-effort, non-blocking
    for (let i = 0; i < needsEmbedding.length; i++) {
      const embedding = embeddings[i];
      if (!embedding || embedding.every(v => v === 0)) continue;
      const vectorLiteral = `[${embedding.join(",")}]`;
      prisma.$executeRawUnsafe(
        `UPDATE "Source" SET embedding = '${vectorLiteral}'::vector WHERE id = '${needsEmbedding[i].id.replace(/'/g, "''")}'`
      ).catch((err: unknown) => {
        console.warn(`[SemanticEngine] pgvector write failed for ${needsEmbedding[i].id}:`, err instanceof Error ? err.message : String(err));
      });
    }
  }

  console.log(`[SemanticEngine] Embedded ${updates.length} sources, ${failed} failed`);

  return {
    embedded: updates.length,
    skipped: sources.length - needsEmbedding.length,
    failed,
  };
}

// ============================================================================
// SEMANTIC SEARCH
// ============================================================================

/**
 * Find the most semantically similar sources to a query.
 * Uses pgvector HNSW index (native SQL) when the vector column is populated,
 * falling back to in-memory cosine similarity if not yet migrated.
 */
export async function semanticSearch(
  query: string,
  options: {
    limit?: number;
    minSimilarity?: number;
    sourceIds?: string[];
    minQuality?: number;
    providers?: string[];
  } = {}
): Promise<Array<{ sourceId: string; similarity: number; title: string }>> {
  const { limit = 20, minSimilarity = 0.3, sourceIds, minQuality, providers } = options;

  const queryEmbedding = await embedText(query);
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  // Try pgvector native SQL first (uses HNSW index — O(log n))
  try {
    type VecRow = { id: string; title: string; similarity: number };
    const extraFilters: string[] = [`s.embedding IS NOT NULL`];
    if (minQuality) extraFilters.push(`s."qualityScore" >= ${minQuality}`);
    if (providers && providers.length > 0) {
      const list = providers.map(p => `'${p.replace(/'/g, "''")}'`).join(",");
      extraFilters.push(`s.provider IN (${list})`);
    }
    if (sourceIds && sourceIds.length > 0) {
      const list = sourceIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
      extraFilters.push(`s.id IN (${list})`);
    }
    const filterClause = extraFilters.length > 0 ? `WHERE ${extraFilters.join(" AND ")}` : "";

    const rows = await prisma.$queryRawUnsafe<VecRow[]>(`
      SELECT s.id, s.title,
             1 - (s.embedding <=> '${vectorLiteral}'::vector) AS similarity
      FROM "Source" s
      ${filterClause}
      ORDER BY s.embedding <=> '${vectorLiteral}'::vector
      LIMIT ${limit * 2}
    `);

    const results = rows
      .map(r => ({ sourceId: r.id, title: r.title, similarity: Number(r.similarity) }))
      .filter(r => r.similarity >= minSimilarity)
      .slice(0, limit);

    if (results.length > 0) {
      console.log(`[SemanticEngine] pgvector search: ${results.length} results`);
      return results;
    }
    // 0 results with native vector → fall through to in-memory (migration pending)
  } catch (err: unknown) {
    console.warn(`[SemanticEngine] pgvector search failed, falling back to in-memory:`, err instanceof Error ? err.message : String(err));
  }

  // In-memory fallback (Float[] JSON column)
  const where: any = { embeddings: { isEmpty: false } };
  if (sourceIds) where.id = { in: sourceIds };
  if (minQuality) where.qualityScore = { gte: minQuality };
  if (providers) where.provider = { in: providers };

  const sources = await prisma.source.findMany({
    where,
    select: { id: true, title: true, embeddings: true },
    take: 500,
    orderBy: { qualityScore: "desc" },
  });

  return sources
    .map(s => ({
      sourceId: s.id,
      title: s.title,
      similarity: cosineSimilarity(queryEmbedding, s.embeddings),
    }))
    .filter(s => s.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// ============================================================================
// HYBRID RELEVANCE SCORER (replaces keyword-only scorer)
// ============================================================================

export interface HybridRelevanceScore extends RelevanceScore {
  semanticScore: number;       // Pure cosine similarity
  keywordScore: number;        // Traditional keyword overlap
  metadataScore: number;       // Citation count, quality, recency
  hybridScore: number;         // Final weighted combination
}

/**
 * Hybrid relevance scoring: combines semantic embeddings + keyword matching + metadata.
 * This replaces the old n-gram-only scorer with a much more intelligent approach.
 * 
 * Weights:
 * - Semantic similarity: 45% (the core intelligence upgrade)
 * - Keyword overlap: 25% (still useful for exact term matching)
 * - Metadata signals: 15% (citations, quality score, recency)
 * - Field/topic match: 15% (domain alignment)
 */
export async function scoreRelevanceHybrid(
  source: SourceForScoring & { embeddings?: number[] },
  queryEmbedding: number[],
  enhancedQuery: EnhancedQuery
): Promise<HybridRelevanceScore> {
  const title = (source.title || "").toLowerCase();
  const abstract = (source.abstract || "").toLowerCase();

  // 1. SEMANTIC SIMILARITY (45%)
  let semanticScore = 0;
  if (source.embeddings && source.embeddings.length === EMBEDDING_DIMS) {
    semanticScore = Math.max(0, cosineSimilarity(queryEmbedding, source.embeddings));
  }

  // 2. KEYWORD OVERLAP (25%)
  const queryKeywords = enhancedQuery.keywords.map(k => k.toLowerCase());
  const fullText = `${title} ${abstract}`;
  const keywordHits = queryKeywords.filter(kw => fullText.includes(kw)).length;
  const keywordScore = Math.min(1.0, keywordHits / Math.max(1, queryKeywords.length));

  // 3. METADATA SIGNALS (15%)
  let metadataScore = 0.5; // Neutral default
  const currentYear = new Date().getFullYear();

  // Citation impact (log scale)
  if (source.citationCount && source.citationCount > 0) {
    metadataScore += Math.min(0.25, Math.log10(source.citationCount) / 16); // log10(10000) = 4, /16 = 0.25
  }

  // Recency bonus
  if (source.year) {
    const age = currentYear - source.year;
    if (age <= 2) metadataScore += 0.15;
    else if (age <= 5) metadataScore += 0.10;
    else if (age <= 10) metadataScore += 0.05;
  }

  // Quality score bonus
  if ((source as any).qualityScore) {
    metadataScore += ((source as any).qualityScore / 100) * 0.10;
  }

  metadataScore = Math.min(1.0, metadataScore);

  // 4. FIELD/TOPIC MATCH (15%)
  const sourceTopics = (source.topics || []).map(t => t.toLowerCase());
  const queryTopics = enhancedQuery.topics.map(t => t.toLowerCase());
  const matchingTopics = sourceTopics.filter(st =>
    queryTopics.some(qt => st.includes(qt) || qt.includes(st))
  ).length;
  const fieldMatch = sourceTopics.length === 0
    ? 0.5
    : Math.min(1.0, matchingTopics / Math.max(1, queryTopics.length));

  // HYBRID SCORE
  const hybridScore =
    semanticScore * 0.45 +
    keywordScore * 0.25 +
    metadataScore * 0.15 +
    fieldMatch * 0.15;

  const explanation = `Semantic: ${(semanticScore * 100).toFixed(0)}% | Keyword: ${(keywordScore * 100).toFixed(0)}% | Meta: ${(metadataScore * 100).toFixed(0)}% | Field: ${(fieldMatch * 100).toFixed(0)}% → Hybrid: ${(hybridScore * 100).toFixed(0)}%`;

  return {
    overall: hybridScore,
    topicOverlap: keywordScore,
    fieldMatch,
    temporalRelevance: metadataScore,
    semanticSimilarity: semanticScore,
    explanation,
    semanticScore,
    keywordScore,
    metadataScore,
    hybridScore,
  };
}

/**
 * Score and filter a batch of sources using hybrid relevance.
 * Embeds the query once, then scores all sources.
 */
export async function filterByRelevanceHybrid(
  sources: Array<SourceForScoring & { id: string; embeddings?: number[] }>,
  enhancedQuery: EnhancedQuery,
  minRelevance = 0.35
): Promise<Array<{ source: SourceForScoring & { id: string }; score: HybridRelevanceScore }>> {
  // Embed query once
  const queryText = `${enhancedQuery.enhanced}\n${enhancedQuery.keywords.join(" ")}`;
  const queryEmbedding = await embedText(queryText);

  // Score all sources
  const scored = await Promise.all(
    sources.map(async (source) => ({
      source,
      score: await scoreRelevanceHybrid(source, queryEmbedding, enhancedQuery),
    }))
  );

  return scored
    .filter(item => item.score.hybridScore >= minRelevance)
    .sort((a, b) => b.score.hybridScore - a.score.hybridScore);
}

// ============================================================================
// EMBEDDING MAINTENANCE
// ============================================================================

/**
 * Embed all sources that don't have embeddings yet.
 * Useful for backfilling existing data.
 */
export async function backfillEmbeddings(
  limit = 200
): Promise<{ embedded: number; remaining: number }> {
  const unembedded = await prisma.source.findMany({
    where: {
      OR: [
        { embeddings: { isEmpty: true } },
        { embeddingModel: { not: EMBEDDING_MODEL } },
      ],
    },
    select: { id: true },
    take: limit,
    orderBy: { qualityScore: 'desc' }, // Prioritize high-quality sources
  });

  if (unembedded.length === 0) {
    return { embedded: 0, remaining: 0 };
  }

  const result = await embedSourcesBatch(unembedded.map(s => s.id));

  // Count remaining
  const remaining = await prisma.source.count({
    where: {
      OR: [
        { embeddings: { isEmpty: true } },
        { embeddingModel: { not: EMBEDDING_MODEL } },
      ],
    },
  });

  console.log(`[SemanticEngine] Backfill: ${result.embedded} embedded, ${remaining} remaining`);

  return { embedded: result.embedded, remaining };
}

/**
 * Get embedding stats for monitoring
 */
export async function getEmbeddingStats(): Promise<{
  total: number;
  embedded: number;
  unembedded: number;
  model: string;
  coverage: number;
}> {
  const [total, embedded] = await Promise.all([
    prisma.source.count(),
    prisma.source.count({ where: { embeddings: { isEmpty: false }, embeddingModel: EMBEDDING_MODEL } }),
  ]);

  return {
    total,
    embedded,
    unembedded: total - embedded,
    model: EMBEDDING_MODEL,
    coverage: total > 0 ? embedded / total : 0,
  };
}
