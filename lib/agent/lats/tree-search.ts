/**
 * LATS — Language Agent Tree Search — NomosX Sprint 6 (Gap 3)
 *
 * Monte Carlo Tree Search pour le raisonnement des agents.
 * Inspiré de :
 * - LATS (lapisrocks/LanguageAgentTreeSearch, ICML 2024, arxiv 2310.04406)
 * - Agent Q (arxiv 2408.07199) — MCTS + self-critique + DPO
 * - SwiftSAGE (arxiv 2305.17190) — reasoning + acting
 *
 * Le problème :
 * Le ReAct loop est *linéaire* — une seule chaîne de raisonnement. Pour les
 * analyses complexes (contradictions, multi-hypothèses), il faudrait explorer
 * plusieurs branches de raisonnement et garder la meilleure.
 *
 * Architecture LATS :
 * 1. Selection — UCB1 pour sélectionner le nœud le plus prometteur
 * 2. Expansion — générer des actions candidates (tool calls, reasoning)
 * 3. Simulation — exécuter les actions et observer les résultats
 * 4. Backpropagation — propager les scores (via PRM) vers la racine
 * 5. Final — retourner le meilleur chemin (celui avec le score le plus élevé)
 *
 * Value function : le PRM existant (process-reward-model.ts)
 *
 * Intégration : optionnel pour l'ANALYST sur les queries stratégiques complexes.
 */

import { callLLM } from '../../llm/unified-llm';
import type { LLMRequest, ToolDefinition, ToolCall } from '../../llm/unified-llm';
import { executeTool, type ToolExecutionContext, type ToolExecutionResult } from '../tool-registry';
import { scoreStep, extractFeatures, type PRMModel, type ProcessFeatures } from '../prm/process-reward-model';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LATSTreeNode {
  /** Unique ID */
  id: string;
  /** Parent node ID (null for root) */
  parentId: string | null;
  /** Children node IDs */
  childIds: string[];
  /** The thought/reasoning at this node */
  thought: string;
  /** Tool calls made at this node */
  toolCalls?: ToolCall[];
  /** Tool results observed */
  toolResults?: ToolExecutionResult[];
  /** Depth in the tree */
  depth: number;
  /** Value score from PRM (0-1) */
  value: number;
  /** Number of times this node has been visited */
  visitCount: number;
  /** Total reward accumulated through this node */
  totalReward: number;
  /** Whether this is a terminal node (final answer) */
  isTerminal: boolean;
  /** The final answer if terminal */
  finalAnswer?: string;
  /** Whether this node is fully expanded */
  isFullyExpanded: boolean;
}

export interface LATSConfig {
  /** System prompt for the agent */
  systemPrompt: string;
  /** Tools available */
  tools: ToolDefinition[];
  /** Max tree depth (default: 5) */
  maxDepth: number;
  /** Max simulations (default: 10) */
  maxSimulations: number;
  /** Branching factor — how many children to generate per expansion (default: 3) */
  branchingFactor: number;
  /** UCB1 exploration constant (default: 1.414 = sqrt(2)) */
  explorationConstant: number;
  /** PRM model for value function */
  prmModel?: PRMModel;
  /** LLM task type */
  task: LLMRequest['task'];
  /** Temperature for reasoning */
  temperature?: number;
  /** Max tokens per LLM call */
  maxTokens?: number;
  /** Budget cap in USD */
  maxCostUsd: number;
  /** Label for logging */
  label?: string;
}

export interface LATSResult {
  /** Best final answer found */
  finalAnswer: string;
  /** Best path through the tree (node IDs) */
  bestPath: string[];
  /** All nodes in the tree */
  nodes: LATSTreeNode[];
  /** Total cost */
  totalCostUsd: number;
  /** Total simulations run */
  simulationsRun: number;
  /** Best value score */
  bestValue: number;
  /** Why the search ended */
  stopReason: 'found_terminal' | 'max_simulations' | 'budget' | 'max_depth' | 'error';
}

// ─── Tree Storage ───────────────────────────────────────────────────────────

