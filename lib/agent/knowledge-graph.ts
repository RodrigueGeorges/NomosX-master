/**
 * NomosX KNOWLEDGE GRAPH — Concept Store & Longitudinal Memory
 * 
 * A pgvector-backed concept store that tracks knowledge across briefs:
 * 
 * 1. Extracts key concepts from each analysis (entities, claims, relationships)
 * 2. Stores concept embeddings for semantic retrieval
 * 3. Links concepts to sources, briefs, and other concepts
 * 4. Tracks concept evolution over time (longitudinal tracking)
 * 5. Detects emerging themes and shifting consensus
 * 6. Provides "institutional memory" — the system remembers what it has learned
 * 
 * This is what makes NomosX a persistent think tank, not a stateless tool.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { captureInputFifo } from './frozen-inputs';
import { parseJson } from './json-utils';
import { AgentRole, assertPermission } from '../governance/index';
import { embedText, embedBatch, cosineSimilarity } from './semantic-engine';
import { recordTemporalFact } from './temporal-memory';
import { multiHopRetrieve, isMultiHopQuery } from './knowledge-graph-pagerank';
import { beamSearch, rankPaths, extractReasoningChain, DEFAULT_PATH_CONFIG, type KGPath, type KGEdge } from './pathmind-kg';

// ============================================================================
// TYPES
// ============================================================================

export interface Concept {
  id?: string;
  name: string;
  type: ConceptType;
  description: string;
  embedding?: number[];
  confidence: number;          // 0-100
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
  sourceIds: string[];
  briefIds: string[];
  relatedConcepts: string[];   // Concept IDs
  metadata: Record<string, any>;
}

export type ConceptType =
  | "entity"          // Named entity (person, org, place)
  | "claim"           // Factual assertion
  | "theory"          // Theoretical framework
  | "method"          // Research methodology
  | "finding"         // Empirical finding
  | "policy"          // Policy recommendation
  | "trend"           // Emerging trend
  | "controversy";    // Active debate

export interface ConceptRelation {
  fromConceptId: string;
  toConceptId: string;
  type: RelationType;
  strength: number;            // 0-1
  evidence: string[];          // Source IDs supporting this relation
}

export type RelationType =
  | "supports"
  | "contradicts"
  | "extends"
  | "precedes"
  | "causes"
  | "correlates"
  | "part_of"
  | "instance_of";

export interface ConceptExtractionResult {
  concepts: Concept[];
  relations: ConceptRelation[];
  costUsd: number;
}

export interface KnowledgeQueryResult {
  concepts: Array<Concept & { similarity: number }>;
  relatedBriefs: string[];
  timeline: Array<{ date: Date; event: string; conceptId: string }>;
}

export interface LongitudinalInsight {
  concept: string;
  trend: "emerging" | "stable" | "declining" | "contested";
  confidenceTrajectory: number[];  // Over time
  briefCount: number;
  firstMention: Date;
  latestMention: Date;
  summary: string;
}

// ============================================================================
// CONCEPT EXTRACTION
// ============================================================================

/**
 * Extract concepts from an analysis output and store them in the knowledge graph.
 */
