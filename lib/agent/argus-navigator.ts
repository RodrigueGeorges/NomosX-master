/**
 * ARGUS: Evidence Assembly for Scalable Deep Research
 *
 * Based on: arXiv 2026 "Argus: Evidence Assembly for Scalable Deep Research Agents"
 *
 * Instead of N parallel rollouts that duplicate evidence, Argus treats deep research
 * as assembling a jigsaw from complementary evidence pieces:
 *
 * - **Searcher**: collects evidence traces for a given sub-query (ReAct-style)
 * - **Navigator**: maintains a shared evidence graph, verifies which pieces are
 *   still missing, dispatches Searchers to gather them, and reasons over the
 *   completed graph to produce a source-traced final answer.
 *
 * In NomosX, this refactors the SCOUT phase:
 * - Instead of launching 7 independent queries, a Navigator identifies evidence
 *   pieces needed and dispatches Searchers to collect them
 * - The evidence graph tracks which aspects of the query are covered
 * - Reduces redundancy by 30% and increases unique coverage by 20%
 */

import { callLLM, type LLMTask } from '../llm/unified-llm';

export interface EvidencePiece {
  id: string;
  /** Which sub-query this evidence addresses */
  subQuery: string;
  /** The source found */
  source: {
    title: string;
    abstract: string;
    url?: string;
    doi?: string;
    provider: string;
  };
  /** What aspect of the query this evidence covers */
  aspect: string;
  /** Relevance score 0-1 */
  relevance: number;
  /** Whether this evidence is unique (not redundant with others) */
  isUnique: boolean;
}

export interface EvidenceGap {
  /** The aspect that's missing */
  aspect: string;
  /** Suggested query to fill this gap */
  suggestedQuery: string;
  /** Priority (high/medium/low) */
  priority: 'high' | 'medium' | 'low';
}

export interface EvidenceGraph {
  /** All evidence collected so far */
  pieces: EvidencePiece[];
  /** Aspects of the query that are well-covered */
  coveredAspects: string[];
  /** Aspects that still need evidence */
  gaps: EvidenceGap[];
  /** Redundancy score (0-1, lower is better) */
  redundancyScore: number;
}

export interface ArgusResult {
  graph: EvidenceGraph;
  /** Final deduplicated, diverse source pool */
  sources: EvidencePiece['source'][];
  /** Number of Searcher dispatches */
  dispatchCount: number;
  /** Coverage score 0-100 */
  coverageScore: number;
}

/**
 * Navigator: analyze the query and identify what evidence pieces are needed.
 *
 * This is the "jigsaw" planning step — instead of blindly searching,
 * we first identify what pieces we need.
 */
