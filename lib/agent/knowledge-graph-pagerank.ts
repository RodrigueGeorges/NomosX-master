/**
 * Knowledge Graph Multi-Hop Retrieval — NomosX Sprint 6 (Gap 5)
 *
 * Retrieval multi-hop sur le knowledge graph via Personalized PageRank.
 * Inspiré de :
 * - HippoRAG (OSU-NLP-Group, NeurIPS 2024, arxiv 2405.14831) — hippocampal indexing + PageRank
 * - LightRAG (HKUDS/LightRAG, EMNLP 2025) — dual-level retrieval
 * - GraphRAG (Microsoft, 2024) — community detection + global search
 *
 * Le problème :
 * Le retrieval NomosX sur le Knowledge Graph est *embedding cosine*. Pour les
 * questions multi-hop ("Quelles sont les chaînes causales entre X et Y ?"),
 * il faut traverser le graphe en suivant les relations.
 *
 * Architecture (HippoRAG-inspired) :
 * 1. Extraction des key concepts de la query
 * 2. Personalized PageRank depuis ces concepts sur le KG
 * 3. Récupération des concepts les plus influencés (multi-hop)
 * 4. Construction d'un sous-graphe d'évidence
 * 5. Retourne les concepts + relations + sources pour le raisonnement
 *
 * Intégration : ajoute un mode `graph-pagerank` à queryKnowledgeGraph().
 */

import { prisma } from '../db';
import { embedText, cosineSimilarity } from './semantic-engine';
import { createEvoMemKG, addToWorkingMemory, retrieveExperience, buildEvoMemKGInjection, type EvoMemKGState } from './knowledge-graph';

// ─── CatRAG-style Query-Aware Helpers (ACL 2026) ─────────────────────────────

const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'with', 'have', 'this', 'will', 'your', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were']);

function extractQueryTerms(query: string): string[] {
  const tokens = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 3 && !STOP_WORDS.has(t));
  return [...new Set(tokens)];
}

