/**
 * NomosX Conflict-Aware Reasoning — Detect and preserve source contradictions.
 *
 * Inspired by:
 * - EvidentialRAG (2026): Convert sources to probabilistic evidence,
 *   preserve conflicts as epistemic uncertainty (Dempster-Shafer fusion)
 * - ConflictRAG (2026): Detect-classify-resolve-generate pipeline
 * - ConflictScore (2026): Quantify how well a model acknowledges conflicts
 * - CONFRAG (ACL 2026): Benchmark for contradiction-aware reasoning
 *
 * Key innovation: Instead of normalizing away contradictions (averaging
 * sources), this module DETECTS contradictions between sources and
 * injects them as explicit context for the analyst.
 *
 * The analyst then has three options:
 * 1. Direct answering (if consensus)
 * 2. Conflict-aware answering (if contradictions exist — acknowledge both sides)
 * 3. Abstention (if evidence is too conflicting)
 *
 * This is what separates a real think tank from a content generator:
 * acknowledging uncertainty instead of hiding it.
 *
 * Uses NLI engine for pairwise contradiction detection (free, deterministic).
 */

import { classifyNLI } from './nli-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SourceConflict {
  sourceAIndex: number;
  sourceBIndex: number;
  sourceATitle: string;
  sourceBTitle: string;
  claimA: string; // The claim from source A
  claimB: string; // The contradicting claim from source B
  conflictType: 'direct' | 'methodological' | 'contextual';
  confidence: number; // 0-1, NLI contradiction score
  explanation: string;
}

export interface ConflictDetectionResult {
  conflicts: SourceConflict[];
  totalPairsChecked: number;
  conflictCount: number;
  conflictRate: number; // conflicts / total pairs
  consensusRate: number; // 1 - conflictRate
  contextBlock: string; // Injected into analyst prompt
  costUsd: number;
}

// ─── Conflict Detection ─────────────────────────────────────────────────────

/**
 * Detect contradictions between sources using NLI.
 * For each pair of top sources, classify source A's main claim against
 * source B's main claim. If NLI says "contradiction", record it.
 *
 * To control cost, we only check:
 * - Top K sources (default: 10)
 * - Main claim from each source (from READER output: first claim)
 * - Pairs where both sources have claims (skip if no claims)
 *
 * Total pairs: K*(K-1)/2 = 45 for K=10
 * NLI calls: 45 (free, local model)
 */
export async function detectSourceConflicts(
  sources: Array<{
    id: string;
    title: string;
    abstract?: string | null;
    provider?: string;
  }>,
  readings?: Array<{
    sourceId: string;
    claims?: string[];
    results?: string[];
  }>,
  options?: { maxSources?: number; maxPairs?: number },
): Promise<ConflictDetectionResult> {
  const maxSources = options?.maxSources ?? 10;
  const maxPairs = options?.maxPairs ?? 45;

  const topSources = sources.slice(0, maxSources);
  const conflicts: SourceConflict[] = [];
  let pairsChecked = 0;

  // Build claim map: sourceId → main claim text
  const claimMap = new Map<number, { claim: string; title: string }>();
  for (let i = 0; i < topSources.length; i++) {
    const source = topSources[i];
    const reading = readings?.find(r => r.sourceId === source.id);
    const mainClaim =
      reading?.claims?.[0] ||
      reading?.results?.[0] ||
      source.abstract?.split('.')[0] ||
      source.title;
    claimMap.set(i, { claim: mainClaim.slice(0, 500), title: source.title });
  }

  // Check all pairs
  for (let i = 0; i < topSources.length && pairsChecked < maxPairs; i++) {
    for (let j = i + 1; j < topSources.length && pairsChecked < maxPairs; j++) {
      const a = claimMap.get(i);
      const b = claimMap.get(j);
      if (!a || !b) continue;

      pairsChecked++;

      // NLI: does source A's claim contradict source B's claim?
      try {
        const nli = await classifyNLI(a.claim, b.claim);
        if (nli.verdict === 'contradiction' && nli.confidence > 0.6) {
          conflicts.push({
            sourceAIndex: i,
            sourceBIndex: j,
            sourceATitle: a.title,
            sourceBTitle: b.title,
            claimA: a.claim.slice(0, 200),
            claimB: b.claim.slice(0, 200),
            conflictType: classifyConflictType(a.claim, b.claim),
            confidence: nli.confidence,
            explanation: `NLI contradiction (confidence ${(nli.confidence * 100).toFixed(0)}%): Source A claims "${a.claim.slice(0, 80)}..." while Source B claims "${b.claim.slice(0, 80)}..."`,
          });
        }
      } catch {
        // NLI failure is non-blocking
      }
    }
  }

  const conflictRate = pairsChecked > 0 ? conflicts.length / pairsChecked : 0;
  const consensusRate = 1 - conflictRate;

  // Build context block for analyst
  const contextBlock = buildConflictContextBlock(conflicts, consensusRate);

  return {
    conflicts,
    totalPairsChecked: pairsChecked,
    conflictCount: conflicts.length,
    conflictRate,
    consensusRate,
    contextBlock,
    costUsd: 0, // NLI is free (local model)
  };
}

