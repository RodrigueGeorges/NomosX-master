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
import { assertExecutionActive, getExecutionSignal } from '../worker/execution-scope';
import { isFreeRun } from '../free-run';
import { prisma } from '../db';
import { getCachedLLMResponse, cacheLLMResponse } from '../cache/redis-cache';
import Sentry from '@sentry/nextjs';
import type { EnhancedQuery } from './query-enhancer';
import type { SourceForScoring, RelevanceScore } from './relevance-scorer';

// ============================================================================
// CONFIG
// ============================================================================

const EMBEDDING_MODEL = "text-embedding-3-small";
// Cohere embed-v4.0 also emits 1536 dims — a true drop-in fallback when the
// OpenAI account is down. Vectors from different models are NOT comparable,
// so every embedding is tagged via Source.embeddingModel and searches only
// compare vectors produced by the same backend.
const COHERE_EMBED_MODEL = "embed-v4.0";
const EMBEDDING_DIMS = 1536;
const BATCH_SIZE = 100; // OpenAI supports up to 2048 inputs per call
const MAX_INPUT_TOKENS = 8191; // Model limit per input
const MAX_CONCURRENT_BATCHES = 5; // Parallel API calls (5 × 100 = 500 texts in parallel)
const DB_UPDATE_CHUNK = 50; // DB transaction chunk size (avoid huge transactions)

let openaiClient: OpenAI | null = null;
let openaiEmbeddingDead = false; // flipped after first quota/auth failure — skip retries for the process lifetime

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.startsWith('sk-place') || key.length < 20 || openaiEmbeddingDead) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function markOpenAIEmbeddingDead(err: any): void {
  const code = String(err?.code ?? err?.error?.code ?? "").toLowerCase();
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  if (
    err?.status === 401 ||
    code.includes("insufficient_quota") ||
    code.includes("credit_balance") ||
    msg.includes("no credits remaining") ||
    msg.includes("insufficient_quota") ||
    msg.includes("invalid api key")
  ) {
    if (!openaiEmbeddingDead) {
      console.warn('[SemanticEngine] OpenAI embeddings disabled for this process (account error) — Cohere fallback active.');
    }
    openaiEmbeddingDead = true;
  }
}

/**
 * Cohere embed-v4.0 fallback (COHERE_API_KEY). Returns 1536-dim vectors.
 * inputType: 'search_document' for stored sources, 'search_query' for queries.
 */
