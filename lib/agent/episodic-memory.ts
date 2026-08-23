/**
 * REMEM: Episodic Memory with Hybrid Graph (Gists + Facts)
 *
 * Based on: arXiv 2026 "REMem: Episodic Memory with Hybrid Graph for Long-Range
 * Reasoning in Agentic Systems"
 *
 * Maintains a hybrid memory graph with two types of nodes:
 * - **Gists**: Compressed summaries of events (with timestamps) — "what happened"
 * - **Facts**: Temporal triplets (subject, predicate, object, timestamp) — "what we know"
 *
 * Retrieval is agentic and iterative: the agent traverses the graph,
 * following edges to find related memories, and can request more retrieval
 * if the current context is insufficient.
 *
 * In NomosX, this replaces the simple vector-store agent-memory with a
 * graph-based episodic memory that can:
 * 1. Recall "the last time we analyzed a similar topic"
 * 2. Retrieve temporal facts (what was true at time T)
 * 3. Find related episodes via graph traversal
 *
 * Per the paper: +13.4% vs HippoRAG 2 on episodic reasoning benchmarks.
 */

export interface Gist {
  id: string;
  /** Compressed summary of the event */
  summary: string;
  /** Timestamp of the event */
  timestamp: number;
  /** The episode type (e.g., "pipeline_run", "analysis", "repair") */
  type: string;
  /** Key entities involved */
  entities: string[];
  /** Links to related gists */
  links: string[];
  /** Quality score of this episode (0-100) */
  qualityScore?: number;
}

export interface TemporalFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  /** When this fact was observed/recorded */
  timestamp: number;
  /** When this fact is valid (optional, for temporal reasoning) */
  validFrom?: number;
  validUntil?: number;
  /** Source of this fact */
  source?: string;
  /** Confidence (0-1) */
  confidence: number;
}

export interface EpisodicMemoryGraph {
  gists: Map<string, Gist>;
  facts: Map<string, TemporalFact>;
  /** Entity → gist IDs index */
  entityIndex: Map<string, string[]>;
  /** Entity → fact IDs index */
  factEntityIndex: Map<string, string[]>;
}

export interface EpisodicRetrievalResult {
  /** Relevant gists (episodes) */
  gists: Gist[];
  /** Relevant facts */
  facts: TemporalFact[];
  /** Why these were retrieved (trace) */
  retrievalTrace: string[];
  /** Whether more retrieval might help */
  needsMoreRetrieval: boolean;
}

/**
 * Create a new empty episodic memory graph.
 */
export function createEpisodicMemory(): EpisodicMemoryGraph {
  return {
    gists: new Map(),
    facts: new Map(),
    entityIndex: new Map(),
    factEntityIndex: new Map(),
  };
}

/**
 * Add a gist (episode summary) to the memory graph.
 */
export function addGist(
  graph: EpisodicMemoryGraph,
  gist: Omit<Gist, 'id'> & { id?: string },
): string {
  const id = gist.id || `gist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullGist: Gist = { ...gist, id, links: gist.links || [] };
  graph.gists.set(id, fullGist);

  // Update entity index
  for (const entity of gist.entities) {
    if (!graph.entityIndex.has(entity)) graph.entityIndex.set(entity, []);
    graph.entityIndex.get(entity)!.push(id);
  }

  return id;
}

/**
 * Add a temporal fact to the memory graph.
 */
export function addFact(
  graph: EpisodicMemoryGraph,
  fact: Omit<TemporalFact, 'id'> & { id?: string },
): string {
  const id = fact.id || `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullFact: TemporalFact = { ...fact, id };
  graph.facts.set(id, fullFact);

  // Update entity index
  for (const entity of [fact.subject, fact.object]) {
    if (!graph.factEntityIndex.has(entity)) graph.factEntityIndex.set(entity, []);
    graph.factEntityIndex.get(entity)!.push(id);
  }

  return id;
}

/**
 * Retrieve episodic memories relevant to a query.
 *
 * Uses agentic iterative retrieval:
 * 1. Find gists by entity match
 * 2. Find facts by entity match
 * 3. Follow links to find related gists
 * 4. Optionally request more retrieval if context is insufficient
 */
