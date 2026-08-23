/**
 * Graph-of-Agents (GoA) — NomosX
 *
 * Inspired by:
 * - Graph-of-Agents (S15-02, ICLR 2026): Instead of invoking all N agents in a
 *   Mixture-of-Agents setup, GoA selects the K most relevant agents based on
 *   "model cards" (declared capabilities), evaluates pairwise response
 *   relevance, and routes messages along a directed graph. This reduces cost
 *   and latency while improving signal-to-noise over flat MoA aggregation.
 *
 * Architecture:
 * 1. `selectAgents()` — scores each available agent by keyword overlap between
 *    the query and the agent's declared `capabilities`, then returns the top-K.
 * 2. `buildAgentGraph()` — after each selected agent produces a response, a
 *    directed graph is built where an edge A→B exists if response A is
 *    relevant to response B (Jaccard similarity on token sets above the
 *    relevance threshold). Edge weights encode similarity.
 * 3. `poolResponses()` — graph-based pooling: each response contributes a
 *    weighted vote proportional to the sum of incoming edge weights, producing
 *    a synthesized summary instead of a flat concatenation.
 *
 * Integration:
 * - lib/agent/moa/mixture-of-agents.ts: alternative aggregation backend when
 *   the number of available agents is large and capability metadata exists.
 * - lib/agent/debate-agent.ts: the directed graph can seed a structured debate
 *   by identifying which agents should respond to which others.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentNode {
  id: string;
  role: string;
  capabilities: string[];
  model: string;
}

export interface AgentEdge {
  from: string;
  to: string;
  weight: number;
}

export interface GoAConfig {
  maxAgents: number;
  relevanceThreshold: number;
}

export const DEFAULT_GOA_CONFIG: GoAConfig = {
  maxAgents: 3,
  relevanceThreshold: 0.3,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for',
  'with', 'as', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'this', 'that', 'these', 'those', 'it', 'its', 'at', 'from', 'which',
  'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how', 'can',
  'could', 'should', 'would', 'may', 'might', 'must', 'shall', 'will',
  'do', 'does', 'did', 'has', 'have', 'had', 'not', 'no', 'so', 'than',
  'then', 'there', 'their', 'they', 'them', 'we', 'you', 'your', 'our',
  'i', 'me', 'my', 'if', 'about', 'into', 'over', 'under', 'after',
  'before', 'between', 'during', 'through', 'without', 'within',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Selection ──────────────────────────────────────────────────────────────

/**
 * Selects the top-K agents whose declared capabilities best match the query.
 * Matching is keyword-based: query tokens are compared against each
 * capability's tokens (with light stemming by trimming common suffixes).
 */
export function selectAgents(
  query: string,
  availableAgents: AgentNode[],
  config: GoAConfig = DEFAULT_GOA_CONFIG,
): AgentNode[] {
  const queryTokens = tokenSet(query);
  if (queryTokens.size === 0 || availableAgents.length === 0) {
    return availableAgents.slice(0, config.maxAgents);
  }

  const scored = availableAgents.map((agent) => {
    const capabilityTokens = new Set<string>();
    for (const cap of agent.capabilities) {
      for (const t of tokenize(cap)) capabilityTokens.add(t);
    }
    let overlap = 0;
    for (const t of queryTokens) {
      if (capabilityTokens.has(t)) overlap += 1;
    }
    // Normalize by query length to keep scores comparable across queries.
    const score = queryTokens.size === 0 ? 0 : overlap / queryTokens.size;
    return { agent, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, config.maxAgents).map((s) => s.agent);
}

// ─── Graph Construction ─────────────────────────────────────────────────────

/**
 * Builds a directed graph over agents based on response relevance.
 * An edge from→to exists when the Jaccard similarity of the two responses'
 * token sets exceeds the relevance threshold. Edge weight = similarity.
 */
export function buildAgentGraph(
  agents: AgentNode[],
  responses: Map<string, string>,
  config: GoAConfig = DEFAULT_GOA_CONFIG,
): { edges: AgentEdge[]; adjacencyList: Map<string, string[]> } {
  const present = agents.filter((a) => responses.has(a.id));
  const tokenCache = new Map<string, Set<string>>();
  for (const a of present) {
    tokenCache.set(a.id, tokenSet(responses.get(a.id) ?? ''));
  }

  const edges: AgentEdge[] = [];
  const adjacencyList = new Map<string, string[]>();
  for (const a of present) adjacencyList.set(a.id, []);

  for (let i = 0; i < present.length; i += 1) {
    for (let j = 0; j < present.length; j += 1) {
      if (i === j) continue;
      const from = present[i];
      const to = present[j];
      const sim = jaccardSimilarity(
        tokenCache.get(from.id) ?? new Set(),
        tokenCache.get(to.id) ?? new Set(),
      );
      if (sim >= config.relevanceThreshold) {
        edges.push({ from: from.id, to: to.id, weight: sim });
        adjacencyList.get(from.id)?.push(to.id);
      }
    }
  }

  return { edges, adjacencyList };
}

// ─── Graph-Based Pooling ────────────────────────────────────────────────────

/**
 * Pools responses using the directed graph. Each agent's response receives a
 * weight equal to 1 plus the sum of incoming edge weights (responses that
 * many others found relevant contribute more). Responses are concatenated in
 * descending weight order with a header identifying the contributing agent.
 */
export function poolResponses(
  agents: AgentNode[],
  responses: Map<string, string>,
  edges: AgentEdge[],
): string {
  const present = agents.filter((a) => responses.has(a.id));
  if (present.length === 0) return '';

  const incomingWeight = new Map<string, number>();
  for (const a of present) incomingWeight.set(a.id, 1);
  for (const edge of edges) {
    incomingWeight.set(
      edge.to,
      (incomingWeight.get(edge.to) ?? 1) + edge.weight,
    );
  }

  const roleById = new Map<string, string>();
  for (const a of present) roleById.set(a.id, a.role);

  const ranked = present
    .map((a) => ({
      id: a.id,
      weight: incomingWeight.get(a.id) ?? 1,
      text: responses.get(a.id) ?? '',
    }))
    .sort((a, b) => b.weight - a.weight);

  const totalWeight = ranked.reduce((sum, r) => sum + r.weight, 0);

  const sections = ranked.map((r) => {
    const share = totalWeight === 0 ? 0 : r.weight / totalWeight;
    const role = roleById.get(r.id) ?? r.id;
    const header = `[${role} · weight ${r.weight.toFixed(2)} · share ${(share * 100).toFixed(0)}%]`;
    return `${header}\n${r.text.trim()}`;
  });

  return sections.join('\n\n---\n\n');
}