function nodeMatches(node: GraphNode, terms: string[]): number {
  const text = `${node.name} ${node.description} ${node.type}`.toLowerCase();
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function edgeMatches(edge: GraphEdge, from: GraphNode, to: GraphNode, terms: string[]): number {
  const text = `${edge.type} ${from.name} ${from.description} ${to.name} ${to.description}`.toLowerCase();
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string;
  confidence: number;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  type: string;
  strength: number;
  evidence: string[];
}

export interface MultiHopResult {
  /** Seed concepts (from the query) */
  seeds: GraphNode[];
  /** Concepts reached via multi-hop (ranked by PageRank score) */
  reached: Array<GraphNode & { pagerankScore: number; hopDistance: number }>;
  /** Edges traversed (the evidence chain) */
  edges: GraphEdge[];
  /** Sources supporting this chain */
  sourceIds: string[];
  /** The reasoning chain (human-readable) */
  reasoningChain: string;
  /** Cost in USD */
  costUsd: number;
}

export interface MultiHopConfig {
  /** Damping factor for PageRank (default: 0.85) */
  dampingFactor: number;
  /** Max iterations for PageRank (default: 100) */
  maxIterations: number;
  /** Convergence threshold (default: 1e-6) */
  convergenceThreshold: number;
  /** Max hop distance (default: 3) */
  maxHopDistance: number;
  /** Number of seed concepts (default: 5) */
  numSeeds: number;
  /** Number of results to return (default: 10) */
  topK: number;
  /** Min similarity to be a seed (default: 0.5) */
  minSeedSimilarity: number;
}

export const DEFAULT_MULTIHOP_CONFIG: MultiHopConfig = {
  dampingFactor: 0.85,
  maxIterations: 100,
  convergenceThreshold: 1e-6,
  maxHopDistance: 3,
  numSeeds: 5,
  topK: 10,
  minSeedSimilarity: 0.5,
};

// ─── Personalized PageRank ──────────────────────────────────────────────────

/**
 * Run Personalized PageRank on a graph.
 *
 * PageRank with personalization: instead of a uniform teleport distribution,
 * the teleport goes only to the seed nodes. This finds nodes that are
 * "close" to the seeds in the graph structure.
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges (directed)
 * @param seedIds - IDs of seed nodes (personalization vector)
 * @param config - PageRank config
 * @returns Map of node ID → PageRank score
 */
export function personalizedPageRank(
  nodes: GraphNode[],
  edges: GraphEdge[],
  seedIds: string[],
  config: MultiHopConfig = DEFAULT_MULTIHOP_CONFIG,
  query?: string,
): Map<string, number> {
  const n = nodes.length;
  if (n === 0) return new Map();

  const nodeIds = new Set(nodes.map(node => node.id));
  const seedSet = new Set(seedIds);
  const terms = query ? extractQueryTerms(query) : [];

  // Build adjacency list (outgoing edges)
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  const nodeById = new Map<string, GraphNode>();
  for (const node of nodes) {
    outEdges.set(node.id, []);
    inEdges.set(node.id, []);
    nodeById.set(node.id, node);
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)) {
      outEdges.get(edge.fromId)!.push(edge.toId);
      inEdges.get(edge.toId)!.push(edge.fromId);
    }
  }

  // CatRAG: pre-compute query-aware boosts for each edge
  const edgeBoost = new Map<string, number>();
  for (const edge of edges) {
    const from = nodeById.get(edge.fromId);
    const to = nodeById.get(edge.toId);
    if (!from || !to || !terms.length) {
      edgeBoost.set(`${edge.fromId}->${edge.toId}`, 1.0);
      continue;
    }
    const matches = edgeMatches(edge, from, to, terms);
    // Max boost ~2.5x for highly query-aligned edges
    edgeBoost.set(`${edge.fromId}->${edge.toId}`, 1.0 + Math.min(1.5, matches * 0.3));
  }

  // Initialize scores with symbolic anchoring: seeds that match query terms get more weight
  let scores = new Map<string, number>();
  const seedWeight = seedIds.length > 0 ? 1 / seedIds.length : 1 / n;

  for (const node of nodes) {
    const base = seedSet.has(node.id) ? seedWeight : 0;
    // Symbolic anchoring: boost seeds matching query terms
    const anchorBoost = seedSet.has(node.id) && terms.length ? 1.0 + Math.min(2.0, nodeMatches(node, terms) * 0.4) : 1.0;
    scores.set(node.id, base * anchorBoost);
  }

  // Normalize seeds after boosting
  const seedTotal = Array.from(scores.entries())
    .filter(([id]) => seedSet.has(id))
    .reduce((sum, [, score]) => sum + score, 0);
  if (seedTotal > 0) {
    for (const id of seedIds) {
      scores.set(id, (scores.get(id) || 0) / seedTotal);
    }
  }

  // Iterate
  for (let iter = 0; iter < config.maxIterations; iter++) {
    const newScores = new Map<string, number>();
    let maxDelta = 0;

    for (const node of nodes) {
      // PageRank formula with query-aware edge weighting
      let rank = (1 - config.dampingFactor) * (scores.get(node.id) || 0);

      // Add contributions from incoming edges
      const incoming = inEdges.get(node.id) || [];
      for (const sourceId of incoming) {
        const sourceScore = scores.get(sourceId) || 0;
        const sourceOutDeg = (outEdges.get(sourceId) || []).length;
        if (sourceOutDeg > 0) {
          // CatRAG dynamic edge weight: align with query terms
          const boost = edgeBoost.get(`${sourceId}->${node.id}`) || 1.0;
          // Normalize outgoing edge boosts so a high-degree node doesn't overflow
          const sourceEdges = (outEdges.get(sourceId) || []).map(t => edgeBoost.get(`${sourceId}->${t}`) || 1.0);
          const normalizer = sourceEdges.reduce((a, b) => a + b, 0);
          rank += config.dampingFactor * (sourceScore * boost) / normalizer;
        } else {
          // Dangling node: distribute to all seeds
          rank += config.dampingFactor * (sourceScore / seedIds.length) * (seedSet.has(node.id) ? 1 : 0);
        }
      }

      // Key-fact passage weight enhancement: boost reached nodes matching query terms
      if (terms.length && !seedSet.has(node.id)) {
        const matches = nodeMatches(node, terms);
        if (matches > 0) {
          rank *= 1.0 + Math.min(1.0, matches * 0.15);
        }
      }

      newScores.set(node.id, rank);
      const delta = Math.abs(rank - (scores.get(node.id) || 0));
      if (delta > maxDelta) maxDelta = delta;
    }

    scores = newScores;

    if (maxDelta < config.convergenceThreshold) {
      break;
    }
  }

  return scores;
}

// ─── Hop Distance Calculation (BFS) ─────────────────────────────────────────

/**
 * Calculate the hop distance from any seed to each node.
 * Used to know how many hops away each reached node is.
 */
