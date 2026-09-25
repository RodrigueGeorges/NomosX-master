/**
 * NomosX DEEP PLANNER — Research Question Decomposition
 *
 * LOT 2.1: Decomposes a research question into a DAG of sub-questions.
 * Each sub-question becomes a node with dependencies on parent nodes.
 *
 * The plan is executed by the pipeline (LOT 2.2) in topological order:
 *   1. Scout each node independently
 *   2. Inject parent results as context for child nodes
 *   3. If a node yields < 5 sources, expand its sub-questions (LOT 2.3)
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchNode {
  id: string;
  subQuestion: string;
  parentIds: string[];
  producers: string[];
  resultVariable: string;
  status: 'pending' | 'scouting' | 'done' | 'failed' | 'expanded';
  sourceIds?: string[];
  sourceCount?: number;
}

export interface ResearchPlan {
  rootQuestion: string;
  nodes: ResearchNode[];
  createdAt: Date;
}

export interface DeepPlannerResult {
  plan: ResearchPlan;
  costUsd: number;
  error?: string;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function deepPlan(
  rootQuestion: string,
  options?: {
    domain?: string;
    isStrategic?: boolean;
    maxNodes?: number;
  }
): Promise<DeepPlannerResult> {
  const maxNodes = options?.maxNodes ?? 7;
  const isStrategic = options?.isStrategic ?? false;
  const domain = options?.domain ?? 'general';

  const systemPrompt = `You are a research strategist at a premier think tank (Bruegel/RAND/Brookings level).
Your task: decompose a research question into ${isStrategic ? '5-7' : '3-5'} sub-questions that form a dependency DAG.

Rules:
- Each sub-question must be answerable from academic/policy sources.
- Each sub-question must have a clear "result variable" (what we're measuring/establishing).
- Parent questions provide context for child questions.
- Sub-questions should cover: mechanism, evidence base, counter-arguments, contextual factors, quantitative bounds.
- For strategic reports: include historical context, cross-domain implications, and stakeholder analysis.
- Producers: suggest which types of sources are most relevant for each sub-question.

Return JSON only, no prose.`;

  const userPrompt = `Research question: "${rootQuestion}"
Domain: ${domain}
Depth: ${isStrategic ? 'strategic (5-7 nodes)' : 'standard (3-5 nodes)'}

Return a JSON object:
{
  "nodes": [
    {
      "id": "n1",
      "subQuestion": "What is the direct effect of X on Y?",
      "parentIds": [],
      "producers": ["openalex", "nber", "imf"],
      "resultVariable": "effect_size"
    },
    {
      "id": "n2",
      "subQuestion": "What moderates this effect?",
      "parentIds": ["n1"],
      "producers": ["openalex", "semanticscholar"],
      "resultVariable": "moderator"
    }
  ]
}

Constraints:
- ${maxNodes} nodes maximum.
- Node IDs: "n1", "n2", etc.
- parentIds: list of node IDs this node depends on (empty for root-level).
- producers: source types most likely to answer this sub-question.
- resultVariable: the variable/concept this node establishes (e.g., "effect_size", "mechanism", "boundary_condition").`;

  try {
    const response = await callLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 2000,
      jsonMode: true,
      task: 'query_enhancement',
    });

    const parsed = parseJson(response.content) as { nodes?: any[] };

    if (!parsed?.nodes || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      // Fallback: single-node plan (just the root question)
      return {
        plan: {
          rootQuestion,
          nodes: [{
            id: 'n1',
            subQuestion: rootQuestion,
            parentIds: [],
            producers: [],
            resultVariable: 'primary_finding',
            status: 'pending',
          }],
          createdAt: new Date(),
        },
        costUsd: 0,
        error: 'LLM returned no nodes, using single-node fallback',
      };
    }

    // Validate and normalize nodes
    const nodes: ResearchNode[] = parsed.nodes.slice(0, maxNodes).map((n: any, i: number) => ({
      id: n.id || `n${i + 1}`,
      subQuestion: String(n.subQuestion || '').trim(),
      parentIds: Array.isArray(n.parentIds) ? n.parentIds.filter((p: any) => typeof p === 'string') : [],
      producers: Array.isArray(n.producers) ? n.producers.filter((p: any) => typeof p === 'string') : [],
      resultVariable: String(n.resultVariable || 'finding').trim(),
      status: 'pending' as const,
    }));

    // Validate DAG: no cycles, all parentIds reference existing nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const node of nodes) {
      node.parentIds = node.parentIds.filter(pid => nodeIds.has(pid));
    }

    // Detect cycles (simple DFS)
    if (hasCycle(nodes)) {
      // Break cycles by removing parent references that cause them
      for (const node of nodes) {
        node.parentIds = [];
      }
    }

    // Ensure at least one root node (no parents)
    const hasRoot = nodes.some(n => n.parentIds.length === 0);
    if (!hasRoot && nodes.length > 0) {
      nodes[0].parentIds = [];
    }

    return {
      plan: {
        rootQuestion,
        nodes,
        createdAt: new Date(),
      },
      costUsd: 0, // callLLM handles cost tracking
    };
  } catch (err: any) {
    console.warn('[DEEP PLANNER] Failed, using single-node fallback:', err.message);
    return {
      plan: {
        rootQuestion,
        nodes: [{
          id: 'n1',
          subQuestion: rootQuestion,
          parentIds: [],
          producers: [],
          resultVariable: 'primary_finding',
          status: 'pending',
        }],
        createdAt: new Date(),
      },
      costUsd: 0,
      error: err.message,
    };
  }
}

// ============================================================================
// DYNAMIC REPLANNING — generate follow-up nodes from execution findings
// ============================================================================

/**
 * After the initial DAG executes, examine what was learned (node yields,
 * failures, thin coverage) and propose NEW sub-questions that the original
 * plan missed. This turns the planner from a fixed DAG into a feedback loop.
 *
 * @param rootQuestion - The original research question
 * @param executedNodes - Nodes after scouting (with sourceCount/status)
 * @param maxNewNodes - Cap on new nodes (default 3)
 * @returns New nodes to append to the plan, or empty array
 */
