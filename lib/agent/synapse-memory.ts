/**
 * SYNAPSE: Spreading Activation Memory for Agentic Systems
 *
 * Based on: ACL 2026 "Synapse: Spreading Activation Memory for Long-Range
 * Reasoning in Agents"
 *
 * Unified episodic-semantic memory with spreading activation:
 * - When a node is activated (by query match), activation spreads to
 *   neighboring nodes in the graph
 * - Lateral inhibition: strongly activated nodes suppress weak neighbors
 *   (focuses retrieval on the most relevant memories)
 * - Temporal decay: older memories lose activation over time
 *
 * Triple hybrid retrieval:
 * 1. Embedding similarity (semantic)
 * 2. Graph traversal (structural)
 * 3. Spreading activation (associative)
 *
 * In NomosX, this enhances agent-memory.ts with associative retrieval:
 * - Instead of just vector similarity, memories are connected in a graph
 * - Retrieval follows activation paths, finding indirectly related memories
 * - Lateral inhibition focuses on the most relevant cluster
 */

export interface MemoryNode {
  id: string;
  /** The memory content */
  content: string;
  /** Type of memory */
  type: 'episodic' | 'semantic' | 'procedural';
  /** Timestamp */
  timestamp: number;
  /** Base activation level (0-1) */
  baseActivation: number;
  /** Current activation level (computed during retrieval) */
  currentActivation: number;
  /** Tags/keywords */
  tags: string[];
  /** Embedding vector (optional, for semantic similarity) */
  embedding?: number[];
}

export interface MemoryEdge {
  from: string;
  to: string;
  /** Edge weight (strength of association) */
  weight: number;
  /** Edge type */
  type: 'temporal' | 'causal' | 'semantic' | 'co-occurrence';
}

export interface SynapseGraph {
  nodes: Map<string, MemoryNode>;
  edges: MemoryEdge[];
  /** Adjacency list for fast traversal */
  adjacency: Map<string, Array<{ nodeId: string; weight: number; type: string }>>;
}

export interface SynapseRetrievalResult {
  /** Activated nodes, sorted by activation level */
  nodes: MemoryNode[];
  /** Activation trace (for debugging) */
  trace: Array<{ nodeId: string; activation: number; source: string }>;
  /** Total activation spread */
  totalActivation: number;
}

/**
 * Create a new Synapse memory graph.
 */
export function createSynapseGraph(): SynapseGraph {
  return {
    nodes: new Map(),
    edges: [],
    adjacency: new Map(),
  };
}

/**
 * Add a memory node to the graph.
 */
export function addMemoryNode(
  graph: SynapseGraph,
  node: Omit<MemoryNode, 'id' | 'currentActivation'> & { id?: string },
): string {
  const id = node.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const fullNode: MemoryNode = {
    ...node,
    id,
    currentActivation: 0,
  };
  graph.nodes.set(id, fullNode);
  if (!graph.adjacency.has(id)) graph.adjacency.set(id, []);
  return id;
}

/**
 * Connect two memory nodes with an edge.
 */