export function calculateHopDistances(
  nodes: GraphNode[],
  edges: GraphEdge[],
  seedIds: string[],
): Map<string, number> {
  const distances = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    distances.set(node.id, Infinity);
  }
  for (const edge of edges) {
    adjacency.get(edge.fromId)?.push(edge.toId);
  }

  // BFS from all seeds
  const queue: string[] = [];
  for (const seedId of seedIds) {
    distances.set(seedId, 0);
    queue.push(seedId);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDist = distances.get(current) || 0;
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if ((distances.get(neighbor) || Infinity) > currentDist + 1) {
        distances.set(neighbor, currentDist + 1);
        queue.push(neighbor);
      }
    }
  }

  return distances;
}

// ─── Seed Extraction ────────────────────────────────────────────────────────

/**
 * Extract seed concepts from a query by finding the most similar concepts in the KG.
 */
async function extractSeeds(
  query: string,
  allConcepts: GraphNode[],
  config: MultiHopConfig,
): Promise<{ seeds: GraphNode[]; costUsd: number }> {
  if (allConcepts.length === 0) {
    return { seeds: [], costUsd: 0 };
  }

  try {
    const queryEmbedding = await embedText(query);

    // Compute similarity to all concepts
    const scored = await Promise.all(
      allConcepts.map(async (concept) => {
        // If concept has an embedding stored, use it
        // Otherwise, embed its name + description
        const conceptText = `${concept.name}. ${concept.description}`;
        const conceptEmbedding = await embedText(conceptText);
        const sim = cosineSimilarity(queryEmbedding, conceptEmbedding);
        return { concept, similarity: sim };
      })
    );

    // Filter by min similarity and take top N
    const seeds = scored
      .filter(s => s.similarity >= config.minSeedSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, config.numSeeds)
      .map(s => s.concept);

    return { seeds, costUsd: 0 };
  } catch (err) {
    console.warn('[MultiHop] seed extraction failed:', err);
    // Fallback: return first N concepts
    return { seeds: allConcepts.slice(0, config.numSeeds), costUsd: 0 };
  }
}

// ─── Main Multi-Hop Retrieval Function ──────────────────────────────────────

/**
 * Perform multi-hop retrieval on the knowledge graph.
 *
 * Flow:
 * 1. Extract seed concepts from the query (semantic match)
 * 2. Run Personalized PageRank from the seeds
 * 3. Calculate hop distances
 * 4. Return the top-K reached concepts with their PageRank scores
 * 5. Build a human-readable reasoning chain
 *
 * @param query - The multi-hop question (e.g., "What are the causal chains between X and Y?")
 * @param config - Multi-hop config
 * @returns The multi-hop result
 */
export async function multiHopRetrieve(
  query: string,
  partialConfig: Partial<MultiHopConfig> = {},
): Promise<MultiHopResult> {
  const config: MultiHopConfig = { ...DEFAULT_MULTIHOP_CONFIG, ...partialConfig };
  // Load all concepts and relations from the KG
  const [concepts, relations] = await Promise.all([
    loadAllConcepts(),
    loadAllRelations(),
  ]);

  if (concepts.length === 0) {
    return {
      seeds: [],
      reached: [],
      edges: [],
      sourceIds: [],
      reasoningChain: 'Knowledge graph is empty — no multi-hop retrieval possible.',
      costUsd: 0,
    };
  }

  // Step 1: Extract seeds
  const { seeds, costUsd } = await extractSeeds(query, concepts, config);

  if (seeds.length === 0) {
    return {
      seeds: [],
      reached: [],
      edges: [],
      sourceIds: [],
      reasoningChain: 'No seed concepts found for this query.',
      costUsd,
    };
  }

  const seedIds = seeds.map(s => s.id);

  // Step 2: Run Personalized PageRank (CatRAG query-aware)
  const pagerankScores = personalizedPageRank(concepts, relations, seedIds, config, query);

  // Step 3: Calculate hop distances
  const hopDistances = calculateHopDistances(concepts, relations, seedIds);

  // Step 4: Get top-K reached concepts (excluding seeds)
  const reached = concepts
    .filter(c => !seedIds.includes(c.id))
    .map(c => ({
      ...c,
      pagerankScore: pagerankScores.get(c.id) || 0,
      hopDistance: hopDistances.get(c.id) === Infinity ? -1 : (hopDistances.get(c.id) || 0),
    }))
    .filter(c => c.hopDistance > 0 && c.hopDistance <= config.maxHopDistance)
    .sort((a, b) => b.pagerankScore - a.pagerankScore)
    .slice(0, config.topK);

  // Step 5: Collect edges traversed (edges between seeds and reached nodes)
  const reachedIds = new Set(reached.map(r => r.id));
  const allReachableIds = new Set([...seedIds, ...reachedIds]);
  const traversedEdges = relations.filter(
    e => allReachableIds.has(e.fromId) && allReachableIds.has(e.toId)
  );

  // Step 6: Collect source IDs
  const sourceIds = new Set<string>();
  for (const edge of traversedEdges) {
    for (const ev of edge.evidence) {
      sourceIds.add(ev);
    }
  }

  // Step 7: Build reasoning chain
  const reasoningChain = buildReasoningChain(seeds, reached, traversedEdges);

  // K12: EvoMemKG — add retrieved triplets to working memory and retrieve experience
  let evoMemInjection = '';
  try {
    const evoState: EvoMemKGState = createEvoMemKG();
    // Convert traversed edges to triplets and add to working memory
    const triplets = traversedEdges.map(e => ({
      subject: e.fromId,
      predicate: e.type,
      object: e.toId,
    }));
    if (triplets.length > 0) {
      addToWorkingMemory(evoState, triplets);
      evoMemInjection = buildEvoMemKGInjection(evoState);
    }
  } catch (err) {
    // Non-blocking — EvoMemKG is an enhancement
  }

  return {
    seeds,
    reached,
    edges: traversedEdges,
    sourceIds: Array.from(sourceIds),
    reasoningChain: evoMemInjection ? `${reasoningChain}\n${evoMemInjection}` : reasoningChain,
    costUsd,
  };
}