async function cohereEmbed(texts: string[], inputType: "search_document" | "search_query"): Promise<number[][] | null> {
  const key = process.env.COHERE_API_KEY;
  if (!key || key.length < 10) return null;
  assertExecutionActive();
  const parent = getExecutionSignal();
  const timeout = AbortSignal.timeout(30000);
  const res = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    signal: parent ? AbortSignal.any([parent, timeout]) : timeout,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: COHERE_EMBED_MODEL,
      input_type: inputType,
      embedding_types: ["float"],
      texts,
    }),
  });
  if (!res.ok) {
    throw new Error(`Cohere embed HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  const j = await res.json();
  return j?.embeddings?.float ?? null;
}

function zeroVector(): number[] {
  return new Array(EMBEDDING_DIMS).fill(0);
}

// ============================================================================
// CORE: EMBED TEXT
// ============================================================================

/**
 * Embed a single text string. Returns 1536-dim float array.
 * Falls back to Cohere embed-v4.0 when OpenAI is unavailable.
 */
export async function embedText(text: string): Promise<number[]> {
  return (await embedTextDetailed(text)).embedding;
}

/**
 * Detailed variant — also reports which backend produced the vector so
 * callers can tag Source.embeddingModel and keep comparisons model-consistent.
 */
export async function embedTextDetailed(
  text: string,
  inputType: "search_document" | "search_query" = "search_document",
): Promise<{ embedding: number[]; model: string }> {
  if (!text || text.trim().length === 0) {
    return { embedding: new Array(EMBEDDING_DIMS).fill(0), model: "none" };
  }
  if (isFreeRun()) return { embedding: zeroVector(), model: "none" };

  // Truncate to ~30k chars (~8k tokens) to stay within model limits
  const truncated = text.slice(0, 30000);

  const client = getClient();
  if (client) {
    try {
      assertExecutionActive();
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: truncated,
        dimensions: EMBEDDING_DIMS,
      }, { signal: getExecutionSignal(), timeout: 30000, maxRetries: 0 });
      return { embedding: response.data[0].embedding, model: EMBEDDING_MODEL };
    } catch (err: any) {
      markOpenAIEmbeddingDead(err);
      // fall through to Cohere
    }
  }

  try {
    const cohere = await cohereEmbed([truncated], inputType);
    if (cohere?.[0]?.length === EMBEDDING_DIMS) {
      return { embedding: cohere[0], model: COHERE_EMBED_MODEL };
    }
  } catch (err) {
    console.warn('[SemanticEngine] Cohere embed fallback failed:', err instanceof Error ? err.message : err);
  }

  console.warn('[SemanticEngine] No embedding backend available — returning zero vector. Semantic search will be degraded.');
  return { embedding: zeroVector(), model: "none" };
}

/**
 * Embed multiple texts in a single API call (much cheaper).
 * Returns array of embeddings in same order as inputs.
 * Falls back to Cohere embed-v4.0 per-batch when OpenAI fails.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  return (await embedBatchDetailed(texts)).embeddings;
}

export async function embedBatchDetailed(
  texts: string[],
  inputType: "search_document" | "search_query" = "search_document",
): Promise<{ embeddings: number[][]; model: string }> {
  if (texts.length === 0) return { embeddings: [], model: "none" };
  if (isFreeRun()) return { embeddings: texts.map(() => zeroVector()), model: "none" };

  const client = getClient();

  // Split into batches of BATCH_SIZE
  const batches: Array<{ index: number; texts: string[] }> = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => {
      if (!t || t.trim().length === 0) return " "; // OpenAI rejects empty strings
      return t.slice(0, 30000);
    });
    batches.push({ index: i, texts: batch });
  }

  // Process batches with controlled concurrency (MAX_CONCURRENT_BATCHES parallel)
  const allResults: Array<{ startIndex: number; embeddings: number[][]; model: string }> = [];
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const wave = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
    const waveResults = await Promise.allSettled(
      wave.map(async (batch) => {
        if (client) {
          try {
            assertExecutionActive();
            const response = await client.embeddings.create({
              model: EMBEDDING_MODEL,
              input: batch.texts,
              dimensions: EMBEDDING_DIMS,
            }, { signal: getExecutionSignal(), timeout: 30000, maxRetries: 0 });
            // Sort by index to maintain order
            const sorted = response.data.sort((a, b) => a.index - b.index);
            return { startIndex: batch.index, embeddings: sorted.map(d => d.embedding), model: EMBEDDING_MODEL };
          } catch (err) {
            markOpenAIEmbeddingDead(err);
          }
        }
        // Cohere fallback — 96 texts max per call, our batches are already ≤100
        const cohere = await cohereEmbed(batch.texts, inputType);
        if (!cohere || cohere.length !== batch.texts.length) {
          throw new Error('Cohere embed returned no/mismatched vectors');
        }
        return { startIndex: batch.index, embeddings: cohere, model: COHERE_EMBED_MODEL };
      }),
    );

    for (let j = 0; j < waveResults.length; j++) {
      const result = waveResults[j];
      if (result.status === 'fulfilled') {
        allResults.push(result.value);
      } else {
        // Fill failed batch with zero vectors
        const failedBatch = wave[j];
        console.error(`[SemanticEngine] Batch embed failed (batch at offset ${failedBatch.index}): ${result.reason?.message || result.reason}`);
        allResults.push({
          startIndex: failedBatch.index,
          embeddings: failedBatch.texts.map(() => new Array(EMBEDDING_DIMS).fill(0)),
          model: "none",
        });
      }
    }
  }

  // Reassemble in order
  allResults.sort((a, b) => a.startIndex - b.startIndex);
  const results: number[][] = [];
  const models = new Set<string>();
  for (const r of allResults) {
    results.push(...r.embeddings);
    if (r.model !== "none") models.add(r.model);
  }
  const model = models.size === 1 ? [...models][0] : models.size > 1 ? "mixed" : "none";

  return { embeddings: results, model };
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

  // Skip if already embedded with the backend we'd use right now.
  const expectedModel = getClient() ? EMBEDDING_MODEL : COHERE_EMBED_MODEL;
  if (source.embeddings.length === EMBEDDING_DIMS && source.embeddingModel === expectedModel) {
    return;
  }

  const text = `${source.title}\n\n${source.abstract || ""}`.trim();
  const { embedding, model } = await embedTextDetailed(text);

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      embeddings: embedding,
      embeddingModel: model,
    },
  });

  // F-B16: Also write to native pgvector column (best-effort, non-blocking)
  const vectorLiteral = `[${embedding.join(",")}]`;
  prisma.$executeRawUnsafe(
    `UPDATE "Source" SET embedding = '${vectorLiteral}'::vector WHERE id = '${sourceId.replace(/'/g, "''")}'`
  ).catch((err: unknown) => {
    console.warn(`[SemanticEngine] pgvector write failed for ${sourceId}:`, err instanceof Error ? err.message : String(err));
  });
}

