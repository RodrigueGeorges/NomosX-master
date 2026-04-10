/**
 * EMBEDDINGS SERVICE V2 - PgVector Activé
 * Service d'embeddings avec stockage vectoriel réel
 */

import { prisma } from '@/lib/db';
import { generateEmbedding } from '@/lib/embeddings';

/**
 * Generate and store embedding for a source (pgvector real storage)
 */
export async function embedSourceV2(sourceId: string): Promise<boolean> {
  try {
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) return false;
    
    // Create embedding from title + abstract
    const text = `${source.title}\n\n${source.abstract || ""}`.slice(0, 8000);
    const embedding = await generateEmbedding(text);
    
    // Store embedding in pgvector via raw SQL
    await prisma.$executeRaw`
      UPDATE "Source" 
      SET embedding = ${embedding}::vector, 
          "embeddingModel" = 'text-embedding-3-small',
          "updatedAt" = NOW()
      WHERE id = ${sourceId}
    `;
    
    console.log(`[EmbeddingsV2] Stored embedding for source ${sourceId}`);
    return true;
  } catch (error: any) {
    console.error(`[EmbeddingsV2] Failed for source ${sourceId}: ${error.message}`);
    return false;
  }
}

/**
 * Batch embed multiple sources with concurrency control
 */
export async function embedSourcesV2(sourceIds: string[], concurrency = 3): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < sourceIds.length; i += concurrency) {
    const batch = sourceIds.slice(i, i + concurrency);
    
    await Promise.allSettled(
      batch.map(async (sourceId) => {
        const result = await embedSourceV2(sourceId);
        if (result) success++;
        else failed++;
      })
    );
    
    // Small delay between batches
    if (i + concurrency < sourceIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`[EmbeddingsV2] Batch complete: ${success} success, ${failed} failed`);
  return { success, failed };
}

/**
 * Vector similarity search (pgvector)
 */
export async function vectorSearch(
  queryEmbedding: number[],
  options: {
    limit?: number;
    threshold?: number;
    table?: 'Source' | 'SourceChunk';
  } = {}
): Promise<Array<{ id: string; score: number; data: any }>> {
  const { limit = 10, threshold = 0.7, table = 'Source' } = options;
  
  try {
    const results = await prisma.$queryRaw`
      SELECT id, 1 - (embedding <=> ${queryEmbedding}::vector) as score,
             json_build_object(
               'title', title,
               'abstract', abstract,
               'provider', provider,
               'year', year
             ) as data
      FROM ${table}
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> ${queryEmbedding}::vector) > ${threshold}
      ORDER BY embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;
    
    return results as any[];
  } catch (error: any) {
    console.error(`[VectorSearch] Failed: ${error.message}`);
    return [];
  }
}

/**
 * Hybrid search V2: lexical prefilter + semantic rerank
 */
export async function hybridSearchV2(
  query: string,
  options: {
    limit?: number;
    lexicalLimit?: number;
    semanticThreshold?: number;
  } = {}
): Promise<any[]> {
  const { limit = 10, lexicalLimit = 50, semanticThreshold = 0.7 } = options;
  
  try {
    // Step 1: Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    
    // Step 2: Lexical prefilter (full-text search)
    const lexicalResults = await prisma.$queryRaw`
      SELECT id, title, abstract, provider, year,
             ts_rank(to_tsvector('english', title || ' ' || COALESCE(abstract, '')), 
                    plainto_tsquery('english', ${query})) as rank
      FROM "Source"
      WHERE to_tsvector('english', title || ' ' || COALESCE(abstract, '')) 
            @@ plainto_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT ${lexicalLimit}
    `;
    
    if (!lexicalResults || (lexicalResults as any[]).length === 0) {
      // Fallback to pure vector search
      const vectorResults = await vectorSearch(queryEmbedding, { 
        limit, 
        threshold: semanticThreshold 
      });
      return vectorResults.map(r => ({ ...r.data, semanticScore: r.score }));
    }
    
    // Step 3: Semantic rerank on lexical results
    const sourceIds = (lexicalResults as any[]).map(r => r.id);
    
    const semanticResults = await prisma.$queryRaw`
      SELECT id, 1 - (embedding <=> ${queryEmbedding}::vector) as semantic_score
      FROM "Source"
      WHERE id = ANY(${sourceIds})
        AND embedding IS NOT NULL
    `;
    
    // Step 4: Combine scores
    const combined = (lexicalResults as any[]).map(lexical => {
      const semantic = (semanticResults as any[]).find(s => s.id === lexical.id);
      const semanticScore = semantic?.semantic_score || 0;
      
      // Weighted combination: 60% lexical, 40% semantic
      const combinedScore = (lexical.rank * 0.6) + (semanticScore * 0.4);
      
      return {
        ...lexical,
        semanticScore,
        combinedScore
      };
    });
    
    // Step 5: Sort by combined score and limit
    combined.sort((a, b) => b.combinedScore - a.combinedScore);
    
    return combined.slice(0, limit);
    
  } catch (error: any) {
    console.error(`[HybridSearchV2] Failed: ${error.message}`);
    return [];
  }
}