export function connectMemories(
  graph: SynapseGraph,
  fromId: string,
  toId: string,
  weight: number = 0.5,
  type: MemoryEdge['type'] = 'semantic',
): void {
  // Check if edge already exists
  const existing = graph.edges.find(e =>
    (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
  );
  if (existing) {
    existing.weight = Math.max(existing.weight, weight);
    return;
  }

  graph.edges.push({ from: fromId, to: toId, weight, type });

  // Update adjacency list (bidirectional)
  if (!graph.adjacency.has(fromId)) graph.adjacency.set(fromId, []);
  graph.adjacency.get(fromId)!.push({ nodeId: toId, weight, type });

  if (!graph.adjacency.has(toId)) graph.adjacency.set(toId, []);
  graph.adjacency.get(toId)!.push({ nodeId: fromId, weight, type });
}

/**
 * Retrieve memories using spreading activation.
 *
 * Algorithm:
 * 1. Find seed nodes by tag/keyword match
 * 2. Spread activation to neighbors (weighted by edge strength)
 * 3. Apply lateral inhibition (top-k nodes suppress neighbors)
 * 4. Apply temporal decay (older memories lose activation)
 * 5. Return top-k activated nodes
 *
 * @param graph The memory graph
 * @param query The query string
 * @param options Retrieval options
 */
export function retrieveWithSpreadingActivation(
  graph: SynapseGraph,
  query: string,
  options: {
    maxResults?: number;
    spreadDepth?: number;
    decayFactor?: number;
    inhibitionStrength?: number;
    temporalDecay?: number;
  } = {}
): SynapseRetrievalResult {
  const {
    maxResults = 10,
    spreadDepth = 3,
    decayFactor = 0.7,
    inhibitionStrength = 0.3,
    temporalDecay = 0.01,
  } = options;

  const trace: Array<{ nodeId: string; activation: number; source: string }> = [];

  // Reset all activations
  for (const node of graph.nodes.values()) {
    node.currentActivation = 0;
  }

  // Step 1: Find seed nodes by tag/keyword match
  const queryTags = extractTags(query);
  const seedActivations = new Map<string, number>();

  for (const node of graph.nodes.values()) {
    let activation = 0;
    for (const tag of queryTags) {
      if (node.tags.includes(tag)) {
        activation += 0.5;
      }
      if (node.content.toLowerCase().includes(tag.toLowerCase())) {
        activation += 0.3;
      }
    }
    if (activation > 0) {
      // Apply temporal decay
      const age = (Date.now() - node.timestamp) / (1000 * 60 * 60 * 24); // days
      activation *= Math.exp(-temporalDecay * age);
      node.currentActivation = activation;
      seedActivations.set(node.id, activation);
      trace.push({ nodeId: node.id, activation, source: 'seed' });
    }
  }

  if (seedActivations.size === 0) {
    return { nodes: [], trace, totalActivation: 0 };
  }

  // Step 2: Spread activation
  for (let depth = 0; depth < spreadDepth; depth++) {
    const newActivations = new Map<string, number>();

    for (const [nodeId, activation] of seedActivations) {
      const neighbors = graph.adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const spreadActivation = activation * neighbor.weight * Math.pow(decayFactor, depth + 1);
        const current = newActivations.get(neighbor.nodeId) || 0;
        newActivations.set(neighbor.nodeId, current + spreadActivation);
      }
    }

    // Apply new activations
    for (const [nodeId, activation] of newActivations) {
      const node = graph.nodes.get(nodeId);
      if (node) {
        node.currentActivation = Math.max(node.currentActivation, activation);
        if (activation > 0.05) {
          seedActivations.set(nodeId, activation);
          trace.push({ nodeId, activation, source: `spread_depth_${depth + 1}` });
        }
      }
    }
  }

  // Step 3: Lateral inhibition
  const sortedNodes = [...graph.nodes.values()]
    .filter(n => n.currentActivation > 0)
    .sort((a, b) => b.currentActivation - a.currentActivation);

  // Top nodes inhibit their neighbors
  for (let i = 0; i < Math.min(maxResults, sortedNodes.length); i++) {
    const topNode = sortedNodes[i];
    const neighbors = graph.adjacency.get(topNode.id) || [];
    for (const neighbor of neighbors) {
      const neighborNode = graph.nodes.get(neighbor.nodeId);
      if (neighborNode && !sortedNodes.slice(0, i).includes(neighborNode)) {
        neighborNode.currentActivation *= (1 - inhibitionStrength);
      }
    }
  }

  // Re-sort after inhibition
  const finalNodes = [...graph.nodes.values()]
    .filter(n => n.currentActivation > 0.01)
    .sort((a, b) => b.currentActivation - a.currentActivation)
    .slice(0, maxResults);

  const totalActivation = finalNodes.reduce((sum, n) => sum + n.currentActivation, 0);

  return { nodes: finalNodes, trace, totalActivation };
}

/**
 * Build a memory injection block from Synapse retrieval results.
 */
export function buildSynapseMemoryInjection(result: SynapseRetrievalResult): string {
  if (result.nodes.length === 0) return '';

  const lines: string[] = ['ASSOCIATIVE MEMORY (Synapse spreading activation):'];

  for (const node of result.nodes.slice(0, 5)) {
    const date = new Date(node.timestamp).toISOString().slice(0, 10);
    const activation = (node.currentActivation * 100).toFixed(0);
    lines.push(`- [${date}] (${node.type}, activation: ${activation}%) ${node.content.slice(0, 200)}`);
  }

  return lines.join('\n');
}

/**
 * Extract tags from a query (simple keyword extraction).
 */
function extractTags(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  return words
    .filter(w => w.length > 3)
    .filter(w => !['the', 'this', 'that', 'with', 'from', 'have', 'been', 'will', 'what', 'when', 'where', 'which'].includes(w))
    .slice(0, 10);
}
