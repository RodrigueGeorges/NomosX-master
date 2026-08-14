/**
 * DPP (Determinantal Point Process) Synthesis — NomosX
 *
 * Inspired by:
 * - "Principled Content Selection for Multi-Document Summarization" (ACL 2025):
 *   Three-step approach: (1) reduce documents to atomic key points,
 *   (2) use DPP to select diverse key points, (3) rewrite to final summary.
 * - Addresses "lost in the middle" phenomenon in LLMs.
 * - Increases source coverage on multi-document tasks.
 *
 * Architecture:
 * - Step 1: Extract atomic key points from each source's readings
 * - Step 2: Compute similarity matrix between key points
 * - Step 3: Use greedy DPP approximation to select diverse, high-quality points
 * - Step 4: Return selected key points for ANALYST to synthesize
 *
 * Integration:
 * - pipeline-v2.ts: call selectDiverseKeyPoints() after READER, before ANALYST
 * - analyst-multipass.ts: use selected key points instead of raw abstracts
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AtomicKeyPoint {
  id: string;
  sourceId: string;
  sourceIndex: number;
  text: string;
  type: 'claim' | 'method' | 'result' | 'limitation' | 'context';
  importance: number; // 0-1
  novelty: number; // 0-1
  domains: string[];
}

export interface DPPSelection {
  selectedPoints: AtomicKeyPoint[];
  excludedPoints: AtomicKeyPoint[];
  diversityScore: number;
  coverageScore: number;
  sourceCoverage: Set<number>;
}

// ─── Step 1: Atomic Key Point Extraction ────────────────────────────────────

/**
 * Extract atomic key points from readings.
 * Each key point is a single, self-contained statement.
 */
export async function extractAtomicKeyPoints(
  readings: Array<{
    sourceId: string;
    sourceIndex: number;
    claims: string[];
    methods: string[];
    results: string[];
    limitations: string[];
    title?: string;
    abstract?: string;
  }>,
): Promise<AtomicKeyPoint[]> {
  const allPoints: AtomicKeyPoint[] = [];

  for (const reading of readings) {
    // Extract claims as key points
    for (const claim of reading.claims) {
      allPoints.push({
        id: `${reading.sourceId}-claim-${allPoints.length}`,
        sourceId: reading.sourceId,
        sourceIndex: reading.sourceIndex,
        text: claim,
        type: 'claim',
        importance: 0.8, // Claims are high importance
        novelty: assessNovelty(claim),
        domains: extractDomains(claim),
      });
    }

    // Extract results as key points
    for (const result of reading.results) {
      allPoints.push({
        id: `${reading.sourceId}-result-${allPoints.length}`,
        sourceId: reading.sourceId,
        sourceIndex: reading.sourceIndex,
        text: result,
        type: 'result',
        importance: 0.7,
        novelty: assessNovelty(result),
        domains: extractDomains(result),
      });
    }

    // Extract methods (lower importance for synthesis, but useful for diversity)
    for (const method of reading.methods.slice(0, 1)) { // Only top method
      allPoints.push({
        id: `${reading.sourceId}-method-${allPoints.length}`,
        sourceId: reading.sourceId,
        sourceIndex: reading.sourceIndex,
        text: method,
        type: 'method',
        importance: 0.4,
        novelty: 0.3,
        domains: extractDomains(method),
      });
    }

    // Extract limitations (important for balanced analysis)
    for (const limitation of reading.limitations.slice(0, 1)) {
      allPoints.push({
        id: `${reading.sourceId}-limitation-${allPoints.length}`,
        sourceId: reading.sourceId,
        sourceIndex: reading.sourceIndex,
        text: limitation,
        type: 'limitation',
        importance: 0.5,
        novelty: 0.3,
        domains: extractDomains(limitation),
      });
    }
  }

  return allPoints;
}

/**
 * Quick heuristic novelty assessment based on keywords.
 */
function assessNovelty(text: string): number {
  const novelKeywords = ['novel', 'first', 'new', 'unprecedented', 'breakthrough', 'challenge', 'contrary', 'reconsider'];
  const lowerText = text.toLowerCase();
  const matches = novelKeywords.filter(kw => lowerText.includes(kw)).length;
  return Math.min(matches / 3, 1);
}

/**
 * Extract domain tags from text (simple keyword matching).
 */
function extractDomains(text: string): string[] {
  const domainKeywords: Record<string, string[]> = {
    'economics': ['economic', 'market', 'trade', 'gdp', 'financial', 'fiscal', 'monetary'],
    'politics': ['political', 'policy', 'governance', 'election', 'democracy', 'regime'],
    'technology': ['ai', 'algorithm', 'digital', 'tech', 'cyber', 'data', 'platform'],
    'security': ['security', 'defense', 'military', 'conflict', 'war', 'threat'],
    'climate': ['climate', 'carbon', 'emission', 'environment', 'green', 'sustainable'],
    'health': ['health', 'medical', 'disease', 'pandemic', 'treatment', 'patient'],
    'law': ['legal', 'law', 'court', 'judicial', 'regulation', 'compliance'],
    'sociology': ['social', 'society', 'inequality', 'class', 'demographic', 'migration'],
  };

  const lowerText = text.toLowerCase();
  const domains: string[] = [];
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      domains.push(domain);
    }
  }
  return domains;
}

// ─── Step 2: Similarity Matrix ──────────────────────────────────────────────

/**
 * Compute similarity matrix between key points using pseudo-embeddings.
 * In production, replace with real embeddings (OpenAI, Cohere, etc.)
 */
