/**
 * BTProp (Belief Tree Propagation) Hallucination Detection — NomosX
 *
 * Inspired by:
 * - BTProp (NAACL 2025): Probabilistic framework generating belief tree by
 *   recursively expanding statements into logically related claims.
 *   Improves SOTA by 3-9% on hallucination detection.
 * - HalluLens (ACL 2025): Comprehensive hallucination benchmark with
 *   extrinsic and intrinsic tasks.
 * - CiteEval (ACL 2025): Principle-driven citation evaluation.
 *
 * Architecture:
 * - Given a claim, generate a belief tree by recursively decomposing it
 *   into logically related sub-claims (supports, contradicts, entails)
 * - Each sub-claim is verified against sources independently
 * - Beliefs propagate up the tree using Bayesian-like updating
 * - Final score indicates hallucination probability
 *
 * Integration:
 * - claim-grounding.ts: use for claims with borderline grounding (30-60%)
 * - critic-agent.ts: hallucination score feeds into overall quality
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BeliefNode {
  id: string;
  claim: string;
  relationship: 'root' | 'supports' | 'contradicts' | 'entails' | 'context';
  parentId: string | null;
  children: BeliefNode[];
  // Verification results (populated during propagation)
  verified?: boolean;
  confidence?: number; // 0-1
  evidence?: string;
}

export interface BeliefTree {
  root: BeliefNode;
  nodes: BeliefNode[]; // flat list for easy traversal
  depth: number;
}

export interface HallucinationAssessment {
  claim: string;
  hallucinationProbability: number; // 0-1 (1 = likely hallucination)
  beliefTree: BeliefTree;
  supportedNodes: number;
  contradictedNodes: number;
  unclearNodes: number;
  reasoning: string;
  costUsd: number;
}

// ─── Belief Tree Construction ───────────────────────────────────────────────

/**
 * Generate a belief tree by decomposing a claim into logically related sub-claims.
 */
export async function buildBeliefTree(claim: string, maxDepth: number = 2): Promise<BeliefTree> {
  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: `You are a hallucination detection expert. Build a BELIEF TREE for this claim by decomposing it into logically related sub-claims.

CLAIM: "${claim}"

Decompose the claim into a tree structure:
- ROOT: the original claim
- SUPPORTS: sub-claims that, if true, support the root claim
- CONTRADICTS: sub-claims that, if true, contradict the root claim
- ENTAILS: sub-claims that are logically entailed by the root claim
- CONTEXT: sub-claims that provide necessary context

Maximum depth: ${maxDepth} levels. Each node should have at most 3 children.

Return JSON:
{
  "root": {
    "id": "root",
    "claim": "${claim}",
    "relationship": "root",
    "parentId": null,
    "children": [
      {
        "id": "1",
        "claim": "sub-claim text",
        "relationship": "supports|contradicts|entails|context",
        "parentId": "root",
        "children": [
          {
            "id": "1.1",
            "claim": "deeper sub-claim",
            "relationship": "...",
            "parentId": "1",
            "children": []
          }
        ]
      }
    ]
  }
}`
      }],
      temperature: 0.15,
      jsonMode: true,
      maxTokens: 1500,
      enableCache: true,
      task: 'fact_check',
    });

    const result = parseJson<{ root: BeliefNode }>(response.content);
    if (!result?.root) {
      return { root: createDefaultNode(claim), nodes: [createDefaultNode(claim)], depth: 0 };
    }

    // Flatten tree for easy traversal
    const nodes: BeliefNode[] = [];
    flattenTree(result.root, nodes);

    return {
      root: result.root,
      nodes,
      depth: maxDepth,
    };
  } catch (error) {
    console.warn('[BTProp] Tree construction failed:', error instanceof Error ? error.message : String(error));
    const defaultNode = createDefaultNode(claim);
    return { root: defaultNode, nodes: [defaultNode], depth: 0 };
  }
}

function createDefaultNode(claim: string): BeliefNode {
  return {
    id: 'root',
    claim,
    relationship: 'root',
    parentId: null,
    children: [],
  };
}

function flattenTree(node: BeliefNode, nodes: BeliefNode[]): void {
  nodes.push(node);
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, nodes);
    }
  }
}

// ─── Belief Verification ────────────────────────────────────────────────────

/**
 * Verify each node in the belief tree against available sources.
 * Populates the `verified`, `confidence`, and `evidence` fields.
 */
export async function verifyBeliefTree(
  tree: BeliefTree,
  sources: Array<{ title: string; abstract: string; text?: string }>,
): Promise<void> {
  const evidenceText = sources.slice(0, 5).map((s, i) =>
    `[SRC-${i + 1}] ${s.title}\n${(s.text || s.abstract || '').slice(0, 400)}`
  ).join('\n---\n');

  // Verify leaf nodes first (bottom-up propagation)
  const leafNodes = tree.nodes.filter(n => !n.children || n.children.length === 0);

  // Batch verify leaf nodes
  const verifyPromises = leafNodes.map(node => verifyNode(node, evidenceText));
  await Promise.all(verifyPromises);

  // Propagate beliefs up the tree
  propagateBeliefs(tree.root);
}