export async function extractAndStoreConcepts(
  briefId: string,
  question: string,
  analysisText: string,
  sourceIds: string[],
  useTemporalMemory = false,
): Promise<ConceptExtractionResult> {
  assertPermission(AgentRole.ANALYST, "write:analysis");
  console.log(`[KNOWLEDGE] Extracting concepts from brief ${briefId}`);

  let costUsd = 0;

  // ── STEP 1: LLM extraction ──
  // Post-publish learning: prompt embeds the final html + accumulated KG
  // state — freeze the response for record/replay parity (FIFO per batch).
  const extractResponse = await captureInputFifo('learning:kg-extract', () => callLLM({
    messages: [{
      role: "system",
      content: `You are a knowledge engineer extracting structured concepts from research analysis. Extract the most important entities, claims, theories, methods, findings, policies, trends, and controversies. Be precise and avoid duplicates.`
    }, {
      role: "user",
      content: `RESEARCH QUESTION: ${question}

ANALYSIS (first 4000 chars):
${analysisText.slice(0, 4000)}

Extract key concepts and their relationships. For each concept provide:
- name: Short canonical name
- type: entity|claim|theory|method|finding|policy|trend|controversy
- description: 1-2 sentence description
- confidence: 0-100 (how well-supported by evidence)

For relationships between concepts:
- type: supports|contradicts|extends|precedes|causes|correlates|part_of|instance_of
- strength: 0-1

Return JSON:
{
  "concepts": [
    { "name": "...", "type": "...", "description": "...", "confidence": 80 }
  ],
  "relations": [
    { "from": "concept name 1", "to": "concept name 2", "type": "supports", "strength": 0.8 }
  ]
}`
    }],
    temperature: 0.15,
    jsonMode: true,
    maxTokens: 3000,
    enableCache: true,
    task: 'reader_v3',
  }));

  costUsd += extractResponse.costUsd;
  const extracted = parseJson<any>(extractResponse.content) ?? { concepts: [], relations: [] };

  // ── STEP 2: Embed concept descriptions ──
  const descriptions = (extracted.concepts || []).map((c: any) => `${c.name}: ${c.description}`);
  let embeddings: number[][] = [];
  try {
    if (descriptions.length > 0) {
      embeddings = await embedBatch(descriptions);
    }
  } catch (err) {
    console.warn(`[KNOWLEDGE] Embedding failed (continuing without):`, err);
  }

  // ── STEP 3: Deduplicate against existing concepts ──
  const now = new Date();
  const concepts: Concept[] = [];

  for (let i = 0; i < (extracted.concepts || []).length; i++) {
    const raw = extracted.concepts[i];
    const embedding = embeddings[i] || undefined;

    // Check for existing similar concept
    let existingConcept: any = null;
    if (embedding) {
      existingConcept = await findSimilarConcept(raw.name, embedding, 0.85);
    }

    if (existingConcept) {
      // Update existing concept
      // Prisma push on String[] only accepts a single value, not an array.
      // Merge existing + new sourceIds and deduplicate.
      const existingSourceIds = (existingConcept.sourceIds as string[]) || [];
      const existingBriefIds = (existingConcept.briefIds as string[]) || [];
      const mergedSourceIds = [...new Set([...existingSourceIds, ...sourceIds])];
      const mergedBriefIds = [...new Set([...existingBriefIds, briefId])];

      const updated = await prisma.conceptNode.update({
        where: { id: existingConcept.id },
        data: {
          lastSeen: now,
          occurrenceCount: { increment: 1 },
          sourceIds: { set: mergedSourceIds },
          briefIds: { set: mergedBriefIds },
          confidence: Math.round((existingConcept.confidence + (raw.confidence || 70)) / 2),
        },
      });
      concepts.push(mapPrismaToConcept(updated));
      console.log(`[KNOWLEDGE] Updated existing concept: "${raw.name}" (${updated.occurrenceCount} occurrences)`);

      if (useTemporalMemory) {
        await recordTemporalFact({
          claim: raw.description || raw.name,
          domain: question.slice(0, 80),
          conceptIds: [updated.id],
          sourceIds,
          confidence: raw.confidence || 70,
          briefId,
        }).catch(err => console.warn('[TEMPORAL MEMORY] record failed:', err));
      }
    } else {
      // Create new concept
      try {
        const created = await prisma.conceptNode.create({
          data: {
            name: raw.name,
            type: raw.type || "finding",
            description: raw.description || "",
            embedding: embedding || [],
            confidence: raw.confidence || 70,
            firstSeen: now,
            lastSeen: now,
            occurrenceCount: 1,
            sourceIds: sourceIds,
            briefIds: [briefId],
            relatedConcepts: [],
            metadata: {},
          },
        });
        concepts.push(mapPrismaToConcept(created));
        console.log(`[KNOWLEDGE] Created new concept: "${raw.name}" (${raw.type})`);

        if (useTemporalMemory) {
          await recordTemporalFact({
            claim: raw.description || raw.name,
            domain: question.slice(0, 80),
            conceptIds: [created.id],
            sourceIds,
            confidence: raw.confidence || 70,
            briefId,
          }).catch(err => console.warn('[TEMPORAL MEMORY] record failed:', err));
        }
      } catch (err) {
        console.warn(`[KNOWLEDGE] Failed to create concept "${raw.name}":`, err);
      }
    }
  }

  // ── STEP 4: Store relations ──
  const relations: ConceptRelation[] = [];
  for (const rel of (extracted.relations || [])) {
    const fromConcept = concepts.find(c => c.name === rel.from);
    const toConcept = concepts.find(c => c.name === rel.to);
    if (fromConcept?.id && toConcept?.id) {
      try {
        await prisma.conceptRelation.upsert({
          where: {
            fromConceptId_toConceptId_type: {
              fromConceptId: fromConcept.id,
              toConceptId: toConcept.id,
              type: rel.type,
            },
          },
          update: {
            strength: rel.strength || 0.5,
            evidence: { push: sourceIds },
          },
          create: {
            fromConceptId: fromConcept.id,
            toConceptId: toConcept.id,
            type: rel.type,
            strength: rel.strength || 0.5,
            evidence: sourceIds,
          },
        });
        relations.push({
          fromConceptId: fromConcept.id,
          toConceptId: toConcept.id,
          type: rel.type,
          strength: rel.strength || 0.5,
          evidence: sourceIds,
        });
      } catch (err) {
        console.warn(`[KNOWLEDGE] Failed to store relation ${rel.from} → ${rel.to}:`, err);
      }
    }
  }

  console.log(`[KNOWLEDGE] ✅ Extracted ${concepts.length} concepts, ${relations.length} relations, cost=$${costUsd.toFixed(4)}`);

  return { concepts, relations, costUsd };
}