export async function planEvidenceNeeds(query: string): Promise<string[]> {
  const prompt = `You are a research Navigator. Given a research query, identify the key evidence pieces needed to answer it comprehensively.

RESEARCH QUERY: ${query}

List 5-8 distinct evidence pieces needed. Each piece should cover a different aspect:
- Factual/empirical evidence (data, statistics)
- Theoretical/conceptual evidence (frameworks, models)
- Comparative evidence (cross-country, cross-sector)
- Historical evidence (trends, evolution)
- Counter-evidence (critiques, limitations)
- Policy/regulatory evidence
- Expert opinion/commentary

Respond as a JSON array of strings, each describing an evidence piece:
["evidence piece 1", "evidence piece 2", ...]`;

  try {
    const response = await callLLM({
      messages: [
        { role: 'system', content: 'You are a research planning assistant. Always respond with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      task: 'reflective_rag',
      temperature: 0.1,
      maxTokens: 500,
    });

    const text = response.content || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const pieces = JSON.parse(jsonMatch[0]) as string[];
      return pieces.slice(0, 8);
    }
  } catch {
    // Non-blocking
  }

  // Fallback: generate generic evidence pieces
  return [
    'Empirical data and statistics',
    'Theoretical frameworks and models',
    'Comparative analysis across contexts',
    'Historical trends and evolution',
    'Critiques and limitations',
    'Policy and regulatory context',
  ];
}

/**
 * Navigator: evaluate the evidence graph and identify gaps.
 *
 * After each Searcher batch, the Navigator checks what's covered
 * and what's still missing.
 */
export async function evaluateEvidenceGaps(
  query: string,
  currentEvidence: EvidencePiece[],
  plannedPieces: string[]
): Promise<EvidenceGap[]> {
  if (currentEvidence.length === 0) {
    return plannedPieces.map((aspect, i) => ({
      aspect,
      suggestedQuery: `${query} ${aspect.toLowerCase()}`,
      priority: i < 3 ? 'high' : 'medium',
    }));
  }

  // Build summary of current evidence
  const evidenceSummary = currentEvidence.map((e, i) =>
    `[${i + 1}] ${e.source.title} — aspect: ${e.aspect}, relevance: ${(e.relevance * 100).toFixed(0)}%`
  ).join('\n');

  const prompt = `You are a research Navigator. Evaluate the current evidence and identify what's still missing.

RESEARCH QUERY: ${query}

PLANNED EVIDENCE PIECES:
${plannedPieces.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CURRENT EVIDENCE COLLECTED (${currentEvidence.length} pieces):
${evidenceSummary}

Identify which planned pieces are NOT yet covered or need more evidence.
Respond as a JSON array:
[
  {
    "aspect": "<which planned piece is missing>",
    "suggestedQuery": "<a targeted search query to find this evidence>",
    "priority": "<high/medium/low>"
  }
]`;

  try {
    const response = await callLLM({
      messages: [
        { role: 'system', content: 'You are a research gap analyzer. Always respond with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      task: 'reflective_rag',
      temperature: 0.1,
      maxTokens: 500,
    });

    const text = response.content || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as EvidenceGap[];
    }
  } catch {
    // Non-blocking
  }

  // Fallback: return remaining planned pieces as gaps
  const coveredAspects = new Set(currentEvidence.map(e => e.aspect.toLowerCase()));
  return plannedPieces
    .filter(p => !coveredAspects.has(p.toLowerCase()))
    .map((aspect, i) => ({
      aspect,
      suggestedQuery: `${query} ${aspect.toLowerCase()}`,
      priority: i < 2 ? 'high' : 'medium',
    }));
}

/**
 * Compute redundancy score — how much evidence overlaps.
 */
function computeRedundancy(pieces: EvidencePiece[]): number {
  if (pieces.length < 2) return 0;

  // Group by aspect
  const byAspect = new Map<string, EvidencePiece[]>();
  for (const p of pieces) {
    const key = p.aspect.toLowerCase();
    if (!byAspect.has(key)) byAspect.set(key, []);
    byAspect.get(key)!.push(p);
  }

  // Redundancy = average pieces per aspect (minus 1, normalized)
  const avgPerAspect = pieces.length / byAspect.size;
  return Math.min(1, (avgPerAspect - 1) / 3); // 1 piece = 0, 4+ pieces = 1
}

/**
 * Build the final evidence graph from collected pieces.
 */
export function buildEvidenceGraph(
  pieces: EvidencePiece[],
  plannedAspects: string[],
  gaps: EvidenceGap[]
): EvidenceGraph {
  const coveredAspects = [...new Set(pieces.map(p => p.aspect))];
  const redundancyScore = computeRedundancy(pieces);

  return {
    pieces,
    coveredAspects,
    gaps,
    redundancyScore,
  };
}

/**
 * Deduplicate and select the best evidence pieces.
 *
 * For each aspect, keep only the most relevant piece (or top 2 if diverse).
 */
export function deduplicateEvidence(pieces: EvidencePiece[]): EvidencePiece[] {
  const byAspect = new Map<string, EvidencePiece[]>();
  for (const p of pieces) {
    const key = p.aspect.toLowerCase();
    if (!byAspect.has(key)) byAspect.set(key, []);
    byAspect.get(key)!.push(p);
  }

  const result: EvidencePiece[] = [];
  for (const [, groupPieces] of byAspect) {
    // Sort by relevance
    groupPieces.sort((a, b) => b.relevance - a.relevance);
    // Keep top 1-2 pieces per aspect
    result.push(groupPieces[0]);
    if (groupPieces.length > 1 && groupPieces[1].isUnique && groupPieces[1].relevance > 0.6) {
      result.push(groupPieces[1]);
    }
  }

  return result;
}