async function verifyNode(node: BeliefNode, evidenceText: string): Promise<void> {
  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: `You are verifying a sub-claim against available evidence.

SUB-CLAIM: "${node.claim}"

EVIDENCE:
${evidenceText}

Is this sub-claim SUPPORTED, CONTRADICTED, or UNCLEAR based on the evidence?

Return JSON:
{
  "verified": true|false,
  "confidence": 0.0-1.0,
  "evidence": "which sources support/contradict this, e.g. [SRC-1] supports, [SRC-2] contradicts"
}`
      }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 200,
      enableCache: true,
      task: 'citation_verification',
    });

    const result = parseJson<{ verified: boolean; confidence: number; evidence: string }>(response.content);
    if (result) {
      node.verified = result.verified;
      node.confidence = result.confidence;
      node.evidence = result.evidence;
    } else {
      node.verified = undefined;
      node.confidence = 0.5;
      node.evidence = 'Could not verify';
    }
  } catch {
    node.verified = undefined;
    node.confidence = 0.5;
    node.evidence = 'Verification failed';
  }
}

/**
 * Propagate beliefs from leaf nodes up to the root.
 * Uses a simple Bayesian-like update:
 * - supports children increase parent belief
 * - contradicts children decrease parent belief
 * - entails children inherit parent belief
 * - context children don't affect parent belief
 */
function propagateBeliefs(node: BeliefNode): void {
  if (!node.children || node.children.length === 0) {
    // Leaf node — already verified
    return;
  }

  // First, propagate all children
  for (const child of node.children) {
    propagateBeliefs(child);
  }

  // Then, aggregate children beliefs
  let supportScore = 0;
  let contradictScore = 0;
  let contextCount = 0;
  let childCount = 0;

  for (const child of node.children) {
    const childConf = child.confidence ?? 0.5;
    switch (child.relationship) {
      case 'supports':
        if (child.verified === true) supportScore += childConf;
        else if (child.verified === false) contradictScore += childConf * 0.5;
        break;
      case 'contradicts':
        if (child.verified === true) contradictScore += childConf;
        else if (child.verified === false) supportScore += childConf * 0.5;
        break;
      case 'entails':
        // Entailed claims inherit parent's verification
        if (child.verified !== undefined) {
          supportScore += child.verified ? childConf * 0.7 : 0;
          contradictScore += child.verified ? 0 : childConf * 0.7;
        }
        break;
      case 'context':
        contextCount++;
        break;
    }
    childCount++;
  }

  // Compute aggregated belief for this node
  const totalEvidence = supportScore + contradictScore;
  if (totalEvidence > 0) {
    node.confidence = supportScore / totalEvidence;
    node.verified = node.confidence > 0.5;
  } else if (contextCount === childCount) {
    // Only context children — don't modify parent
    if (node.confidence === undefined) {
      node.confidence = 0.5;
      node.verified = undefined;
    }
  }
}

// ─── Hallucination Assessment ───────────────────────────────────────────────

/**
 * Assess hallucination probability for a claim using belief tree propagation.
 *
 * @param claim - The claim to assess
 * @param sources - Available sources for verification
 * @returns HallucinationAssessment with probability and belief tree
 */
export async function assessHallucination(
  claim: string,
  sources: Array<{ title: string; abstract: string; text?: string }>,
): Promise<HallucinationAssessment> {
  // Step 1: Build belief tree
  const tree = await buildBeliefTree(claim, 2);

  // Step 2: Verify all nodes against sources
  await verifyBeliefTree(tree, sources);

  // Step 3: Compute hallucination probability from root node
  const rootConfidence = tree.root.confidence ?? 0.5;
  const rootVerified = tree.root.verified;

  // Hallucination probability = 1 - confidence (if verified) or 1 - (1-confidence) if not verified
  let hallucinationProb: number;
  if (rootVerified === true) {
    hallucinationProb = 1 - rootConfidence;
  } else if (rootVerified === false) {
    hallucinationProb = rootConfidence;
  } else {
    // Unclear — moderate hallucination risk
    hallucinationProb = 0.5;
  }

  // Count node statuses
  let supportedNodes = 0, contradictedNodes = 0, unclearNodes = 0;
  for (const node of tree.nodes) {
    if (node.verified === true) supportedNodes++;
    else if (node.verified === false) contradictedNodes++;
    else unclearNodes++;
  }

  // Adjust probability based on tree-wide stats
  const totalNodes = tree.nodes.length;
  if (totalNodes > 1) {
    const supportRatio = supportedNodes / totalNodes;
    const contradictRatio = contradictedNodes / totalNodes;
    // Blend root confidence with tree-wide stats
    hallucinationProb = (hallucinationProb + (1 - supportRatio) + contradictRatio) / 3;
  }

  hallucinationProb = Math.max(0, Math.min(1, hallucinationProb));

  const reasoning = `Belief tree: ${totalNodes} nodes | Supported: ${supportedNodes} | Contradicted: ${contradictedNodes} | Unclear: ${unclearNodes} | Root confidence: ${Math.round(rootConfidence * 100)}%`;

  return {
    claim,
    hallucinationProbability: hallucinationProb,
    beliefTree: tree,
    supportedNodes,
    contradictedNodes,
    unclearNodes,
    reasoning,
    costUsd: 0,
  };
}
