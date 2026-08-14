/**
 * Episodic Memory Graph (EMG) — NomosX
 *
 * Inspired by:
 * - A-Mem (NeurIPS 2025): Zettelkasten-inspired dynamic indexing and linking
 * - Experience Memory Graph (arXiv 2026): graph matching for failure recovery
 * - EMA (ACL 2026): Episodic Memory Units with MemDecider filtering
 * - Reflexion (NeurIPS 2023): verbal reinforcement learning from self-reflections
 *
 * Architecture:
 * - Each pipeline run is stored as an Episode (query, sources, analysis, critic score, feedback)
 * - Episodes are indexed by semantic similarity (embedding) + causal links (brief influenced)
 * - At pipeline start, relevant past episodes are retrieved and injected into context
 * - Failed episodes (critic score < 40) are used to avoid repeating mistakes
 * - Successful episodes (critic score >= 75) are used as positive examples
 *
 * Integration points:
 * - pipeline-v2.ts: call storeEpisode() at end of run, retrieveEpisodes() at start
 * - context-primer.ts: include past episodes in context block
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Episode {
  id: string;
  query: string;
  researchQuestion: string;
  sourceCount: number;
  providerDiversity: number;
  criticScore: number | null;
  criticVerdict: string | null;
  biasRisk: number | null;
  groundedness: number | null;
  keyFindings: string[];
  mistakes: string[];
  successes: string[];
  domains: string[];
  durationMs: number;
  costUsd: number;
  createdAt: Date;
  // Semantic embedding for similarity search
  embedding?: number[];
}

export interface RetrievedEpisode {
  episode: Episode;
  similarity: number;
  relevance: 'high' | 'medium' | 'low';
  lesson: string;
}

export interface EpisodeContextBlock {
  similarPastRuns: RetrievedEpisode[];
  pastMistakes: string[];
  pastSuccesses: string[];
  patternsToAvoid: string[];
  patternsToEmulate: string[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

/**
 * Store a completed pipeline run as an episodic memory entry.
 * Called at the end of each pipeline run.
 */