class LATSTree {
  private nodes = new Map<string, LATSTreeNode>();
  private rootId: string;

  constructor(rootThought: string) {
    this.rootId = 'root';
    this.nodes.set(this.rootId, {
      id: this.rootId,
      parentId: null,
      childIds: [],
      thought: rootThought,
      depth: 0,
      value: 0.5,
      visitCount: 0,
      totalReward: 0,
      isTerminal: false,
      isFullyExpanded: false,
    });
  }

  getRoot(): LATSTreeNode {
    return this.nodes.get(this.rootId)!;
  }

  getNode(id: string): LATSTreeNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): LATSTreeNode[] {
    return Array.from(this.nodes.values());
  }

  addChild(parentId: string, thought: string, depth: number): LATSTreeNode {
    const id = `node_${this.nodes.size}_${Date.now()}`;
    const node: LATSTreeNode = {
      id,
      parentId,
      childIds: [],
      thought,
      depth,
      value: 0.5,
      visitCount: 0,
      totalReward: 0,
      isTerminal: false,
      isFullyExpanded: false,
    };
    this.nodes.set(id, node);
    const parent = this.nodes.get(parentId);
    if (parent) {
      parent.childIds.push(id);
    }
    return node;
  }

  updateNode(id: string, updates: Partial<LATSTreeNode>): void {
    const node = this.nodes.get(id);
    if (node) {
      this.nodes.set(id, { ...node, ...updates });
    }
  }
}

// ─── UCB1 Selection ─────────────────────────────────────────────────────────

/**
 * UCB1 formula for node selection.
 * UCB1 = Q(n) + c * sqrt(ln(N(parent)) / N(n))
 * where Q(n) is the average reward, N is visit count, c is exploration constant.
 */
function ucb1(
  node: LATSTreeNode,
  parent: LATSTreeNode,
  explorationConstant: number,
): number {
  if (node.visitCount === 0) {
    return Infinity; // Always explore unvisited nodes
  }

  const avgReward = node.totalReward / node.visitCount;
  const exploration = explorationConstant * Math.sqrt(Math.log(parent.visitCount) / node.visitCount);

  return avgReward + exploration;
}

/**
 * Select the best child node using UCB1.
 */
function selectBestChild(
  node: LATSTreeNode,
  tree: LATSTree,
  explorationConstant: number,
): LATSTreeNode | null {
  const children = node.childIds
    .map(id => tree.getNode(id))
    .filter((n): n is LATSTreeNode => n !== undefined);

  if (children.length === 0) return null;

  let bestChild = children[0];
  let bestScore = ucb1(bestChild, node, explorationConstant);

  for (const child of children.slice(1)) {
    const score = ucb1(child, node, explorationConstant);
    if (score > bestScore) {
      bestScore = score;
      bestChild = child;
    }
  }

  return bestChild;
}

// ─── Selection Phase ────────────────────────────────────────────────────────

/**
 * Selection phase: traverse the tree from root to a leaf using UCB1.
 */
function selectLeaf(tree: LATSTree, config: LATSConfig): LATSTreeNode {
  let current = tree.getRoot();

  while (current.childIds.length > 0 && !current.isTerminal) {
    const bestChild = selectBestChild(current, tree, config.explorationConstant);
    if (!bestChild) break;
    current = bestChild;
  }

  return current;
}

// ─── Expansion Phase ────────────────────────────────────────────────────────

/**
 * Expansion phase: generate child nodes by proposing different reasoning steps.
 * Uses the LLM to generate multiple diverse thoughts.
 */