// ─── Reasoning Chain Builder ────────────────────────────────────────────────

function buildReasoningChain(
  seeds: GraphNode[],
  reached: Array<GraphNode & { pagerankScore: number; hopDistance: number }>,
  edges: GraphEdge[],
): string {
  const parts: string[] = [];

  parts.push(`## Multi-Hop Reasoning Chain\n`);

  parts.push(`### Seed Concepts (from query)`);
  for (const seed of seeds) {
    parts.push(`- **${seed.name}** (${seed.type}): ${seed.description.slice(0, 100)}`);
  }

  parts.push(`\n### Reached Concepts (via Personalized PageRank)`);
  for (const r of reached.slice(0, 5)) {
    parts.push(`- **${r.name}** (${r.type}, hop ${r.hopDistance}, PR=${r.pagerankScore.toFixed(4)}): ${r.description.slice(0, 100)}`);
  }

  parts.push(`\n### Evidence Edges`);
  for (const edge of edges.slice(0, 10)) {
    const fromNode = [...seeds, ...reached].find(n => n.id === edge.fromId);
    const toNode = [...seeds, ...reached].find(n => n.id === edge.toId);
    if (fromNode && toNode) {
      parts.push(`- ${fromNode.name} —[${edge.type}]-> ${toNode.name} (strength: ${edge.strength.toFixed(2)})`);
    }
  }

  return parts.join('\n');
}

// ─── DB Loaders ─────────────────────────────────────────────────────────────

async function loadAllConcepts(): Promise<GraphNode[]> {
  try {
    const records = await prisma.conceptNode.findMany({
      take: 5000, // Limit for performance
    });

    return records.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description || '',
      confidence: r.confidence || 0,
    }));
  } catch (err) {
    console.warn('[MultiHop] Failed to load concepts:', err);
    return [];
  }
}

async function loadAllRelations(): Promise<GraphEdge[]> {
  try {
    const records = await prisma.conceptRelation.findMany({
      take: 10000, // Limit for performance
    });

    return records.map((r: any) => ({
      fromId: r.fromConceptId,
      toId: r.toConceptId,
      type: r.type,
      strength: r.strength || 0.5,
      evidence: r.evidence || [],
    }));
  } catch (err) {
    console.warn('[MultiHop] Failed to load relations:', err);
    return [];
  }
}

// ─── Utility: Check if a query is multi-hop ────────────────────────────────

/**
 * Heuristic to detect if a query requires multi-hop reasoning.
 * Multi-hop queries typically contain:
 * - "chains", "path", "connection between X and Y"
 * - "leads to", "causes", "results in"
 * - "what is the relationship between"
 * - Multiple entities that need to be connected
 */
export function isMultiHopQuery(query: string): boolean {
  const multiHopPatterns = [
    /\b(chain|path|connection|link)\s+(between|from|to)\b/i,
    /\b(relationship|relation)\s+between\b/i,
    /\b(leads\s+to|results\s+in|causes?|consequences?\s+of)\b/i,
    /\b(how\s+does\s+\w+\s+(affect|influence|impact))\b/i,
    /\b(what\s+are\s+the\s+steps?\s+from)\b/i,
    /\b(trace|follow|track)\s+(the|from|back)\b/i,
    /\b(multi.?hop|transitive|indirect)\b/i,
  ];

  return multiHopPatterns.some(pattern => pattern.test(query));
}
