/**
 * NomosX TREE OF THOUGHTS — Multi-path reasoning exploration
 *
 * Inspired by Tree of Thoughts (NeurIPS 2023): explores multiple reasoning
 * paths in parallel, evaluates each, and selects the best.
 *
 * Used by the orchestrator for complex decisions where a single linear path
 * may miss optimal strategies. Instead of PROCEED/RE_SCOUT/DEEPATE as a
 * single choice, ToT explores all three in parallel, simulates outcomes,
 * and picks the path with the highest expected value.
 *
 * Architecture:
 * 1. THOUGHT GENERATION — LLM proposes N possible next actions
 * 2. STATE SIMULATION — for each action, simulate the likely outcome
 * 3. EVALUATION — score each simulated state
 * 4. SELECTION — pick the highest-scoring path (BFS with pruning)
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import type { PipelineState } from './orchestrator';

// ============================================================================
// TYPES
// ============================================================================

export interface ThoughtNode {
  id: string;
  thought: string;              // The reasoning/action proposed
  action: string;               // PROCEED, RE_SCOUT, DEEPEN, DEBATE, PIVOT, ABORT
  rationale: string;            // Why this action makes sense
  expectedOutcome: string;      // What we expect to happen
  value: number;                // 0-100: estimated quality of this path
  depth: number;                // 0 = root, 1+ = child thoughts
  children: ThoughtNode[];
  parent?: ThoughtNode;
  state: Partial<PipelineState>; // Simulated pipeline state after this action
}

export interface ToTResult {
  bestPath: ThoughtNode[];      // Path from root to best leaf
  bestAction: string;
  bestValue: number;
  allExplored: ThoughtNode[];   // All nodes explored (for audit)
  costUsd: number;
}

// ============================================================================
// TREE OF THOUGHTS ENGINE
// ============================================================================

/**
 * Explore multiple reasoning paths for a pipeline decision.
 *
 * @param state Current pipeline state
 * @param context Additional context (query, source count, etc.)
 * @param breadth How many branches to explore per level (default: 3)
 * @param maxDepth Maximum depth of exploration (default: 2)
 */
export async function exploreWithToT(
  state: PipelineState,
  context: {
    query: string;
    sourceCount: number;
    avgQuality: number;
    providerDiversity: number;
    currentStep: string;
    issues?: string[];
  },
  breadth: number = 3,
  maxDepth: number = 2
): Promise<ToTResult> {
  let totalCost = 0;

  // Step 1: Generate initial thoughts (breadth options)
  const rootThoughts = await generateThoughts(state, context, breadth);
  totalCost += rootThoughts.costUsd;

  // Step 2: For each thought, simulate and evaluate
  const rootNodes: ThoughtNode[] = rootThoughts.thoughts.map((t, i) => ({
    id: `root-${i}`,
    thought: t.thought,
    action: t.action,
    rationale: t.rationale,
    expectedOutcome: t.expectedOutcome,
    value: t.value,
    depth: 0,
    children: [],
    state: { ...state },
  }));

  // Step 3: Expand each root node (if maxDepth > 1)
  if (maxDepth > 1) {
    for (const node of rootNodes) {
      if (node.value < 30) continue; // Prune low-value branches

      const childContext = {
        ...context,
        issues: [node.expectedOutcome],
      };
      const childThoughts = await generateThoughts(
        { ...state, ...node.state } as PipelineState,
        childContext,
        Math.min(breadth, 2) // Narrower at depth 1
      );
      totalCost += childThoughts.costUsd;

      node.children = childThoughts.thoughts.map((t, j) => ({
        id: `${node.id}-child-${j}`,
        thought: t.thought,
        action: t.action,
        rationale: t.rationale,
        expectedOutcome: t.expectedOutcome,
        value: (node.value + t.value) / 2, // Average with parent
        depth: 1,
        children: [],
        parent: node,
        state: { ...node.state } as PipelineState,
      }));
    }
  }

  // Step 4: Find the best leaf node
  const allLeaves: ThoughtNode[] = [];
  for (const root of rootNodes) {
    if (root.children.length === 0) {
      allLeaves.push(root);
    } else {
      allLeaves.push(...root.children);
    }
  }

  allLeaves.sort((a, b) => b.value - a.value);
  const bestLeaf = allLeaves[0];

  // Build path from root to best leaf
  const bestPath: ThoughtNode[] = [];
  let current: ThoughtNode | undefined = bestLeaf;
  while (current) {
    bestPath.unshift(current);
    current = current.parent;
  }

  const allExplored: ThoughtNode[] = [...rootNodes];
  for (const root of rootNodes) {
    allExplored.push(...root.children);
  }

  return {
    bestPath,
    bestAction: bestLeaf.action,
    bestValue: bestLeaf.value,
    allExplored,
    costUsd: totalCost,
  };
}