/**
 * Batch embed multiple sources. Much more efficient than one-by-one.
 * Returns count of newly embedded sources.
 */
export async function embedSourcesBatch(sourceIds: string[]): Promise<{ embedded: number; skipped: number; failed: number }> {
  // Zero-cost rehearsal: skip embeddings entirely — no OpenAI/Cohere spend and
  // no pointless DB reads. Ranking degrades to keyword-based for the rehearsal.
  if (isFreeRun()) {
    console.log(`[SemanticEngine] FREE RUN — skipping embeddings for ${sourceIds.length} sources`);
    return { embedded: 0, skipped: sourceIds.length, failed: 0 };
  }
  // Query sources in chunks to avoid loading 4000 rows at once
  const CHUNK_QUERY = 500;
  let allSources: Array<{ id: string; title: string; abstract: string | null; embeddings: number[]; embeddingModel: string | null }> = [];
  for (let i = 0; i < sourceIds.length; i += CHUNK_QUERY) {
    const chunk = sourceIds.slice(i, i + CHUNK_QUERY);
    const sources = await prisma.source.findMany({
      where: { id: { in: chunk } },
      select: { id: true, title: true, abstract: true, embeddings: true, embeddingModel: true },
    });
    allSources.push(...sources);
  }

  // Filter out sources already embedded with the backend we'd use right now
  const expectedModel = getClient() ? EMBEDDING_MODEL : COHERE_EMBED_MODEL;
  const needsEmbedding = allSources.filter(
    s => s.embeddings.length !== EMBEDDING_DIMS || s.embeddingModel !== expectedModel
  );

  if (needsEmbedding.length === 0) {
    return { embedded: 0, skipped: allSources.length, failed: 0 };
  }

  console.log(`[SemanticEngine] Embedding ${needsEmbedding.length} sources (${allSources.length - needsEmbedding.length} already done)...`);

  const texts = needsEmbedding.map(s => `${s.title}\n\n${s.abstract || ""}`.trim());
  const { embeddings, model: embedModel } = await embedBatchDetailed(texts);

  let embedded = 0;
  let failed = 0;

  // Update DB in chunks to avoid huge transactions
  for (let i = 0; i < needsEmbedding.length; i += DB_UPDATE_CHUNK) {
    const chunk = needsEmbedding.slice(i, i + DB_UPDATE_CHUNK);
    const chunkUpdates: any[] = [];

    for (let j = 0; j < chunk.length; j++) {
      const source = chunk[j];
      const embedding = embeddings[i + j];
      if (!embedding || embedding.every(v => v === 0)) {
        failed++;
        continue;
      }
      chunkUpdates.push(
        prisma.source.update({
          where: { id: source.id },
          data: { embeddings: embedding, embeddingModel: embedModel === "mixed" ? "none" : embedModel },
        }),
      );
    }

    if (chunkUpdates.length > 0) {
      try {
        await prisma.$transaction(chunkUpdates as any);
        embedded += chunkUpdates.length;
      } catch (err) {
        console.warn(`[SemanticEngine] DB update chunk failed, trying individual updates:`, err instanceof Error ? err.message : String(err));
        // Fallback: individual updates
        for (const u of chunkUpdates) {
          try { await u; embedded++; } catch { failed++; }
        }
      }
    }

    // Progress log every 500 sources
    if ((i + DB_UPDATE_CHUNK) % 500 === 0 || i + DB_UPDATE_CHUNK >= needsEmbedding.length) {
      console.log(`[SemanticEngine] Embedding progress: ${Math.min(i + DB_UPDATE_CHUNK, needsEmbedding.length)}/${needsEmbedding.length}`);
    }
  }

  // Write to pgvector column in chunks (best-effort, non-blocking but awaited)
  for (let i = 0; i < needsEmbedding.length; i += DB_UPDATE_CHUNK) {
    const chunk = needsEmbedding.slice(i, i + DB_UPDATE_CHUNK);
    const pgvectorPromises: Promise<void>[] = [];
    for (let j = 0; j < chunk.length; j++) {
      const embedding = embeddings[i + j];
      if (!embedding || embedding.every(v => v === 0)) continue;
      const source = chunk[j];
      const vectorLiteral = `[${embedding.join(",")}]`;
      pgvectorPromises.push(
        prisma.$executeRawUnsafe(
          `UPDATE "Source" SET embedding = '${vectorLiteral}'::vector WHERE id = '${source.id.replace(/'/g, "''")}'`
        ).then(() => {}).catch((err: unknown) => {
          // pgvector write failure is non-blocking — embeddings[] fallback still works
        }),
      );
    }
    await Promise.allSettled(pgvectorPromises);
  }

  console.log(`[SemanticEngine] Embedded ${embedded} sources, ${failed} failed`);

  return {
    embedded,
    skipped: allSources.length - needsEmbedding.length,
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

  const { embedding: queryEmbedding, model: queryModel } = await embedTextDetailed(query, "search_query");
  // A zero vector matches nothing meaningfully — bail out early.
  if (queryModel === "none") return [];
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  // Try pgvector native SQL first (uses HNSW index — O(log n))
  try {
    type VecRow = { id: string; title: string; similarity: number };
    // Only compare vectors produced by the same embedding backend —
    // cross-model cosine similarity is meaningless.
    const extraFilters: string[] = [
      `s.embedding IS NOT NULL`,
      `s."embeddingModel" = '${queryModel.replace(/'/g, "''")}'`,
    ];
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

  // In-memory fallback (Float[] JSON column) — same-model vectors only
  const where: any = { embeddings: { isEmpty: false }, embeddingModel: queryModel };
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
// HYBRID SEARCH: Dense (pgvector) + Sparse (Postgres full-text) + Reciprocal Rank Fusion
// Best practice 2026 (llmbestpractices.com):
//   Dense top-k: 20-30 (cheap, captures paraphrase/semantic match)
//   Sparse top-k: 20-30 (almost free, captures exact keywords/identifiers)
//   Merge with Reciprocal Rank Fusion (RRF)
//   Then cross-encoder rerank → top 5-8
// ============================================================================

/**
 * Reciprocal Rank Fusion (RRF).
 * Merges multiple ranked lists into a single ranking.
 * Formula: score(d) = Σ 1 / (k + rank_i(d))  where k=60 (standard)
 *
 * RRF is robust because it doesn't need scores — only ranks.
 * This makes it perfect for fusing dense (cosine similarity) + sparse (BM25/TS).
 */
export function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; score?: number }>>,
  k: number = 60,
): Array<{ id: string; rrfScore: number }> {
  const rrfScores = new Map<string, number>();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank].id;
      const rrf = 1 / (k + rank + 1); // +1 because ranks are 0-indexed
      rrfScores.set(id, (rrfScores.get(id) || 0) + rrf);
    }
  }

  return Array.from(rrfScores.entries())
    .map(([id, rrfScore]) => ({ id, rrfScore }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
}

/**
 * Sparse search using Postgres full-text search (tsvector).
 * This is the BM25 arm of hybrid retrieval — captures exact keyword matches
 * that dense embeddings might miss (e.g. specific identifiers, rare terms).
 *
 * Uses ILIKE fallback if no tsvector column exists.
 */
export async function sparseSearch(
  query: string,
  options: {
    limit?: number;
    sourceIds?: string[];
    minQuality?: number;
    providers?: string[];
  } = {},
): Promise<Array<{ sourceId: string; title: string; sparseScore: number }>> {
  const { limit = 30, sourceIds, minQuality, providers } = options;

  // Build ILIKE query — extracts keywords from the query and searches title + abstract
  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 10); // Top 10 keywords

  if (keywords.length === 0) return [];

  try {
    type SearchRow = { id: string; title: string; score: number };
    const conditions: string[] = [];
    const params: string[] = [];

    // Build OR conditions for each keyword
    for (const kw of keywords) {
      params.push(`%${kw.replace(/'/g, "''")}%`);
      conditions.push(`(s.title ILIKE $${params.length} OR s.abstract ILIKE $${params.length})`);
    }

    let whereClause = `WHERE (${conditions.join(' OR ')})`;
    if (sourceIds && sourceIds.length > 0) {
      const idList = sourceIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
      whereClause += ` AND s.id IN (${idList})`;
    }
    if (minQuality) {
      whereClause += ` AND s."qualityScore" >= ${minQuality}`;
    }
    if (providers && providers.length > 0) {
      const provList = providers.map(p => `'${p.replace(/'/g, "''")}'`).join(',');
      whereClause += ` AND s.provider IN (${provList})`;
    }

    // Score = number of keyword matches (simple BM25-like scoring)
    const scoreExpr = keywords.map(kw => {
      const escaped = kw.replace(/'/g, "''");
      return `CASE WHEN s.title ILIKE '%${escaped}%' THEN 2 ELSE 0 END + CASE WHEN s.abstract ILIKE '%${escaped}%' THEN 1 ELSE 0 END`;
    }).join(' + ');

    const rows = await prisma.$queryRawUnsafe<SearchRow[]>(`
      SELECT s.id, s.title, (${scoreExpr}) AS score
      FROM "Source" s
      ${whereClause}
      ORDER BY score DESC
      LIMIT ${limit}
    `);

    return rows.map(r => ({
      sourceId: r.id,
      title: r.title,
      sparseScore: Number(r.score),
    }));
  } catch (err) {
    console.warn('[SemanticEngine] Sparse search failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Hybrid search: combines dense (pgvector) + sparse (full-text) via Reciprocal Rank Fusion.
 *
 * This is the 2026 best practice (llmbestpractices.com):
 * - Dense retrieval captures semantic similarity (paraphrase, synonyms)
 * - Sparse retrieval captures exact matches (identifiers, rare terms)
 * - RRF merges them robustly without needing score calibration
 *
 * Result: captures both "the database that ships with the OS" (sparse)
 * AND "embedded database for mobile" (dense) → both map to SQLite.
 */
export async function hybridSearch(
  query: string,
  options: {
    limit?: number;
    minSimilarity?: number;
    sourceIds?: string[];
    minQuality?: number;
    providers?: string[];
  } = {},
): Promise<Array<{ sourceId: string; title: string; hybridScore: number; denseRank?: number; sparseRank?: number }>> {
  const { limit = 30 } = options;

  // Run dense + sparse in parallel
  const [denseResults, sparseResults] = await Promise.all([
    semanticSearch(query, { ...options, limit: limit * 2 }),
    sparseSearch(query, { ...options, limit: limit * 2 }),
  ]);

  // Convert to ranked lists for RRF
  const denseRanked = denseResults.map(r => ({ id: r.sourceId, score: r.similarity }));
  const sparseRanked = sparseResults.map(r => ({ id: r.sourceId, score: r.sparseScore }));

  // Fuse with Reciprocal Rank Fusion
  const fused = reciprocalRankFusion([denseRanked, sparseRanked]);

  // Build result with rank info
  const denseRankMap = new Map(denseResults.map((r, i) => [r.sourceId, i + 1]));
  const sparseRankMap = new Map(sparseResults.map((r, i) => [r.sourceId, i + 1]));
  const titleMap = new Map([
    ...denseResults.map(r => [r.sourceId, r.title] as const),
    ...sparseResults.map(r => [r.sourceId, r.title] as const),
  ]);

  const results = fused.slice(0, limit).map(f => ({
    sourceId: f.id,
    title: titleMap.get(f.id) || '',
    hybridScore: f.rrfScore,
    denseRank: denseRankMap.get(f.id),
    sparseRank: sparseRankMap.get(f.id),
  }));

  console.log(`[SemanticEngine] Hybrid search: dense=${denseResults.length}, sparse=${sparseResults.length}, fused=${results.length}`);

  return results;
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