// ============================================================================
// SEMANTIC QUERY
// ============================================================================

/**
 * Query the knowledge graph semantically.
 */
export async function queryKnowledgeGraph(
  query: string,
  options: { limit?: number; minSimilarity?: number; types?: ConceptType[] } = {}
): Promise<KnowledgeQueryResult> {
  const { limit = 20, minSimilarity = 0.6, types } = options;

  console.log(`[KNOWLEDGE] Querying: "${query.slice(0, 60)}..."`);

  // Embed query
  const queryEmbedding = await embedText(query);

  // Fetch all concepts (with optional type filter)
  const where: any = {};
  if (types?.length) {
    where.type = { in: types };
  }

  const allConcepts = await prisma.conceptNode.findMany({
    where,
    orderBy: { occurrenceCount: "desc" },
    take: 500, // Cap for performance
  });

  // Compute similarities
  const scored = allConcepts
    .map(c => ({
      ...mapPrismaToConcept(c),
      similarity: c.embedding?.length ? cosineSimilarity(queryEmbedding, c.embedding as number[]) : 0,
    }))
    .filter(c => c.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  // ── HippoRAG 2 multi-hop extension for multi-hop / causal queries ──
  if (isMultiHopQuery(query)) {
    try {
      const hopResult = await multiHopRetrieve(query, { topK: limit, numSeeds: 5, maxHopDistance: 3 });
      if (hopResult.reached.length > 0) {
        const reachedIds = new Set(hopResult.reached.map(r => r.id).filter((id): id is string => !!id));
        const reachedConcepts = hopResult.reached.map(r => {
          const full = allConcepts.find(c => c.id === r.id);
          const base = full
            ? mapPrismaToConcept(full)
            : {
                id: r.id,
                name: r.name,
                type: r.type as ConceptType,
                description: r.description || '',
                embedding: undefined,
                confidence: r.confidence || 0,
                firstSeen: new Date(),
                lastSeen: new Date(),
                occurrenceCount: 0,
                sourceIds: [],
                briefIds: [],
                relatedConcepts: [],
                metadata: {},
              };
          return {
            ...base,
            similarity: r.pagerankScore, // use PPR score as relevance proxy
            hopDistance: r.hopDistance,
          };
        }).filter(c => !reachedIds.has(c.id ?? '')); // include all reached

        // Merge without duplicates, prioritizing higher PPR score
        const mergedById = new Map<string, any>();
        for (const c of scored) mergedById.set(c.id ?? '', c);
        for (const c of reachedConcepts) {
          const existing = mergedById.get(c.id || '');
          if (!existing || (c.similarity > existing.similarity)) {
            mergedById.set(c.id || '', c);
          }
        }
        const merged = Array.from(mergedById.values())
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, limit);

        const mergedBriefs = [...new Set(merged.flatMap(c => c.briefIds || []))];
        const mergedTimeline = merged.map(c => ({
          date: c.firstSeen,
          event: `First mention of "${c.name}" (${c.type})`,
          conceptId: c.id || "",
        })).sort((a, b) => a.date.getTime() - b.date.getTime());

        console.log(`[KNOWLEDGE] Multi-hop HippoRAG: ${hopResult.reached.length} reached, merged to ${merged.length} concepts`);
        return { concepts: merged, relatedBriefs: mergedBriefs, timeline: mergedTimeline };
      }
    } catch (err) {
      console.warn(`[KNOWLEDGE] Multi-hop retrieval failed (falling back to vector):`, err);
    }
  }

  // Collect related briefs
  const relatedBriefs = [...new Set(scored.flatMap(c => c.briefIds))];

  // Build timeline
  const timeline = scored.map(c => ({
    date: c.firstSeen,
    event: `First mention of "${c.name}" (${c.type})`,
    conceptId: c.id || "",
  })).sort((a, b) => a.date.getTime() - b.date.getTime());

  console.log(`[KNOWLEDGE] Found ${scored.length} relevant concepts across ${relatedBriefs.length} briefs`);

  return { concepts: scored, relatedBriefs, timeline };
}

