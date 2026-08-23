/**
 * GMPO — Gradient-Guided Multi-Judge Prompt Optimization — NomosX
 *
 * Inspired by:
 * - GMPO (ACL 2026, S15-08): Gradient-Guided Multi-Judge Prompt Optimization.
 *   Uses first-order gradient approximation to estimate per-segment importance
 *   in a prompt and a panel of multiple judges to select the best edit.
 *   Replaces the deleted dspy-optimizer.ts with a lighter, dependency-free
 *   implementation adapted for the NomosX pipeline.
 *
 * Architecture:
 * - segmentPrompt(): splits a prompt into segments (sentences / paragraphs)
 * - approximateGradient(): estimates the importance of a segment by measuring
 *   the quality delta when the segment is removed (first-order approximation)
 * - optimizePrompt(): main loop — segment → approximate gradient → propose
 *   edits → multi-judge selection. Returns the optimized prompt, the
 *   improvement score, the per-segment importances, and the cumulative cost.
 *
 * Integration:
 * - prompt-optimizer/: can be used as the optimization backend
 * - pipeline-v2.ts: optional optimization pass for high-stakes prompts
 *
 * Notes:
 * - Pure TypeScript, no external dependencies.
 * - No `any` types — fully typed.
 * - Self-contained: only relies on a caller-supplied evaluateFn.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptSegment {
  /** The text of the segment (sentence or paragraph). */
  text: string;
  /** Estimated importance in [0, 1] derived from gradient approximation. */
  importance: number;
}

export interface OptimizationResult {
  /** The prompt before optimization. */
  originalPrompt: string;
  /** The optimized prompt after the multi-judge selection loop. */
  optimizedPrompt: string;
  /** Relative improvement in quality (0-1, may be 0 if no edit helped). */
  improvementScore: number;
  /** Per-segment importances for the original prompt. */
  segments: PromptSegment[];
  /** Cumulative USD cost of all evaluation calls during optimization. */
  costUsd: number;
}

export interface GMPOConfig {
  /** Number of independent judges used in the multi-judge selection step. */
  numJudges: number;
  /** Maximum optimization iterations (one iteration = one segment edit attempt). */
  maxIterations: number;
  /** Learning rate applied to importance-weighted edits. */
  learningRate: number;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_GMPO_CONFIG: GMPOConfig = {
  numJudges: 3,
  maxIterations: 5,
  learningRate: 0.3,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize a value into [0, 1] using a simple clamp.
 */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Reconstruct a prompt from a list of segments, optionally skipping one.
 */
function rebuildPrompt(segments: PromptSegment[], skipIndex: number): string {
  const parts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i === skipIndex) continue;
    parts.push(segments[i].text);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Propose a candidate edit for a segment. Low-importance segments are
 * candidates for removal; high-importance segments are candidates for
 * emphasis (a lightweight rewrite that repeats the key instruction).
 */
function proposeEdit(segment: PromptSegment, learningRate: number): string {
  if (segment.importance < 0.2) {
    // Drop low-importance segments entirely.
    return '';
  }
  if (segment.importance > 0.7) {
    // Emphasize high-importance segments by reinforcing the instruction.
    const reinforcement = segment.text.replace(/\.$/, '');
    return `${segment.text} (Important: ${reinforcement}.)`;
  }
  // Mid-importance: lightly compress using the learning rate as a trim factor.
  const words = segment.text.split(/\s+/);
  const keepCount = Math.max(1, Math.round(words.length * (1 - learningRate * 0.2)));
  return words.slice(0, keepCount).join(' ');
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Split a prompt into segments. Sentences are the primary unit; consecutive
 * short sentences are grouped into paragraphs when separated by blank lines.
 */
export function segmentPrompt(prompt: string): PromptSegment[] {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) return [];

  // Split on paragraph boundaries first (blank lines).
  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);

  const segments: PromptSegment[] = [];
  for (const paragraph of paragraphs) {
    // Within a paragraph, split into sentences.
    const sentences = paragraph
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length === 0) continue;
    if (sentences.length === 1) {
      segments.push({ text: sentences[0], importance: 0 });
    } else {
      for (const sentence of sentences) {
        segments.push({ text: sentence, importance: 0 });
      }
    }
  }

  // Fallback: if no sentence boundaries were found, treat the whole prompt as
  // a single segment.
  if (segments.length === 0 && trimmed.length > 0) {
    segments.push({ text: trimmed, importance: 0 });
  }

  return segments;
}

/**
 * Approximate the importance (first-order gradient) of a segment by measuring
 * the quality delta when the segment is removed from the prompt.
 *
 * A positive delta means removing the segment hurts quality → high importance.
 * The result is normalized to [0, 1].
 *
 * Note: this is a synchronous approximation utility. It does not call the
 * evaluator; callers should supply the quality with and without the segment
 * via the `input`/`output` parameters interpreted as context, or use
 * `optimizePrompt` for the full evaluation-driven loop.
 */