export function retrieveEpisodic(
  graph: EpisodicMemoryGraph,
  query: string,
  options: {
    maxGists?: number;
    maxFacts?: number;
    maxHops?: number;
    timeRange?: { from?: number; to?: number };
  } = {}
): EpisodicRetrievalResult {
  const { maxGists = 10, maxFacts = 20, maxHops = 2, timeRange } = options;

  const trace: string[] = [];
  const gistScores = new Map<string, number>();
  const factScores = new Map<string, number>();

  // Step 1: Extract entities from query (simple keyword extraction)
  const queryEntities = extractEntities(query);
  trace.push(`Extracted ${queryEntities.length} entities from query: ${queryEntities.slice(0, 5).join(', ')}`);

  // Step 2: Find gists by entity match
  for (const entity of queryEntities) {
    const gistIds = graph.entityIndex.get(entity) || [];
    for (const gid of gistIds) {
      const gist = graph.gists.get(gid);
      if (!gist) continue;
      if (timeRange) {
        if (timeRange.from && gist.timestamp < timeRange.from) continue;
        if (timeRange.to && gist.timestamp > timeRange.to) continue;
      }
      gistScores.set(gid, (gistScores.get(gid) || 0) + 1);
    }

    const factIds = graph.factEntityIndex.get(entity) || [];
    for (const fid of factIds) {
      const fact = graph.facts.get(fid);
      if (!fact) continue;
      if (timeRange) {
        if (timeRange.from && fact.timestamp < timeRange.from) continue;
        if (timeRange.to && fact.timestamp > timeRange.to) continue;
      }
      factScores.set(fid, (factScores.get(fid) || 0) + 1);
    }
  }

  trace.push(`Found ${gistScores.size} candidate gists, ${factScores.size} candidate facts`);

  // Step 3: Follow gist links (graph traversal)
  for (let hop = 0; hop < maxHops; hop++) {
    const currentGistIds = [...gistScores.keys()];
    for (const gid of currentGistIds) {
      const gist = graph.gists.get(gid);
      if (!gist) continue;
      for (const linkId of gist.links) {
        if (!gistScores.has(linkId)) {
          const linkedGist = graph.gists.get(linkId);
          if (linkedGist) {
            gistScores.set(linkId, (gistScores.get(gid) || 0) * 0.5); // Decay by hop
            trace.push(`Hop ${hop + 1}: followed link ${gid} → ${linkId}`);
          }
        }
      }
    }
  }

  // Step 4: Sort and select top results
  const sortedGists = [...gistScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxGists)
    .map(([id]) => graph.gists.get(id)!)
    .filter(Boolean);

  const sortedFacts = [...factScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxFacts)
    .map(([id]) => graph.facts.get(id)!)
    .filter(Boolean);

  // Determine if more retrieval might help
  const needsMoreRetrieval = sortedGists.length < 3 && sortedFacts.length < 5;

  return {
    gists: sortedGists,
    facts: sortedFacts,
    retrievalTrace: trace,
    needsMoreRetrieval,
  };
}

/**
 * Build a memory injection block from episodic retrieval results.
 *
 * This is injected into the pipeline context to provide past-run context.
 */
export function buildEpisodicMemoryInjection(result: EpisodicRetrievalResult): string {
  if (result.gists.length === 0 && result.facts.length === 0) return '';

  const lines: string[] = ['EPISODIC MEMORY (past run context):'];

  if (result.gists.length > 0) {
    lines.push('\nPast episodes:');
    for (const gist of result.gists.slice(0, 5)) {
      const date = new Date(gist.timestamp).toISOString().slice(0, 10);
      const quality = gist.qualityScore ? ` (quality: ${gist.qualityScore}/100)` : '';
      lines.push(`- [${date}] ${gist.type}: ${gist.summary}${quality}`);
    }
  }

  if (result.facts.length > 0) {
    lines.push('\nKnown facts:');
    for (const fact of result.facts.slice(0, 10)) {
      const date = new Date(fact.timestamp).toISOString().slice(0, 10);
      const conf = ` (conf: ${(fact.confidence * 100).toFixed(0)}%)`;
      lines.push(`- [${date}] ${fact.subject} ${fact.predicate} ${fact.object}${conf}`);
    }
  }

  return lines.join('\n');
}

