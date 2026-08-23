/**
 * VMAO: Plan-Execute-Verify-Replan DAG Orchestrator
 *
 * Based on: ICLR 2026 "VMAO: Plan-Execute-Verify-Replan for Robust Agentic Systems"
 *
 * Decomposes the pipeline into a DAG (Directed Acyclic Graph) of sub-tasks:
 * - Each node is a sub-task (e.g., "search for sources", "extract claims")
 * - Edges represent dependencies
 * - After each node completes, a verifier checks the output
 * - If verification fails, the orchestrator replans (adds/removes nodes)
 *
 * Completeness: 3.1 → 4.2
 * Source quality: 2.6 → 4.1
 *
 * In NomosX, this replaces the fixed sequential pipeline with a dynamic DAG:
 * - SCOUT, READER, ANALYST, EDITOR become nodes in the DAG
 * - Independent nodes can run in parallel
 * - The CRITIC becomes a verifier at each node
 * - Replanning adds gap-fill or re-analysis nodes as needed
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface DAGNode {
  id: string;
  /** Task type (e.g., "scout", "reader", "analyst") */
  type: string;
  /** Human-readable name */
  name: string;
  /** Dependencies (node IDs that must complete before this node) */
  dependencies: string[];
  /** Whether this node is optional (can be pruned if budget is tight) */
  optional: boolean;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Estimated time in ms */
  estimatedMs: number;
  /** Current status */
  status: TaskStatus;
  /** Output of this node (if completed) */
  output?: any;
  /** Verification result (if verified) */
  verification?: { passed: boolean; score: number; notes: string };
  /** Retry count */
  retries: number;
  /** Max retries */
  maxRetries: number;
}

export interface DAGEdge {
  from: string;
  to: string;
  /** Whether this is a soft dependency (preferred but not required) */
  soft?: boolean;
}

export interface DAGPlan {
  nodes: Map<string, DAGNode>;
  edges: DAGEdge[];
}

export interface ReplanAction {
  type: 'add_node' | 'remove_node' | 'retry_node' | 'add_edge';
  nodeId?: string;
  node?: Partial<DAGNode>;
  reason: string;
}

/**
 * Generate the initial DAG plan for a pipeline run.
 *
 * Instead of a fixed sequence, this creates a DAG with parallel branches
 * where possible.
 */