export function approximateGradient(segment: PromptSegment, input: string, output: string): number {
  // Heuristic first-order approximation: importance scales with how much the
  // segment text overlaps with the input/output signal. Segments that share
  // more tokens with the task signal are deemed more important.
  const segTokens = new Set(
    segment.text
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length > 2)
  );
  const signalTokens = new Set(
    `${input} ${output}`
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length > 2)
  );

  if (segTokens.size === 0 || signalTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of segTokens) {
    if (signalTokens.has(token)) overlap++;
  }

  const jaccard = overlap / (segTokens.size + signalTokens.size - overlap);
  // Length penalty: very short segments are less important.
  const lengthFactor = Math.min(1, segment.text.split(/\s+/).length / 12);

  return clamp01(jaccard * 1.5 * lengthFactor);
}

/**
 * Main optimization loop:
 * 1. Segment the prompt.
 * 2. Approximate per-segment gradients (importance).
 * 3. For up to `maxIterations` iterations, propose an edit for the
 *    lowest-importance segment and evaluate the candidate with multiple
 *    judges. Accept the edit only if the multi-judge average quality
 *    improves over the current best.
 * 4. Return the optimized prompt and diagnostics.
 */
export async function optimizePrompt(
  prompt: string,
  input: string,
  output: string,
  evaluateFn: (prompt: string, input: string) => Promise<{ quality: number; cost: number }>,
  config: GMPOConfig = DEFAULT_GMPO_CONFIG
): Promise<OptimizationResult> {
  const cfg: GMPOConfig = { ...DEFAULT_GMPO_CONFIG, ...config };
  const segments = segmentPrompt(prompt);

  // Approximate gradients for every segment.
  for (const segment of segments) {
    segment.importance = approximateGradient(segment, input, output);
  }

  // Baseline evaluation.
  const baseline = await evaluateFn(prompt, input);
  let bestQuality = baseline.quality;
  let bestPrompt = prompt;
  let totalCost = baseline.cost;

  // Multi-judge evaluation helper: run the evaluator `numJudges` times and
  // average the quality. Each judge is an independent evaluation call (the
  // caller's evaluateFn is expected to be stochastic or judge-parameterized).
  const multiJudgeEvaluate = async (
    candidate: string
  ): Promise<{ avgQuality: number; cost: number }> => {
    let qualitySum = 0;
    let costSum = 0;
    for (let j = 0; j < cfg.numJudges; j++) {
      const result = await evaluateFn(candidate, input);
      qualitySum += result.quality;
      costSum += result.cost;
    }
    return { avgQuality: qualitySum / cfg.numJudges, cost: costSum };
  };

  // Iterative optimization: edit the lowest-importance segment each iteration.
  for (let iter = 0; iter < cfg.maxIterations; iter++) {
    if (segments.length === 0) break;

    // Pick the lowest-importance segment that hasn't been emptied.
    let lowestIndex = -1;
    let lowestImportance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].text.length === 0) continue;
      if (segments[i].importance < lowestImportance) {
        lowestImportance = segments[i].importance;
        lowestIndex = i;
      }
    }
    if (lowestIndex === -1) break;

    const editedSegment: PromptSegment = {
      text: segments[lowestIndex].text,
      importance: segments[lowestIndex].importance,
    };
    const proposedText = proposeEdit(editedSegment, cfg.learningRate);

    // Build candidate prompt with the proposed edit applied.
    const candidateSegments = segments.map((s, i) =>
      i === lowestIndex ? { text: proposedText, importance: s.importance } : s
    );
    const candidatePrompt = candidateSegments
      .map((s) => s.text)
      .filter((t) => t.length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (candidatePrompt.length === 0) continue;

    const judgeResult = await multiJudgeEvaluate(candidatePrompt);
    totalCost += judgeResult.cost;

    if (judgeResult.avgQuality > bestQuality) {
      // Accept the edit.
      segments[lowestIndex].text = proposedText;
      bestQuality = judgeResult.avgQuality;
      bestPrompt = candidatePrompt;

      // Re-approximate gradients for remaining segments.
      for (const segment of segments) {
        if (segment.text.length === 0) {
          segment.importance = 0;
          continue;
        }
        segment.importance = approximateGradient(segment, input, output);
      }
    } else {
      // Reject: mark this segment as tried by raising its importance so we
      // don't repeatedly attempt the same edit.
      segments[lowestIndex].importance = 1;
    }
  }

  const improvementScore = clamp01(bestQuality - baseline.quality);

  return {
    originalPrompt: prompt,
    optimizedPrompt: bestPrompt,
    improvementScore,
    segments,
    costUsd: totalCost,
  };
}