/**
 * Extract entities from a query (simple keyword-based).
 */
function extractEntities(query: string): string[] {
  // Simple: extract capitalized words and key terms
  const words = query.split(/\s+/);
  const entities = new Set<string>();

  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length < 3) continue;
    // Capitalized words are likely entities
    if (clean[0] === clean[0].toUpperCase() && clean[0] !== clean[0].toLowerCase()) {
      entities.add(clean.toLowerCase());
    }
    // Common domain terms
    if (['policy', 'economic', 'climate', 'trade', 'security', 'health', 'technology', 'governance'].includes(clean.toLowerCase())) {
      entities.add(clean.toLowerCase());
    }
  }

  return [...entities];
}

// ── V3.1 BACKWARD COMPATIBILITY API ──────────────────────────────────────
// The pipeline-v2.ts imports these functions. We provide them here as
// thin wrappers around the new REMem API, backed by the database.

import { prisma } from '../db';

export interface EpisodeRecord {
  query: string;
  researchQuestion: string;
  sourceCount: number;
  providerDiversity: number;
  criticScore: number | null;
  criticVerdict: string | null;
  keyFindings: string[];
  mistakes: string[];
  successes: string[];
  domains: string[];
  durationMs: number;
  costUsd: number;
  briefId: string;
}

export interface RetrievedEpisode {
  episode: {
    query: string;
    criticScore: number | null;
    sourceCount: number;
    providerDiversity: number;
    durationMs: number;
    domains: string[];
  };
  lesson: string;
  similarity: number;
}

/**
 * Retrieve past episodes relevant to a query.
 * Uses database-backed search with simple text similarity.
 */
export async function retrieveEpisodes(
  query: string,
  options: { limit?: number; minSimilarity?: number } = {}
): Promise<RetrievedEpisode[]> {
  const { limit = 5, minSimilarity = 0.5 } = options;

  try {
    // Search past briefs with similar queries
    const pastBriefs = await prisma.brief.findMany({
      where: {
        kind: { in: ['brief', 'strategic'] },
        question: { contains: query.slice(0, 50) },
      },
      take: limit * 2,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        question: true,
        trustScore: true,
        qualityScore: true,
        createdAt: true,
      },
    });

    const episodes: RetrievedEpisode[] = [];
    for (const brief of pastBriefs) {
      const similarity = computeQuerySimilarity(query, brief.question || '');
      if (similarity >= minSimilarity) {
        const lesson = brief.trustScore && brief.trustScore >= 75
          ? `Past run on "${brief.question.slice(0, 60)}" achieved trust ${brief.trustScore} — strategy was effective`
          : `Past run on "${brief.question.slice(0, 60)}" achieved trust ${brief.trustScore} — consider alternative approach`;

        episodes.push({
          episode: {
            query: brief.question || '',
            criticScore: brief.qualityScore,
            sourceCount: 0,
            providerDiversity: 0,
            durationMs: 0,
            domains: [],
          },
          lesson,
          similarity,
        });
      }
    }

    return episodes.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Build a context block from retrieved episodes.
 */
export function buildEpisodeContextBlock(episodes: RetrievedEpisode[]): string {
  if (episodes.length === 0) return '';
  const lines = episodes.map((e, i) =>
    `[${i + 1}] Past run: "${e.episode.query.slice(0, 80)}" (trust: ${e.episode.criticScore ?? 'N/A'}, similarity: ${(e.similarity * 100).toFixed(0)}%) — ${e.lesson}`
  );
  return `PAST EPISODES:\n${lines.join('\n')}`;
}

/**
 * Format episode context for injection.
 */
export function formatEpisodeContext(contextBlock: string): string {
  return contextBlock;
}

/**
 * Store an episode for future retrieval.
 */
export async function storeEpisode(record: EpisodeRecord): Promise<void> {
  try {
    // Store as an AgentAuditLog entry
    await prisma.agentAuditLog.create({
      data: {
        agent: 'episodic-memory',
        action: 'EPISODE_STORED',
        metadata: JSON.stringify(record),
      },
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Simple query similarity (Jaccard on words).
 */
function computeQuerySimilarity(q1: string, q2: string): number {
  const words1 = new Set(q1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(q2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  return union > 0 ? intersection / union : 0;
}