export async function replanFromFindings(
  rootQuestion: string,
  executedNodes: ResearchNode[],
  maxNewNodes: number = 3,
): Promise<{ nodes: ResearchNode[]; costUsd: number; error?: string }> {
  // Only replan when there's a signal: failures or very thin nodes
  const thinNodes = executedNodes.filter(n => (n.sourceCount ?? 0) < 5);
  const failedNodes = executedNodes.filter(n => n.status === 'failed');
  const coveredVariables = executedNodes
    .filter(n => (n.sourceCount ?? 0) >= 5)
    .map(n => n.resultVariable);

  if (thinNodes.length === 0 && failedNodes.length === 0) {
    return { nodes: [], costUsd: 0 };
  }

  const nodeSummary = executedNodes.map(n =>
    `- "${n.subQuestion}" [${n.status}, ${n.sourceCount ?? 0} sources, variable: ${n.resultVariable}]`
  ).join('\n');

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a research strategist reviewing a partially-executed research plan. Some sub-questions returned insufficient evidence. Propose NEW follow-up sub-questions that fill the gaps — different angles, adjacent mechanisms, or alternative framings likely to yield sources. Do NOT repeat failed questions verbatim. Return JSON only.`,
        },
        {
          role: 'user',
          content: `RESEARCH QUESTION: "${rootQuestion}"

EXECUTED PLAN:
${nodeSummary}

COVERED VARIABLES: ${coveredVariables.join(', ') || 'none'}
THIN/FAILED NODES: ${[...thinNodes, ...failedNodes].map(n => n.subQuestion).join(' | ')}

Generate up to ${maxNewNodes} NEW sub-questions targeting the uncovered areas. Return:
{"nodes": [{"subQuestion": "...", "resultVariable": "...", "producers": ["openalex","crossref"]}]}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1200,
      jsonMode: true,
      task: 'query_enhancement',
    });

    const parsed = parseJson(response.content) as { nodes?: any[] };
    if (!parsed?.nodes || !Array.isArray(parsed.nodes)) {
      return { nodes: [], costUsd: 0, error: 'no nodes returned' };
    }

    const existingIds = new Set(executedNodes.map(n => n.id));
    let nextIdx = executedNodes.length + 1;
    const newNodes: ResearchNode[] = parsed.nodes
      .slice(0, maxNewNodes)
      .map((n: any) => ({
        id: `r${nextIdx++}`,
        subQuestion: String(n.subQuestion || '').trim(),
        // Replan nodes depend on the nodes that failed/thin — they refine them
        parentIds: thinNodes.slice(0, 1).map(t => t.id),
        producers: Array.isArray(n.producers) ? n.producers.filter((p: any) => typeof p === 'string') : [],
        resultVariable: String(n.resultVariable || 'followup').trim(),
        status: 'pending' as const,
      }))
      .filter(n => n.subQuestion.length > 10 && !existingIds.has(n.id));

    return { nodes: newNodes, costUsd: 0 };
  } catch (err: any) {
    return { nodes: [], costUsd: 0, error: err.message };
  }
}

// ============================================================================
// DAG UTILITIES
// ============================================================================

/** Topological sort — returns nodes in execution order */
export function topologicalSort(nodes: ResearchNode[]): ResearchNode[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, node.parentIds.length);
    adjacency.set(node.id, []);
  }

  for (const node of nodes) {
    for (const parentId of node.parentIds) {
      adjacency.get(parentId)?.push(node.id);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: ResearchNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.find(n => n.id === id);
    if (node) sorted.push(node);

    for (const childId of adjacency.get(id) || []) {
      const newDegree = (inDegree.get(childId) || 0) - 1;
      inDegree.set(childId, newDegree);
      if (newDegree === 0) queue.push(childId);
    }
  }

  // If not all nodes are sorted, there's a cycle — append remaining nodes
  if (sorted.length < nodes.length) {
    for (const node of nodes) {
      if (!sorted.find(s => s.id === node.id)) sorted.push(node);
    }
  }

  return sorted;
}

/** Get all ancestor source IDs for a node (from all transitive parents) */
export function getAncestorSourceIds(nodeId: string, nodes: ResearchNode[]): string[] {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return [];

  const visited = new Set<string>();
  const collect: string[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const n = nodes.find(nn => nn.id === id);
    if (!n) return;
    for (const pid of n.parentIds) {
      const parent = nodes.find(nn => nn.id === pid);
      if (parent?.sourceIds) {
        collect.push(...parent.sourceIds);
      }
      visit(pid);
    }
  }

  visit(nodeId);
  return [...new Set(collect)];
}

/** Check if the DAG has a cycle */
function hasCycle(nodes: ResearchNode[]): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(id: string): boolean {
    if (recursionStack.has(id)) return true;
    if (visited.has(id)) return false;

    visited.add(id);
    recursionStack.add(id);

    const node = nodes.find(n => n.id === id);
    if (node) {
      for (const pid of node.parentIds) {
        if (dfs(pid)) return true;
      }
    }

    recursionStack.delete(id);
    return false;
  }

  for (const node of nodes) {
    if (dfs(node.id)) return true;
  }

  return false;
}