function computeSimilarityMatrix(points: AtomicKeyPoint[]): number[][] {
  const n = points.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = textSimilarity(points[i].text, points[j].text);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }

  return matrix;
}

/**
 * Simple text similarity based on word overlap (Jaccard).
 * In production, replace with cosine similarity of embeddings.
 */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// ─── Step 3: Greedy DPP Selection ───────────────────────────────────────────

/**
 * Greedy DPP approximation for selecting diverse, high-quality key points.
 *
 * DPP objective: maximize sum of selected item qualities
 * while penalizing similarity between selected items.
 *
 * Greedy approach: iteratively select the point that maximizes
 * marginal gain = quality * (1 - max_similarity_to_selected)
 *
 * @param points - All atomic key points
 * @param targetCount - Number of points to select
 * @param qualityWeight - Weight for quality vs diversity (0-1, default 0.5)
 */
export function selectDiverseKeyPoints(
  points: AtomicKeyPoint[],
  targetCount: number = 20,
  qualityWeight: number = 0.5,
): DPPSelection {
  if (points.length <= targetCount) {
    return {
      selectedPoints: points,
      excludedPoints: [],
      diversityScore: 1,
      coverageScore: 1,
      sourceCoverage: new Set(points.map(p => p.sourceIndex)),
    };
  }

  const similarityMatrix = computeSimilarityMatrix(points);
  const selected: number[] = [];
  const excluded: number[] = [];
  const sourceCoverage = new Set<number>();

  // Quality score: blend of importance and novelty
  const qualityScores = points.map(p =>
    qualityWeight * p.importance + (1 - qualityWeight) * p.novelty
  );

  // Greedy selection
  for (let iter = 0; iter < targetCount; iter++) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < points.length; i++) {
      if (selected.includes(i)) continue;

      // Quality component
      const quality = qualityScores[i];

      // Diversity penalty: max similarity to any already-selected point
      let maxSim = 0;
      for (const j of selected) {
        maxSim = Math.max(maxSim, similarityMatrix[i][j]);
      }

      // Source coverage bonus: prefer points from new sources
      const sourceBonus = sourceCoverage.has(points[i].sourceIndex) ? 0 : 0.15;

      // Domain diversity bonus: prefer points with new domains
      const coveredDomains = new Set(
        selected.map(idx => points[idx].domains).flat()
      );
      const newDomains = points[i].domains.filter(d => !coveredDomains.has(d));
      const domainBonus = newDomains.length * 0.05;

      // Marginal gain
      const marginalGain = quality * (1 - maxSim * 0.7) + sourceBonus + domainBonus;

      if (marginalGain > bestScore) {
        bestScore = marginalGain;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      selected.push(bestIdx);
      sourceCoverage.add(points[bestIdx].sourceIndex);
    }
  }

  // Mark excluded
  for (let i = 0; i < points.length; i++) {
    if (!selected.includes(i)) excluded.push(i);
  }

  // Compute scores
  const diversityScore = computeDiversityScore(selected, similarityMatrix);
  const coverageScore = sourceCoverage.size / new Set(points.map(p => p.sourceIndex)).size;

  return {
    selectedPoints: selected.map(i => points[i]),
    excludedPoints: excluded.map(i => points[i]),
    diversityScore,
    coverageScore,
    sourceCoverage,
  };
}

function computeDiversityScore(selected: number[], similarityMatrix: number[][]): number {
  if (selected.length < 2) return 1;
  let totalSim = 0;
  let pairs = 0;
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      totalSim += similarityMatrix[selected[i]][selected[j]];
      pairs++;
    }
  }
  return 1 - (totalSim / pairs);
}

// ─── Step 4: Format for ANALYST ─────────────────────────────────────────────

/**
 * Format selected key points as a context block for the ANALYST.
 * This replaces raw abstracts with a curated, diverse set of key points.
 */
export function formatKeyPointsForAnalyst(selection: DPPSelection): string {
  const lines: string[] = ['=== CURATED KEY POINTS (DPP-Selected for Diversity) ==='];
  lines.push(`Selected ${selection.selectedPoints.length} key points from ${selection.sourceCoverage.size} sources`);
  lines.push(`Diversity score: ${Math.round(selection.diversityScore * 100)}% | Coverage: ${Math.round(selection.coverageScore * 100)}%`);
  lines.push('');

  // Group by type
  const byType: Record<string, AtomicKeyPoint[]> = {};
  for (const point of selection.selectedPoints) {
    if (!byType[point.type]) byType[point.type] = [];
    byType[point.type].push(point);
  }

  const typeOrder: Array<{ type: string; label: string }> = [
    { type: 'claim', label: 'KEY CLAIMS' },
    { type: 'result', label: 'KEY RESULTS' },
    { type: 'limitation', label: 'KEY LIMITATIONS' },
    { type: 'method', label: 'METHODOLOGICAL APPROACHES' },
    { type: 'context', label: 'CONTEXT' },
  ];

  for (const { type, label } of typeOrder) {
    const points = byType[type];
    if (!points || points.length === 0) continue;

    lines.push(`\n--- ${label} ---`);
    for (const point of points) {
      const domains = point.domains.length > 0 ? ` [${point.domains.join(', ')}]` : '';
      const novelty = point.novelty > 0.5 ? ' ⭐' : '';
      lines.push(`[SRC-${point.sourceIndex + 1}]${domains}${novelty} ${point.text}`);
    }
  }

  lines.push('\n=== END CURATED KEY POINTS ===\n');
  return lines.join('\n');
}