// ============================================================================
// LONGITUDINAL TRACKING
// ============================================================================

/**
 * Analyze how concepts have evolved over time.
 */
export async function getLongitudinalInsights(
  options: { minOccurrences?: number; types?: ConceptType[]; limit?: number } = {}
): Promise<LongitudinalInsight[]> {
  const { minOccurrences = 2, types, limit = 20 } = options;

  const where: any = { occurrenceCount: { gte: minOccurrences } };
  if (types?.length) where.type = { in: types };

  const concepts = await prisma.conceptNode.findMany({
    where,
    orderBy: { occurrenceCount: "desc" },
    take: limit,
  });

  const insights: LongitudinalInsight[] = concepts.map(c => {
    const daysSinceFirst = (Date.now() - new Date(c.firstSeen).getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceLast = (Date.now() - new Date(c.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
    const velocity = c.occurrenceCount / Math.max(daysSinceFirst, 1);

    let trend: LongitudinalInsight["trend"];
    if (daysSinceLast > 30 && velocity < 0.05) {
      trend = "declining";
    } else if (velocity > 0.3) {
      trend = "emerging";
    } else if (c.confidence < 50) {
      trend = "contested";
    } else {
      trend = "stable";
    }

    return {
      concept: c.name,
      trend,
      confidenceTrajectory: [c.confidence], // Simplified — full history would need a separate table
      briefCount: (c.briefIds as string[])?.length || 0,
      firstMention: new Date(c.firstSeen),
      latestMention: new Date(c.lastSeen),
      summary: `"${c.name}" (${c.type}) — ${trend}, seen ${c.occurrenceCount} times across ${(c.briefIds as string[])?.length || 0} briefs, confidence ${c.confidence}%`,
    };
  });

  console.log(`[KNOWLEDGE] Longitudinal insights: ${insights.length} tracked concepts`);
  return insights;
}

// ============================================================================
// HELPERS
// ============================================================================

async function findSimilarConcept(
  name: string,
  embedding: number[],
  threshold: number
): Promise<any | null> {
  // First try exact name match
  const exactMatch = await prisma.conceptNode.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (exactMatch) return exactMatch;

  // Then try semantic similarity
  const candidates = await prisma.conceptNode.findMany({
    take: 50,
    orderBy: { occurrenceCount: "desc" },
  });

  for (const c of candidates) {
    if (c.embedding?.length) {
      const sim = cosineSimilarity(embedding, c.embedding as number[]);
      if (sim >= threshold) return c;
    }
  }

  return null;
}

function mapPrismaToConcept(row: any): Concept {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ConceptType,
    description: row.description || "",
    embedding: row.embedding as number[] | undefined,
    confidence: row.confidence || 0,
    firstSeen: new Date(row.firstSeen),
    lastSeen: new Date(row.lastSeen),
    occurrenceCount: row.occurrenceCount || 0,
    sourceIds: (row.sourceIds as string[]) || [],
    briefIds: (row.briefIds as string[]) || [],
    relatedConcepts: (row.relatedConcepts as string[]) || [],
    metadata: (row.metadata as Record<string, any>) || {},
  };
}

// ============================================================================
// K12: EvoMemKG — Dual-Layer Evolvable Memory for Multi-Hop KG Reasoning
// ACL 2026 (Tian et al.) — "An Evolvable Memory Agent for Multi-hop Knowledge
// Graph Reasoning"
// ============================================================================
//
// Standard KG reasoning uses static memory that fails to address the
// combinatorial explosion of search spaces in multi-hop reasoning. EvoMemKG
// introduces a dual-layer memory architecture:
//
//   1. Working Memory: losslessly compresses retrieved triplets through
//      clustering to manage exploration states, effectively linearizing the
//      exponential state space expansion.
//
//   2. Experience Memory: abstracts historical reasoning paths into reusable,
//      generalized strategies, enabling cross-task knowledge transfer and
//      self-evolution.
//
// Result (paper): +20% improvement over strong baseline on complex multi-hop
// queries, achieving SOTA without additional training.

export interface WorkingMemoryCluster {
  /** Cluster centroid concept */
  centroid: string;
  /** Concepts in this cluster */
  members: string[];
  /** Compressed representation of the cluster */
  summary: string;
  /** Relations within this cluster */
  relations: Array<{ from: string; to: string; type: string }>;
  /** When this cluster was created/updated */
  updatedAt: number;
}

export interface ExperienceMemoryEntry {
  /** The generalized strategy description */
  strategy: string;
  /** The reasoning path that led to this strategy */
  sourcePath: string[];
  /** How many times this strategy was successfully reused */
  reuseCount: number;
  /** Average success rate when using this strategy */
  successRate: number;
  /** Domains where this strategy was applied */
  domains: string[];
  /** When this experience was recorded */
  createdAt: number;
}

export interface EvoMemKGState {
  /** Working memory: compressed clusters of retrieved triplets */
  workingMemory: WorkingMemoryCluster[];
  /** Experience memory: generalized reasoning strategies */
  experienceMemory: ExperienceMemoryEntry[];
  /** Maximum working memory clusters (LRU eviction) */
  maxWorkingClusters: number;
  /** Maximum experience memory entries */
  maxExperienceEntries: number;
}

/**
 * Create a new EvoMemKG state.
 */
export function createEvoMemKG(
  maxWorkingClusters: number = 20,
  maxExperienceEntries: number = 50,
): EvoMemKGState {
  return {
    workingMemory: [],
    experienceMemory: [],
    maxWorkingClusters,
    maxExperienceEntries,
  };
}

/**
 * Add retrieved triplets to working memory, compressing them via clustering.
 *
 * Instead of storing every individual triplet (which causes exponential blowup
 * in multi-hop reasoning), we cluster related triplets together and store a
 * compressed summary. This linearizes the state space.
 */
export function addToWorkingMemory(
  state: EvoMemKGState,
  triplets: Array<{ subject: string; predicate: string; object: string }>,
): void {
  // Group triplets by subject similarity
  const bySubject = new Map<string, Array<{ subject: string; predicate: string; object: string }>>();
  for (const t of triplets) {
    const key = t.subject.toLowerCase().slice(0, 30);
    const existing = bySubject.get(key) || [];
    existing.push(t);
    bySubject.set(key, existing);
  }

  // Create or update clusters
  for (const [key, triplets] of bySubject) {
    const existingCluster = state.workingMemory.find(c =>
      c.centroid.toLowerCase().slice(0, 30) === key
    );

    const relations = triplets.map(t => ({ from: t.subject, to: t.object, type: t.predicate }));
    const members = [...new Set(triplets.flatMap(t => [t.subject, t.object]))];
    const summary = `${triplets[0].subject}: ${triplets.map(t => `${t.predicate}→${t.object}`).join('; ')}`;

    if (existingCluster) {
      // Merge into existing cluster
      existingCluster.members = [...new Set([...existingCluster.members, ...members])];
      existingCluster.relations = [...existingCluster.relations, ...relations];
      existingCluster.summary = summary;
      existingCluster.updatedAt = Date.now();
    } else {
      state.workingMemory.push({
        centroid: triplets[0].subject,
        members,
        relations,
        summary,
        updatedAt: Date.now(),
      });
    }
  }

  // LRU eviction: keep only the most recently updated clusters
  state.workingMemory.sort((a, b) => b.updatedAt - a.updatedAt);
  if (state.workingMemory.length > state.maxWorkingClusters) {
    state.workingMemory = state.workingMemory.slice(0, state.maxWorkingClusters);
  }
}

/**
 * Abstract a reasoning path into a generalized strategy and store it in
 * experience memory.
 *
 * Given a successful multi-hop reasoning path (e.g., A → B → C → D),
 * extract the pattern (e.g., "Follow 'causes' relations then 'correlates'
// relations to find indirect effects") and store it for future reuse.
 */
export function recordExperience(
  state: EvoMemKGState,
  reasoningPath: string[],
  success: boolean,
  domain: string,
): void {
  if (reasoningPath.length < 2) return;

  // Generalize the path: extract relation types instead of specific concepts
  const relationPattern = reasoningPath
    .map(step => {
      // Extract relation type from step (e.g., "A causes B" → "causes")
      const match = step.match(/\b(\w+)\s+(?:→|->|leads to|causes|correlates with|contradicts|supports|extends)\b/i);
      return match ? match[1] : 'unknown';
    })
    .filter(r => r !== 'unknown');

  if (relationPattern.length === 0) return;

  const strategy = `Follow ${relationPattern.join(' → ')} relation pattern for ${domain}`;
  const existing = state.experienceMemory.find(e => e.strategy === strategy);

  if (existing) {
    existing.reuseCount++;
    existing.successRate = (existing.successRate * (existing.reuseCount - 1) + (success ? 1 : 0)) / existing.reuseCount;
    if (!existing.domains.includes(domain)) {
      existing.domains.push(domain);
    }
  } else {
    state.experienceMemory.push({
      strategy,
      sourcePath: reasoningPath,
      reuseCount: 1,
      successRate: success ? 1 : 0,
      domains: [domain],
      createdAt: Date.now(),
    });

    // Sort by reuseCount * successRate and keep top N
    state.experienceMemory.sort((a, b) => b.reuseCount * b.successRate - a.reuseCount * a.successRate);
    if (state.experienceMemory.length > state.maxExperienceEntries) {
      state.experienceMemory = state.experienceMemory.slice(0, state.maxExperienceEntries);
    }
  }
}

/**
 * Retrieve relevant experience for a new reasoning task.
 * Returns the top-k strategies that match the domain and relation pattern.
 */
export function retrieveExperience(
  state: EvoMemKGState,
  domain: string,
  relationHint?: string[],
  topK: number = 5,
): ExperienceMemoryEntry[] {
  let candidates = state.experienceMemory.filter(e => e.domains.includes(domain));

  if (relationHint && relationHint.length > 0) {
    // Prefer strategies that match the relation pattern
    const matching = candidates.filter(e =>
      relationHint.some(r => e.strategy.includes(r))
    );
    if (matching.length > 0) {
      candidates = matching;
    }
  }

  return candidates
    .sort((a, b) => b.reuseCount * b.successRate - a.reuseCount * a.successRate)
    .slice(0, topK);
}

/**
 * Build a prompt injection from EvoMemKG state for multi-hop reasoning.
 */
export function buildEvoMemKGInjection(state: EvoMemKGState): string {
  const parts: string[] = [];

  if (state.workingMemory.length > 0) {
    parts.push('=== WORKING MEMORY (compressed knowledge clusters) ===');
    for (const cluster of state.workingMemory.slice(0, 10)) {
      parts.push(`- ${cluster.summary.slice(0, 150)}`);
    }
    parts.push('=== END WORKING MEMORY ===');
  }

  const experiences = state.experienceMemory.slice(0, 5);
  if (experiences.length > 0) {
    parts.push('=== PAST REASONING STRATEGIES (from experience memory) ===');
    for (const exp of experiences) {
      parts.push(`- [${exp.reuseCount}x, ${(exp.successRate * 100).toFixed(0)}% success] ${exp.strategy.slice(0, 120)}`);
    }
    parts.push('=== END STRATEGIES ===');
  }

  return parts.length > 0 ? `\n${parts.join('\n')}\n` : '';
}

// ============================================================================
// S16-07: PathMind — Multi-hop path reasoning over the knowledge graph
// ============================================================================

/**
 * Use PathMind's beam search to find reasoning paths between two entities in
 * the knowledge graph. Paths are ranked by A*-style priority and the top-3
 * are converted into a natural-language reasoning chain.
 *
 * @param startNode - The starting entity name
 * @param targetNode - The target entity name
 * @param adjacencyList - KG adjacency list mapping nodes to their outgoing edges
 * @returns Ranked paths and a natural-language reasoning chain
 */
export function reasonWithPathMind(
  startNode: string,
  targetNode: string,
  adjacencyList: Map<string, KGEdge[]>,
): { paths: KGPath[]; reasoningChain: string } {
  const paths = beamSearch(startNode, targetNode, adjacencyList, DEFAULT_PATH_CONFIG);
  const ranked = rankPaths(paths);
  const chain = extractReasoningChain(ranked.slice(0, 3));
  return { paths: ranked, reasoningChain: chain };
}
