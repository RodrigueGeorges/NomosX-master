/**
 * PathMind — Retrieve-Prioritize-Reason KG Reasoning — NomosX
 *
 * Inspired by:
 * - PathMind (AAAI 2026, S15-10): Retrieve-Prioritize-Reason framework for
 *   knowledge-graph reasoning with semantic-aware path priority. Combines
 *   A*-style cost + future-cost estimation with beam search to produce
 *   high-quality reasoning chains. Enhances EvoMemKG (K12) by adding
 *   priority-driven path selection over the knowledge graph.
 *
 * Architecture:
 * - pathPriority(): semantic-aware priority = costWeight * cost +
 *   futureCostWeight * estimatedFutureCost (lower = better, A*-style).
 * - beamSearch(): beam search over a KG adjacency list using the priority
 *   function, returning the top-k paths between two nodes.
 * - rankPaths(): ranks a set of paths by priority.
 * - extractReasoningChain(): converts the best paths into a natural-language
 *   reasoning chain usable by downstream reasoning modules.
 *
 * Integration:
 * - knowledge-graph.ts (EvoMemKG): path retrieval backend for multi-hop queries
 * - analyst-multipass.ts: reasoning chain injection for multi-hop analysis
 * - relevance-scorer.ts (CARE): multi-hop potential scoring
 *
 * Notes:
 * - Pure TypeScript, no external dependencies.
 * - No `any` types — fully typed.
 * - Self-contained graph utilities.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** A directed edge in the knowledge graph adjacency list. */
export interface KGEdge {
  /** Target node of the edge. */
  node: string;
  /** Relation label describing the edge semantics. */
  relation: string;
  /** Edge weight (e.g. confidence or distance). Lower is cheaper. */
  weight: number;
}

/** A complete path through the knowledge graph. */
export interface KGPath {
  /** Ordered list of node identifiers visited by the path. */
  nodes: string[];
  /** Edges traversed by the path, with weights. */
  edges: Array<{ from: string; to: string; relation: string; weight: number }>;
  /** Accumulated cost of the path (sum of edge weights). */
  cost: number;
  /** Heuristic estimate of the remaining cost to the target. */
  estimatedFutureCost: number;
}