export function generateInitialPlan(query: string, format: string): DAGPlan {
  const plan: DAGPlan = { nodes: new Map(), edges: [] };

  // Core nodes (always present)
  const nodes: DAGNode[] = [
    {
      id: 'scout', type: 'scout', name: 'Source Discovery',
      dependencies: [], optional: false, estimatedCostUsd: 0.5, estimatedMs: 300000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
    {
      id: 'rank', type: 'rank', name: 'Source Ranking',
      dependencies: ['scout'], optional: false, estimatedCostUsd: 0.1, estimatedMs: 60000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
    {
      id: 'reader', type: 'reader', name: 'Source Reading',
      dependencies: ['rank'], optional: false, estimatedCostUsd: 0.3, estimatedMs: 180000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
    // Parallel branches after reader
    {
      id: 'framing', type: 'framing', name: 'Narrative Framing',
      dependencies: ['reader'], optional: true, estimatedCostUsd: 0.1, estimatedMs: 60000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
    {
      id: 'quant', type: 'quant', name: 'Quantitative Analysis',
      dependencies: ['reader'], optional: true, estimatedCostUsd: 0.1, estimatedMs: 60000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
    {
      id: 'hypothesis', type: 'hypothesis', name: 'Hypothesis Generation',
      dependencies: ['reader'], optional: true, estimatedCostUsd: 0.1, estimatedMs: 60000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
    // Analyst depends on all parallel branches
    {
      id: 'analyst', type: 'analyst', name: 'Analysis & Synthesis',
      dependencies: ['framing', 'quant', 'hypothesis'], optional: false,
      estimatedCostUsd: 0.5, estimatedMs: 300000,
      status: 'pending', retries: 0, maxRetries: 2,
    },
    {
      id: 'citation_repair', type: 'citation_repair', name: 'Citation Repair',
      dependencies: ['analyst'], optional: false, estimatedCostUsd: 0.2, estimatedMs: 120000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
    {
      id: 'critic', type: 'critic', name: 'Critical Review',
      dependencies: ['citation_repair'], optional: false, estimatedCostUsd: 0.1, estimatedMs: 60000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
    {
      id: 'editor', type: 'editor', name: 'Editorial Polish',
      dependencies: ['critic'], optional: false, estimatedCostUsd: 0.1, estimatedMs: 60000,
      status: 'pending', retries: 0, maxRetries: 1,
    },
  ];

  for (const node of nodes) {
    plan.nodes.set(node.id, node);
    for (const dep of node.dependencies) {
      plan.edges.push({ from: dep, to: node.id });
    }
  }

  // Add format-specific nodes
  if (format === 'strategic' || format === 'dossier') {
    const moaNode: DAGNode = {
      id: 'moa', type: 'moa', name: 'Mixture of Agents',
      dependencies: ['reader'], optional: true, estimatedCostUsd: 0.3, estimatedMs: 180000,
      status: 'pending', retries: 0, maxRetries: 1,
    };
    plan.nodes.set('moa', moaNode);
    plan.edges.push({ from: 'reader', to: 'moa' });
    // Analyst also depends on MoA
    const analyst = plan.nodes.get('analyst');
    if (analyst) analyst.dependencies.push('moa');
  }

  return plan;
}

/**
 * Get the next nodes that are ready to execute (all dependencies met).
 *
 * This enables parallel execution of independent nodes.
 */
export function getNextSteps(plan: DAGPlan): DAGNode[] {
  const ready: DAGNode[] = [];

  for (const node of plan.nodes.values()) {
    if (node.status !== 'pending') continue;

    const allDepsMet = node.dependencies.every(depId => {
      const dep = plan.nodes.get(depId);
      return dep && (dep.status === 'completed' || dep.status === 'skipped');
    });

    if (allDepsMet) {
      ready.push(node);
    }
  }

  return ready;
}

/**
 * Verify a node's output and decide if replanning is needed.
 *
 * Returns replan actions if the verification fails.
 */
export function verifyAndReplan(
  plan: DAGPlan,
  nodeId: string,
  output: any,
  verification: { passed: boolean; score: number; notes: string },
): ReplanAction[] {
  const node = plan.nodes.get(nodeId);
  if (!node) return [];

  node.output = output;
  node.verification = verification;
  node.status = verification.passed ? 'completed' : 'failed';

  const actions: ReplanAction[] = [];

  if (!verification.passed && node.retries < node.maxRetries) {
    // Retry the node
    node.retries++;
    node.status = 'pending';
    actions.push({
      type: 'retry_node',
      nodeId: node.id,
      reason: `Verification failed (score: ${verification.score}) — retry ${node.retries}/${node.maxRetries}`,
    });
  } else if (!verification.passed) {
    // Max retries exceeded — add a gap-fill node
    const gapFillId = `gap_fill_${nodeId}`;
    actions.push({
      type: 'add_node',
      node: {
        id: gapFillId,
        type: 'gap_fill',
        name: `Gap Fill for ${node.name}`,
        dependencies: [nodeId],
        optional: false,
        estimatedCostUsd: 0.2,
        estimatedMs: 120000,
        status: 'pending',
        retries: 0,
        maxRetries: 1,
      },
      reason: `Node ${node.name} failed verification — adding gap fill`,
    });
  }

  // If scout found few sources, add a broaden_search node
  if (nodeId === 'scout' && verification.score < 50) {
    const broadenId = 'broaden_search';
    if (!plan.nodes.has(broadenId)) {
      actions.push({
        type: 'add_node',
        node: {
          id: broadenId,
          type: 'broaden_search',
          name: 'Broaden Search',
          dependencies: ['scout'],
          optional: false,
          estimatedCostUsd: 0.3,
          estimatedMs: 180000,
          status: 'pending',
          retries: 0,
          maxRetries: 1,
        },
        reason: 'SCOUT found few sources — broadening search',
      });
    }
  }

  // If analyst has low citations, add a re_analysis node
  if (nodeId === 'analyst' && verification.score < 60) {
    const reAnalysisId = 're_analysis';
    if (!plan.nodes.has(reAnalysisId)) {
      actions.push({
        type: 'add_node',
        node: {
          id: reAnalysisId,
          type: 're_analysis',
          name: 'Re-Analysis with Stronger Citations',
          dependencies: ['analyst'],
          optional: false,
          estimatedCostUsd: 0.3,
          estimatedMs: 180000,
          status: 'pending',
          retries: 0,
          maxRetries: 1,
        },
        reason: 'ANALYST has low citation coverage — re-analyzing with stronger requirements',
      });
    }
  }

  return actions;
}

/**
 * Apply replan actions to the DAG.
 */
export function applyReplanActions(plan: DAGPlan, actions: ReplanAction[]): void {
  for (const action of actions) {
    switch (action.type) {
      case 'add_node':
        if (action.node && action.node.id) {
          plan.nodes.set(action.node.id, action.node as DAGNode);
          for (const dep of action.node.dependencies || []) {
            plan.edges.push({ from: dep, to: action.node.id! });
          }
          console.log(`[VMAO] Added node: ${action.node.id} — ${action.reason}`);
        }
        break;
      case 'retry_node':
        if (action.nodeId) {
          const node = plan.nodes.get(action.nodeId);
          if (node) {
            node.status = 'pending';
            console.log(`[VMAO] Retrying node: ${action.nodeId} — ${action.reason}`);
          }
        }
        break;
      case 'remove_node':
        if (action.nodeId) {
          plan.nodes.delete(action.nodeId);
          plan.edges = plan.edges.filter(e => e.from !== action.nodeId && e.to !== action.nodeId);
          console.log(`[VMAO] Removed node: ${action.nodeId} — ${action.reason}`);
        }
        break;
    }
  }
}

/**
 * Prune optional nodes when budget is tight.
 */
export function pruneOptionalSteps(plan: DAGPlan, remainingBudgetUsd: number): number {
  let savedCost = 0;

  // Sort optional nodes by estimated cost (most expensive first)
  const optionalNodes = [...plan.nodes.values()]
    .filter(n => n.optional && n.status === 'pending')
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  for (const node of optionalNodes) {
    if (remainingBudgetUsd + savedCost < 1.0) { // Keep at least $1 for core nodes
      node.status = 'skipped';
      savedCost += node.estimatedCostUsd;
      console.log(`[VMAO] Pruned optional node: ${node.id} (saved $${node.estimatedCostUsd})`);
    }
  }

  return savedCost;
}

/**
 * Check if the DAG is complete (all required nodes done).
 */
export function isDAGComplete(plan: DAGPlan): boolean {
  for (const node of plan.nodes.values()) {
    if (!node.optional && node.status !== 'completed' && node.status !== 'skipped') {
      return false;
    }
  }
  return true;
}