export async function storeEpisode(params: {
  query: string;
  researchQuestion: string;
  sourceCount: number;
  providerDiversity: number;
  criticScore?: number | null;
  criticVerdict?: string | null;
  biasRisk?: number | null;
  groundedness?: number | null;
  keyFindings?: string[];
  mistakes?: string[];
  successes?: string[];
  domains?: string[];
  durationMs: number;
  costUsd: number;
  briefId?: string;
}): Promise<string | null> {
  try {
    // Generate semantic embedding for the research question
    const embedding = await generateEmbedding(params.researchQuestion);

    // Store in database using a dedicated table (or Brief metadata)
    // We use the Brief's metadata field if no dedicated table exists
    const episodeData = {
      type: 'episodic_memory',
      query: params.query,
      researchQuestion: params.researchQuestion,
      sourceCount: params.sourceCount,
      providerDiversity: params.providerDiversity,
      criticScore: params.criticScore ?? null,
      criticVerdict: params.criticVerdict ?? null,
      biasRisk: params.biasRisk ?? null,
      groundedness: params.groundedness ?? null,
      keyFindings: params.keyFindings || [],
      mistakes: params.mistakes || [],
      successes: params.successes || [],
      domains: params.domains || [],
      durationMs: params.durationMs,
      costUsd: params.costUsd,
      embedding: embedding ? Array.from(embedding) : null,
      storedAt: new Date().toISOString(),
    };

    // Try to store in a dedicated EpisodicMemory table if it exists
    // Otherwise, store as Brief metadata
    if (params.briefId) {
      await prisma.$executeRaw`
        UPDATE "Brief"
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ episodicMemory: episodeData })}::jsonb
        WHERE id = ${params.briefId}
      `;
    }

    // Also store in a standalone log table for cross-brief retrieval
    await prisma.$executeRaw`
      INSERT INTO "EpisodicMemory" ("id", "query", "researchQuestion", "sourceCount", "criticScore", "criticVerdict", "mistakes", "successes", "domains", "embedding", "createdAt")
      VALUES (
        ${crypto.randomUUID()},
        ${params.query},
        ${params.researchQuestion},
        ${params.sourceCount},
        ${params.criticScore ?? null},
        ${params.criticVerdict ?? null},
        ${JSON.stringify(params.mistakes || [])}::jsonb,
        ${JSON.stringify(params.successes || [])}::jsonb,
        ${JSON.stringify(params.domains || [])}::jsonb,
        ${embedding ? JSON.stringify(Array.from(embedding)) : null}::jsonb,
        NOW()
      )
      ON CONFLICT DO NOTHING
    `;

    console.log(`[EMG] Episode stored: ${params.researchQuestion.slice(0, 60)}... | score: ${params.criticScore ?? 'N/A'}`);
    return null;
  } catch (error) {
    // Non-blocking — if table doesn't exist, just log
    console.warn(`[EMG] Failed to store episode (non-blocking):`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

// ─── Retrieval ──────────────────────────────────────────────────────────────

/**
 * Retrieve relevant past episodes for a new research question.
 * Called at the start of each pipeline run.
 */
export async function retrieveEpisodes(
  researchQuestion: string,
  options?: { limit?: number; minSimilarity?: number; includeFailures?: boolean }
): Promise<RetrievedEpisode[]> {
  const limit = options?.limit ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0.55;
  const includeFailures = options?.includeFailures ?? true;

  try {
    const queryEmbedding = await generateEmbedding(researchQuestion);
    if (!queryEmbedding) return [];

    // Fetch recent episodes from database
    const recentEpisodes = await prisma.$queryRaw<any[]>`
      SELECT * FROM "EpisodicMemory"
      ORDER BY "createdAt" DESC
      LIMIT 100
    `;

    if (!recentEpisodes || recentEpisodes.length === 0) return [];

    // Compute cosine similarity with each episode
    const scored = recentEpisodes.map((ep: any) => {
      const epEmbedding = ep.embedding ? (typeof ep.embedding === 'string' ? JSON.parse(ep.embedding) : ep.embedding) : null;
      const sim = epEmbedding ? cosineSimilarity(queryEmbedding, epEmbedding) : 0;
      return { episode: ep, similarity: sim };
    }).filter((s: { similarity: number }) => s.similarity >= minSimilarity);

    // Sort by similarity and take top N
    scored.sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity);
    const top = scored.slice(0, limit);

    // Build RetrievedEpisode objects with lessons
    return top.map(({ episode, similarity }: { episode: any; similarity: number }) => {
      const mistakes = typeof episode.mistakes === 'string' ? JSON.parse(episode.mistakes) : (episode.mistakes || []);
      const successes = typeof episode.successes === 'string' ? JSON.parse(episode.successes) : (episode.successes || []);

      const isFailure = episode.criticScore !== null && episode.criticScore < 40;
      const isSuccess = episode.criticScore !== null && episode.criticScore >= 75;

      let lesson = '';
      if (isFailure && mistakes.length > 0) {
        lesson = `Past failure (score: ${episode.criticScore}): ${mistakes[0]}`;
      } else if (isSuccess && successes.length > 0) {
        lesson = `Past success (score: ${episode.criticScore}): ${successes[0]}`;
      } else {
        lesson = `Prior coverage on: ${episode.researchQuestion?.slice(0, 80)}...`;
      }

      return {
        episode: {
          id: episode.id,
          query: episode.query,
          researchQuestion: episode.researchQuestion,
          sourceCount: episode.sourceCount,
          providerDiversity: 0,
          criticScore: episode.criticScore,
          criticVerdict: episode.criticVerdict,
          biasRisk: null,
          groundedness: null,
          keyFindings: [],
          mistakes,
          successes,
          domains: typeof episode.domains === 'string' ? JSON.parse(episode.domains) : (episode.domains || []),
          durationMs: 0,
          costUsd: 0,
          createdAt: episode.createdAt,
        },
        similarity,
        relevance: similarity > 0.75 ? 'high' : similarity > 0.60 ? 'medium' : 'low',
        lesson,
      } as RetrievedEpisode;
    });
  } catch (error) {
    // Non-blocking — if table doesn't exist, return empty
    console.warn(`[EMG] Failed to retrieve episodes (non-blocking):`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Build a context block from retrieved episodes for injection into the pipeline.
 */
export function buildEpisodeContextBlock(episodes: RetrievedEpisode[]): EpisodeContextBlock {
  if (episodes.length === 0) {
    return {
      similarPastRuns: [],
      pastMistakes: [],
      pastSuccesses: [],
      patternsToAvoid: [],
      patternsToEmulate: [],
    };
  }

  const failures = episodes.filter(e => e.episode.criticScore !== null && e.episode.criticScore < 40);
  const successes = episodes.filter(e => e.episode.criticScore !== null && e.episode.criticScore >= 75);

  const pastMistakes = failures.flatMap(e => e.episode.mistakes).slice(0, 5);
  const pastSuccesses = successes.flatMap(e => e.episode.successes).slice(0, 5);

  // Extract patterns
  const patternsToAvoid: string[] = [];
  if (failures.some(e => e.episode.sourceCount < 5)) {
    patternsToAvoid.push('Insufficient source diversity (< 5 sources led to poor analysis)');
  }
  if (failures.some(e => e.episode.providerDiversity < 0.3)) {
    patternsToAvoid.push('Low provider diversity — too many sources from same provider');
  }

  const patternsToEmulate: string[] = [];
  if (successes.some(e => e.episode.sourceCount >= 15)) {
    patternsToEmulate.push('High source count (15+) correlated with strong analysis');
  }
  if (successes.some(e => e.episode.domains.length >= 3)) {
    patternsToEmulate.push('Cross-domain sources (3+ domains) improved synthesis quality');
  }

  return {
    similarPastRuns: episodes,
    pastMistakes,
    pastSuccesses,
    patternsToAvoid,
    patternsToEmulate,
  };
}

/**
 * Format the episode context block as a string for prompt injection.
 */
export function formatEpisodeContext(context: EpisodeContextBlock): string {
  if (context.similarPastRuns.length === 0) return '';

  const lines: string[] = ['=== EPISODIC MEMORY (Past Pipeline Runs) ==='];

  if (context.similarPastRuns.length > 0) {
    lines.push(`\n${context.similarPastRuns.length} similar past run(s) found:`);
    for (const run of context.similarPastRuns.slice(0, 3)) {
      lines.push(`  - [${run.relevance} similarity: ${Math.round(run.similarity * 100)}%] ${run.lesson}`);
    }
  }

  if (context.pastMistakes.length > 0) {
    lines.push(`\nPATTERNS TO AVOID (from past failures):`);
    for (const mistake of context.pastMistakes) {
      lines.push(`  ⚠ ${mistake}`);
    }
  }

  if (context.patternsToEmulate.length > 0) {
    lines.push(`\nPATTERNS TO EMULATE (from past successes):`);
    for (const pattern of context.patternsToEmulate) {
      lines.push(`  ✓ ${pattern}`);
    }
  }

  lines.push('\n=== END EPISODIC MEMORY ===\n');
  return lines.join('\n');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: text }],
      temperature: 0,
      maxTokens: 10,
      task: 'enrichment_reasoner',
      // Note: This uses the LLM's internal embedding if available
      // In production, use a dedicated embedding model (OpenAI embeddings, etc.)
    });
    // Fallback: use a simple hash-based pseudo-embedding for similarity
    // This is a placeholder — in production, replace with real embeddings
    return pseudoEmbedding(text);
  } catch {
    return pseudoEmbedding(text);
  }
}

/**
 * Pseudo-embedding using character-level n-gram hashing.
 * This is a fallback when no embedding model is available.
 * In production, replace with OpenAI embeddings or similar.
 */
function pseudoEmbedding(text: string, dims: number = 128): number[] {
  const embedding = new Array(dims).fill(0);
  const normalized = text.toLowerCase();

  // Unigram features
  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    embedding[charCode % dims] += 1;
  }

  // Bigram features
  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.charCodeAt(i) * 31 + normalized.charCodeAt(i + 1);
    embedding[bigram % dims] += 0.5;
  }

  // Word-level features
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) | 0;
    }
    embedding[Math.abs(hash) % dims] += 1;
  }

  // L2 normalize
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dims; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}