/** Configuration for path priority and beam search. */
export interface PathPriorityConfig {
  /** Maximum number of paths to return. */
  maxPaths: number;
  /** Beam width for beam search. */
  beamWidth: number;
  /** Weight applied to the accumulated cost in the priority function. */
  costWeight: number;
  /** Weight applied to the estimated future cost in the priority function. */
  futureCostWeight: number;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_PATH_CONFIG: PathPriorityConfig = {
  maxPaths: 5,
  beamWidth: 8,
  costWeight: 1.0,
  futureCostWeight: 1.5,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * A partial path under exploration during beam search.
 */
interface BeamPath {
  nodes: string[];
  edges: Array<{ from: string; to: string; relation: string; weight: number }>;
  cost: number;
  visited: Set<string>;
}

/**
 * Heuristic estimate of the future cost from a node to the target.
 *
 * In a pure graph without coordinates we use a lightweight semantic heuristic:
 * if the current node shares no token with the target, we assume a higher
 * future cost. This keeps PathMind self-contained while still being
 * semantic-aware (per the PathMind paper).
 */
function estimateFutureCost(currentNode: string, targetNode: string): number {
  if (currentNode === targetNode) return 0;

  const currentTokens = new Set(
    currentNode
      .toLowerCase()
      .split(/[\s_\-]+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length > 0)
  );
  const targetTokens = new Set(
    targetNode
      .toLowerCase()
      .split(/[\s_\-]+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length > 0)
  );

  let overlap = 0;
  for (const token of currentTokens) {
    if (targetTokens.has(token)) overlap++;
  }

  const union = currentTokens.size + targetTokens.size - overlap;
  if (union === 0) return 2; // No signal → conservative estimate.
  const jaccard = overlap / union;
  // Higher semantic overlap → lower estimated future cost.
  return 2 * (1 - jaccard);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute the semantic-aware priority of a path.
 *
 * priority = costWeight * cost + futureCostWeight * estimatedFutureCost
 *
 * Lower priority values are better (A*-style f-score).
 */
export function pathPriority(path: KGPath, config: PathPriorityConfig): number {
  return config.costWeight * path.cost + config.futureCostWeight * path.estimatedFutureCost;
}

/**
 * Beam search over a knowledge graph adjacency list.
 *
 * Expands the most promising partial paths (by priority) up to `beamWidth`
 * at each step, terminating when the target node is reached or no further
 * expansions are possible. Returns up to `config.maxPaths` complete paths
 * ranked by priority.
 *
 * The adjacency list maps each node to its outgoing edges.
 */
export function beamSearch(
  startNode: string,
  targetNode: string,
  adjacencyList: Map<string, KGEdge[]>,
  config: PathPriorityConfig = DEFAULT_PATH_CONFIG
): KGPath[] {
  if (startNode === targetNode) {
    return [
      {
        nodes: [startNode],
        edges: [],
        cost: 0,
        estimatedFutureCost: 0,
      },
    ];
  }

  const cfg = { ...DEFAULT_PATH_CONFIG, ...config };

  // Initialize the beam with the start node.
  let beam: BeamPath[] = [
    {
      nodes: [startNode],
      edges: [],
      cost: 0,
      visited: new Set<string>([startNode]),
    },
  ];

  const completed: KGPath[] = [];
  // Guard against infinite loops on cyclic graphs.
  const maxSteps = adjacencyList.size + 10;

  for (let step = 0; step < maxSteps && beam.length > 0; step++) {
    const candidates: Array<{ beam: BeamPath; priority: number }> = [];

    for (const partial of beam) {
      const lastNode = partial.nodes[partial.nodes.length - 1];
      const neighbors = adjacencyList.get(lastNode) ?? [];

      for (const edge of neighbors) {
        // Skip already-visited nodes to avoid cycles.
        if (partial.visited.has(edge.node)) continue;

        const newNodes = [...partial.nodes, edge.node];
        const newEdges = [
          ...partial.edges,
          { from: lastNode, to: edge.node, relation: edge.relation, weight: edge.weight },
        ];
        const newCost = partial.cost + edge.weight;
        const newVisited = new Set<string>(partial.visited);
        newVisited.add(edge.node);

        const futureCost = estimateFutureCost(edge.node, targetNode);
        const kgPath: KGPath = {
          nodes: newNodes,
          edges: newEdges,
          cost: newCost,
          estimatedFutureCost: futureCost,
        };
        const priority = pathPriority(kgPath, cfg);

        if (edge.node === targetNode) {
          completed.push(kgPath);
        } else {
          candidates.push({
            beam: { nodes: newNodes, edges: newEdges, cost: newCost, visited: newVisited },
            priority,
          });
        }
      }
    }

    // Keep only the top `beamWidth` candidates by priority (lower = better).
    candidates.sort((a, b) => a.priority - b.priority);
    beam = candidates.slice(0, cfg.beamWidth).map((c) => c.beam);

    // Early termination if we have enough complete paths.
    if (completed.length >= cfg.maxPaths) break;
  }

  return rankPaths(completed, cfg).slice(0, cfg.maxPaths);
}

/**
 * Rank a set of paths by priority (lower priority = better path).
 *
 * Returns a new array; the input is not mutated.
 */
export function rankPaths(paths: KGPath[], config: PathPriorityConfig = DEFAULT_PATH_CONFIG): KGPath[] {
  const cfg = { ...DEFAULT_PATH_CONFIG, ...config };
  const copy = [...paths];
  copy.sort((a, b) => pathPriority(a, cfg) - pathPriority(b, cfg));
  return copy;
}

/**
 * Convert the best paths into a natural-language reasoning chain.
 *
 * Each path is rendered as a sequence of "node --relation--> node" steps,
 * and paths are joined with a separator. The resulting string can be fed
 * directly into downstream reasoning modules as a structured rationale.
 */
export function extractReasoningChain(paths: KGPath[]): string {
  if (paths.length === 0) return '';

  const chains: string[] = [];
  for (const path of paths) {
    if (path.nodes.length === 0) continue;
    const parts: string[] = [path.nodes[0]];
    for (let i = 0; i < path.edges.length; i++) {
      const edge = path.edges[i];
      parts.push(`--${edge.relation}-->`);
      parts.push(edge.to);
    }
    chains.push(parts.join(' '));
  }

  if (chains.length === 0) return '';
  if (chains.length === 1) return chains[0];

  // Join multiple paths with a numbered prefix to preserve multiplicity.
  return chains.map((c, i) => `Chain ${i + 1}: ${c}`).join('\n');
}