async function expand(
  node: LATSTreeNode,
  tree: LATSTree,
  config: LATSConfig,
  query: string,
  toolCtx: ToolExecutionContext,
  messageHistory: LLMRequest['messages'],
): Promise<LATSTreeNode[]> {
  if (node.isTerminal || node.depth >= config.maxDepth) {
    node.isFullyExpanded = true;
    return [];
  }

  const children: LATSTreeNode[] = [];

  // Generate multiple diverse thoughts
  for (let i = 0; i < config.branchingFactor; i++) {
    try {
      const response = await callLLM({
        messages: [
          ...messageHistory,
          {
            role: 'user',
            content: `You are exploring reasoning path ${i + 1} of ${config.branchingFactor}. ${i === 0 ? '' : `Take a DIFFERENT approach than the obvious one. ${i === 1 ? 'Consider the counter-argument.' : i === 2 ? 'Consider a synthesis or alternative perspective.' : 'Consider edge cases.'}`}

Current reasoning so far:
${node.thought.slice(0, 500)}

Continue the reasoning:`,
          },
        ],
        tools: config.tools,
        toolChoice: 'auto',
        task: config.task,
        temperature: (config.temperature ?? 0.3) + i * 0.1, // Increase temperature for diversity
        maxTokens: config.maxTokens ?? 2000,
        enableCache: true,
      });

      const thought = response.content || '';
      const toolCalls = response.toolCalls;
      const hasFinish = toolCalls?.some(tc => tc.name === 'finish') ?? false;

      const child = tree.addChild(node.id, thought, node.depth + 1);
      tree.updateNode(child.id, {
        toolCalls,
        isTerminal: hasFinish || !toolCalls?.length,
        finalAnswer: hasFinish || !toolCalls?.length ? thought : undefined,
      });

      // Execute tool calls if any
      if (toolCalls && toolCalls.length > 0 && !hasFinish) {
        const executableCalls = toolCalls.filter(tc => tc.name !== 'finish');
        const results = await Promise.allSettled(
          executableCalls.map(tc => executeTool(tc, toolCtx))
        );
        const toolResults: ToolExecutionResult[] = results.map(r =>
          r.status === 'fulfilled' ? r.value : { toolName: 'unknown', success: false, result: '', error: r.reason?.message }
        );
        tree.updateNode(child.id, { toolResults });
      }

      children.push(tree.getNode(child.id)!);
    } catch (err) {
      console.warn(`[LATS] Expansion ${i} failed:`, err);
    }
  }

  if (children.length === 0) {
    node.isFullyExpanded = true;
  }

  return children;
}

// ─── Simulation / Value Estimation ──────────────────────────────────────────

/**
 * Simulation phase: estimate the value of a node using the PRM.
 * If the PRM model is available, use it. Otherwise, use an LLM judge.
 */