// ============================================================================
// THOUGHT GENERATION (LLM-powered)
// ============================================================================

async function generateThoughts(
  state: PipelineState,
  context: {
    query: string;
    sourceCount: number;
    avgQuality: number;
    providerDiversity: number;
    currentStep: string;
    issues?: string[];
  },
  count: number
): Promise<{ thoughts: Array<{ thought: string; action: string; rationale: string; expectedOutcome: string; value: number }>; costUsd: number }> {
  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are a pipeline orchestrator using Tree of Thoughts reasoning. Given the current pipeline state, propose ${count} DIFFERENT next actions. For each, estimate the expected outcome and score it 0-100. Be strategic — consider trade-offs between cost, quality, and time.`,
      },
      {
        role: "user",
        content: `PIPELINE STATE:
- Current step: ${context.currentStep}
- Query: "${context.query.slice(0, 200)}"
- Sources found: ${context.sourceCount}
- Average quality: ${context.avgQuality}/100
- Provider diversity: ${context.providerDiversity} providers
${context.issues ? `- Known issues: ${context.issues.join('; ')}` : ''}

Propose ${count} DIFFERENT next actions. Return JSON:
{
  "thoughts": [
    {
      "thought": "brief description of this approach",
      "action": "PROCEED|RE_SCOUT|DEEPEN|DEBATE|PIVOT|ABORT",
      "rationale": "why this makes sense given the state",
      "expectedOutcome": "what will likely happen",
      "value": 0-100
    }
  ]
}

Rules:
- Each thought must propose a DIFFERENT action
- Consider both conservative and aggressive options
- Value should reflect expected quality of the final publication`,
      },
    ],
    temperature: 0.4,
    maxTokens: 1000,
    jsonMode: true,
    task: 'topic_classification',
  });

  try {
    const parsed = parseJson<any>(result.content);
    const thoughts = (parsed?.thoughts || []).slice(0, count).map((t: any) => ({
      thought: String(t.thought || ''),
      action: String(t.action || 'PROCEED'),
      rationale: String(t.rationale || ''),
      expectedOutcome: String(t.expectedOutcome || ''),
      value: Math.max(0, Math.min(100, Number(t.value) || 50)),
    }));
    return { thoughts, costUsd: result.costUsd };
  } catch {
    // Fallback: return default PROCEED
    return {
      thoughts: [{
        thought: 'Continue with current pipeline',
        action: 'PROCEED',
        rationale: 'Default fallback',
        expectedOutcome: 'Continue to next step',
        value: 50,
      }],
      costUsd: result.costUsd,
    };
  }
}

// ============================================================================
// FORMATTING — For audit trail / logging
// ============================================================================

export function formatToTAudit(result: ToTResult): string {
  const lines: string[] = ['=== TREE OF THOUGHTS EXPLORATION ==='];
  lines.push(`Best action: ${result.bestAction} (value: ${result.bestValue}/100)`);
  lines.push(`Paths explored: ${result.allExplored.length}`);
  lines.push(`Cost: $${result.costUsd.toFixed(4)}`);
  lines.push('\nBest path:');
  for (const node of result.bestPath) {
    lines.push(`  ${'  '.repeat(node.depth)}→ [${node.action}] ${node.thought} (value: ${node.value})`);
  }
  return lines.join('\n');
}