// ─── Conflict Type Classification ───────────────────────────────────────────

/**
 * Classify the type of conflict between two claims.
 * - direct: Opposite conclusions on the same question
 * - methodological: Different methods leading to different results
 * - contextual: True in different contexts/populations
 */
function classifyConflictType(claimA: string, claimB: string): 'direct' | 'methodological' | 'contextual' {
  const a = claimA.toLowerCase();
  const b = claimB.toLowerCase();

  // Methodological: mentions of different methods
  if (/\b(method|methodology|approach|design|sample|dataset|model)\b/i.test(a + b)) {
    return 'methodological';
  }

  // Contextual: mentions of different contexts/populations
  if (/\b(in|among|for|population|country|region|context|setting)\b/i.test(a + b)) {
    if (/\b(different|various|specific|particular)\b/i.test(a + b)) {
      return 'contextual';
    }
  }

  // Default: direct contradiction
  return 'direct';
}

// ─── Context Block Builder ──────────────────────────────────────────────────

/**
 * Build a context block that summarizes detected conflicts for the analyst.
 * This is injected into the analyst prompt so the analyst is aware of
 * contradictions and can acknowledge them in the report.
 */
function buildConflictContextBlock(conflicts: SourceConflict[], consensusRate: number): string {
  if (conflicts.length === 0) {
    return `## SOURCE CONSENSUS ANALYSIS
Consensus rate: ${(consensusRate * 100).toFixed(0)}% — sources are largely in agreement.
No significant contradictions detected between sources.`;
  }

  const lines = [
    `## SOURCE CONFLICT ANALYSIS (EvidentialRAG pattern)`,
    `Consensus rate: ${(consensusRate * 100).toFixed(0)}% — ${conflicts.length} contradiction(s) detected.`,
    `You MUST acknowledge these contradictions in your analysis. Do NOT average away`,
    `conflicting evidence — present both sides and explain the disagreement.`,
    ``,
    `### Detected Contradictions:`,
  ];

  for (const c of conflicts.slice(0, 10)) {
    lines.push(``);
    lines.push(`**Conflict ${conflicts.indexOf(c) + 1}** (${c.conflictType}, confidence ${(c.confidence * 100).toFixed(0)}%):`);
    lines.push(`- Source [SRC-${c.sourceAIndex + 1}]: "${c.claimA}"`);
    lines.push(`- Source [SRC-${c.sourceBIndex + 1}]: "${c.claimB}"`);
    lines.push(`- Your task: Present both positions, explain why they disagree, and assess which is more credible given methodology and context.`);
    lines.push(`- V3.1: Consider SOURCE TYPE when assessing credibility — an academic study vs an intelligence report vs an NGO investigation may disagree because they measure different things or have different institutional biases. Note this in your explanation.`);
  }

  if (conflicts.length > 10) {
    lines.push(``);
    lines.push(`... and ${conflicts.length - 10} more contradictions.`);
  }

  return lines.join('\n');
}