async function simulate(
  node: LATSTreeNode,
  config: LATSConfig,
): Promise<number> {
  // If PRM model is available, use it
  if (config.prmModel) {
    const features = extractFeatures({
      phase: 'lats',
      subStep: `depth_${node.depth}`,
      action: node.thought.slice(0, 200),
      output: node.thought,
      runId: 'lats',
      timestamp: Date.now(),
    });

    const prediction = scoreStep(features, config.prmModel);
    return prediction.predictedReward;
  }

  // Fallback: LLM judge
  if (node.isTerminal && node.finalAnswer) {
    try {
      const response = await callLLM({
        messages: [
          {
            role: 'system',
            content: `Score this reasoning step on a scale of 0.0 to 1.0. Respond with JSON: {"score": 0.75}`,
          },
          {
            role: 'user',
            content: `Reasoning: ${node.thought.slice(0, 1000)}`,
          },
        ],
        temperature: 0.2,
        jsonMode: true,
        maxTokens: 50,
        task: 'enrichment_reasoner',
      });

      const parsed = JSON.parse(response.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
      if (parsed && typeof parsed.score === 'number') {
        return Math.max(0, Math.min(1, parsed.score));
      }
    } catch {
      // fall through
    }
  }

  // Default: heuristic based on thought length and structure
  const lengthScore = Math.min(1, node.thought.length / 2000);
  const hasCitations = /\[SRC-\d+\]/.test(node.thought);
  const hasHedging = /\b(may|might|possibly|likely|uncertain)\b/i.test(node.thought);
  return Math.min(1, lengthScore * 0.5 + (hasCitations ? 0.3 : 0) + (hasHedging ? 0.2 : 0));
}

// ─── Backpropagation Phase ──────────────────────────────────────────────────

/**
 * Backpropagation phase: propagate the reward up to the root.
 */
function backpropagate(
  node: LATSTreeNode,
  tree: LATSTree,
  reward: number,
): void {
  let current: LATSTreeNode | undefined = node;
  while (current) {
    tree.updateNode(current.id, {
      visitCount: current.visitCount + 1,
      totalReward: current.totalReward + reward,
      value: (current.totalReward + reward) / (current.visitCount + 1),
    });
    current = current.parentId ? tree.getNode(current.parentId) : undefined;
  }
}

// ─── Main LATS Function ─────────────────────────────────────────────────────

/**
 * Run Language Agent Tree Search.
 *
 * This is an alternative to the linear ReAct loop. Instead of following a single
 * chain of reasoning, LATS explores a tree of reasoning paths and selects the best one.
 *
 * @param config - LATS configuration
 * @param query - The question to answer
 * @param toolCtx - Tool execution context
 * @returns The best answer found
 */
export async function runLATS(
  config: LATSConfig,
  query: string,
  toolCtx: ToolExecutionContext,
): Promise<LATSResult> {
  const label = config.label || 'LATS';
  const startTime = Date.now();
  let totalCost = 0;
  let simulations = 0;

  // Initialize tree with the query as root
  const tree = new LATSTree(`Query: ${query}`);
  const initialMessages: LLMRequest['messages'] = [
    { role: 'system', content: config.systemPrompt },
    { role: 'user', content: query },
  ];

  let bestTerminal: LATSTreeNode | null = null;
  let bestValue = -1;

  while (simulations < config.maxSimulations) {
    // Budget check
    if (totalCost >= config.maxCostUsd) {
      console.log(`[${label}] Stopping: budget exceeded`);
      break;
    }

    simulations++;
    console.log(`[${label}] Simulation ${simulations}/${config.maxSimulations}`);

    // Step 1: Selection
    const leaf = selectLeaf(tree, config);

    // Step 2: Expansion
    if (!leaf.isTerminal && !leaf.isFullyExpanded && leaf.depth < config.maxDepth) {
      const children = await expand(leaf, tree, config, query, toolCtx, initialMessages);

      if (children.length === 0) {
        leaf.isFullyExpanded = true;
        continue;
      }

      // Step 3: Simulation — evaluate each child
      for (const child of children) {
        const value = await simulate(child, config);
        tree.updateNode(child.id, { value });

        // Track best terminal
        if (child.isTerminal && value > bestValue) {
          bestValue = value;
          bestTerminal = child;
        }

        // Step 4: Backpropagation
        backpropagate(child, tree, value);
      }
    } else if (leaf.isTerminal) {
      // Already terminal — just update its value
      const value = await simulate(leaf, config);
      tree.updateNode(leaf.id, { value });
      backpropagate(leaf, tree, value);

      if (value > bestValue) {
        bestValue = value;
        bestTerminal = leaf;
      }
    }

    // Early termination if we found a good enough answer
    if (bestTerminal && bestValue > 0.85) {
      console.log(`[${label}] Early termination: best value ${bestValue.toFixed(2)}`);
      break;
    }
  }

  // Build the best path
  const bestPath: string[] = [];
  let current: LATSTreeNode | undefined = bestTerminal || tree.getRoot();
  while (current) {
    bestPath.unshift(current.id);
    current = current.parentId ? tree.getNode(current.parentId) : undefined;
  }

  const stopReason: LATSResult['stopReason'] =
    bestTerminal ? 'found_terminal' :
    simulations >= config.maxSimulations ? 'max_simulations' :
    totalCost >= config.maxCostUsd ? 'budget' : 'max_depth';

  return {
    finalAnswer: bestTerminal?.finalAnswer || bestTerminal?.thought || '',
    bestPath,
    nodes: tree.getAllNodes(),
    totalCostUsd: totalCost,
    simulationsRun: simulations,
    bestValue,
    stopReason,
  };
}
