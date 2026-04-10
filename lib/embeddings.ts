/**
 * Embeddings generation and hybrid search
 * Uses OpenAI embeddings + JSON storage (pgvector fallback)
 */

import OpenAI from 'openai';
import { env } from './env';
import { prisma } from './db';

const ai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding for text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // Token limit safety
    });
    
    return response.data[0].embedding;
  } catch (error: any) {
    console.error(`[Embeddings] Generation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Generate and store embeddings for a source
 */
export async function embedSource(sourceId: string): Promise<boolean> {
  try {
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) return false;
    
    // Create embedding from title + abstract
    const text = `${source.title}\n\n${source.abstract || ""}`.slice(0, 8000);
    const embedding = await generateEmbedding(text);
    
    // TODO: Store embedding in pgvector via raw SQL when Prisma supports vector properly
    // For now, we'll skip the storage update
    // await prisma.source.update({
    //   where: { id: sourceId },
    //   data: { embedding: embedding as any }, // JSON storage
    // });
    
    return true;
  } catch (error: any) {
    console.error(`[Embeddings] Failed for source ${sourceId}: ${error.message}`);
    return false;
  }
}

/**
 * Batch embed multiple sources
 */
export async function embedSources(sourceIds: string[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  for (const sourceId of sourceIds) {
    const result = await embedSource(sourceId);
    if (result) success++;
    else failed++;
    
    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  
  return { success, failed };
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Hybrid search: lexical prefilter + semantic rerank
 */
export async function hybridSearch(
  query: string,
  options: {
    limit?: number;
    lexicalLimit?: number;
    providers?: string[];
    minYear?: number;
    domainSlugs?: string[];
  } = {}
): Promise<any[]> {
  const {
    limit = 20,
    lexicalLimit = 100,
    providers,
    minYear,
    domainSlugs,
  } = options;
  
  // 1. Lexical prefilter (Postgres full-text search)
  const where: any = {};
  
  if (providers && providers.length > 0) {
    where.provider = { in: providers };
  }
  
  if (minYear) {
    where.year = { gte: minYear };
  }
  
  // Filter by domains if specified
  if (domainSlugs && domainSlugs.length > 0) {
    where.domains = {
      some: {
        domain: {
          slug: { in: domainSlugs },
        },
        score: { gte: 0.15 }, // Minimum confidence threshold
      },
    };
  }
  
  // Simple title/abstract contains
  where.OR = [
    { title: { contains: query, mode: "insensitive" } },
    { abstract: { contains: query, mode: "insensitive" } },
  ];
  
  const lexicalResults = await prisma.source.findMany({
    where,
    take: lexicalLimit,
    orderBy: [{ qualityScore: "desc" }, { createdAt: "desc" }],
    include: {
      authors: { include: { author: true } },
      institutions: { include: { institution: true } },
      domains: {
        include: { domain: true },
        orderBy: { score: "desc" },
        take: 3,
      },
    },
  });
  
  if (lexicalResults.length === 0) {
    return [];
  }
  
  // 2. Semantic rerank
  try {
    const queryEmbedding = await generateEmbedding(query);
    
    const scored = lexicalResults
      .map((source) => {
        if (!source.embeddings) {
          return { source, score: 0 };
        }
        
        const sourceEmbedding = source.embeddings as number[];
        const similarity = cosineSimilarity(queryEmbedding, sourceEmbedding);
        
        return { source, score: similarity };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return scored.map((s) => s.source);
  } catch (error: any) {
    console.error(`[HybridSearch] Semantic rerank failed, falling back to lexical: ${error.message}`);
    return lexicalResults.slice(0, limit);
  }
}

/**
 * Find similar sources by embedding
 */
export async function findSimilarSources(sourceId: string, limit = 10): Promise<any[]> {
  try {
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source || !source.embeddings) {
      return [];
    }
    
    const sourceEmbedding = source.embeddings as number[];
    
    // Get all sources with embeddings (inefficient for large DBs, but works for V1)
    const allSources = await prisma.source.findMany({
      where: {
        id: { not: sourceId },
        // embeddings list is never null (defaults to []), so we just fetch all
      },
      take: 500, // Limit for performance
      include: {
        authors: { include: { author: true } },
        institutions: { include: { institution: true } },
      },
    });
    
    const scored = allSources
      .map((s) => ({
        source: s,
        score: cosineSimilarity(sourceEmbedding, s.embeddings as number[]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return scored.map((s) => s.source);
  } catch (error: any) {
    console.error(`[FindSimilar] Failed for ${sourceId}: ${error.message}`);
    return [];
  }
}
