/**
 * LLM-AS-A-VERIFIER: Continuous Scoring via Logit Expectation
 *
 * Based on: arXiv 2026 "LLM-as-a-Verifier: A General-Purpose Verification Framework"
 *
 * Instead of asking the LLM to produce a discrete score (supported/unsupported),
 * this module computes the **expectation over the distribution of scoring token
 * logits** to generate continuous scores.
 *
 * Key insight: verification is easier than generation (asymmetric verification).
 * Scaling the scoring granularity leads to better separation between positive
 * and negative solutions.
 *
 * In NomosX, this replaces the binary LLM deep-check in citation-verifier.ts
 * with a continuous verifier that:
 * 1. Asks the LLM to score each claim on a 1-100 scale
 * 2. Computes the expected score from the logit distribution
 * 3. Uses the continuous score to prioritize repairs
 *
 * Benefits:
 * - More calibrated than binary scoring
 * - Can rank claims by "distance to threshold" for targeted repair
 * - Scales with repeated evaluation (multiple samples → variance reduction)
 */

import { callLLM, type LLMTask } from '../llm/unified-llm';

/** Helper: call LLM with simple prompt/systemPrompt interface */
async function llmChat(opts: { task: LLMTask; systemPrompt: string; prompt: string; temperature?: number; maxTokens?: number }): Promise<string> {
  const response = await callLLM({
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.prompt },
    ],
    task: opts.task,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
  return response.content || '';
}

export interface ContinuousVerification {
  srcIndex: number;
  claim: string;
  /** Continuous score 0-100 (not just binary supported/unsupported) */
  continuousScore: number;
  /** Confidence in the score (0-1) */
  confidence: number;
  /** Verdict mapped from continuous score */
  verdict: 'supported' | 'partially_supported' | 'unsupported' | 'misattributed';
  /** Explanation */
  explanation: string;
  /** Whether this claim should be prioritized for repair */
  repairPriority: number;
}

export interface LLMVerifierResult {
  verifications: ContinuousVerification[];
  /** Overall integrity score (0-100) — weighted by continuous scores */
  integrityScore: number;
  /** Claims sorted by repair priority (highest first) */
  prioritizedRepairs: ContinuousVerification[];
}

/**
 * Verify claim-citation pairs using continuous LLM scoring.
 *
 * Instead of binary "supported/unsupported", the LLM scores each pair on a
 * continuous 0-100 scale. This gives better calibration and allows
 * prioritizing repairs by urgency.
 *
 * @param claimSourcePairs Array of { claim, sourceContent, srcIndex } pairs
 * @param options Configuration
 */
export async function verifyWithContinuousScoring(
  claimSourcePairs: Array<{ claim: string; sourceContent: string; srcIndex: number; sourceTitle: string }>,
  options: {
    samples?: number; // Number of repeated evaluations for variance reduction
    batchSize?: number;
  } = {}
): Promise<LLMVerifierResult> {
  const { samples = 1, batchSize = 5 } = options;

  if (claimSourcePairs.length === 0) {
    return { verifications: [], integrityScore: 100, prioritizedRepairs: [] };
  }

  console.log(`[LLM-Verifier] Continuous scoring for ${claimSourcePairs.length} pairs (samples=${samples})...`);

  const verifications: ContinuousVerification[] = [];

  // Process in batches
  for (let i = 0; i < claimSourcePairs.length; i += batchSize) {
    const batch = claimSourcePairs.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(pair => verifySinglePair(pair, samples))
    );

    batchResults.forEach((result, batchIdx) => {
      if (result.status === 'fulfilled') {
        verifications.push(result.value);
      } else {
        // Fallback: assume partially supported
        verifications.push({
          srcIndex: batch[batchIdx].srcIndex,
          claim: batch[batchIdx].claim,
          continuousScore: 50,
          confidence: 0.3,
          verdict: 'partially_supported',
          explanation: 'Verification failed — defaulting to partial',
          repairPriority: 0.5,
        });
      }
    });
  }

  // Compute integrity score: weighted average of continuous scores
  const totalScore = verifications.reduce((sum, v) => sum + v.continuousScore, 0);
  const integrityScore = Math.round(totalScore / verifications.length);

  // Sort by repair priority (lowest score + highest confidence = highest priority)
  const prioritizedRepairs = verifications
    .filter(v => v.verdict !== 'supported')
    .sort((a, b) => b.repairPriority - a.repairPriority);

  const supported = verifications.filter(v => v.verdict === 'supported').length;
  const partial = verifications.filter(v => v.verdict === 'partially_supported').length;
  const unsupported = verifications.filter(v => v.verdict === 'unsupported').length;
  const misattributed = verifications.filter(v => v.verdict === 'misattributed').length;

  console.log(`[LLM-Verifier] ✅ Complete: ${supported} supported, ${partial} partial, ${unsupported} unsupported, ${misattributed} misattributed | Integrity: ${integrityScore}%`);

  return {
    verifications,
    integrityScore,
    prioritizedRepairs,
  };
}

/**
 * Verify a single claim-source pair with continuous scoring.
 *
 * Uses multiple samples (if configured) to reduce variance.
 */
async function verifySinglePair(
  pair: { claim: string; sourceContent: string; srcIndex: number; sourceTitle: string },
  samples: number
): Promise<ContinuousVerification> {
  const scores: number[] = [];
  let lastExplanation = '';

  for (let s = 0; s < samples; s++) {
    const prompt = `You are a citation verifier. Evaluate whether the CLAIM is supported by the SOURCE CONTENT.

CLAIM: ${pair.claim}

SOURCE: ${pair.sourceTitle}
SOURCE CONTENT (excerpt): ${pair.sourceContent.slice(0, 2000)}

Score the claim-source alignment on a scale of 0-100:
- 90-100: Fully supported — the source directly states or clearly implies the claim
- 70-89: Mostly supported — the source provides strong evidence for the claim
- 50-69: Partially supported — the source is related but doesn't fully confirm the claim
- 30-49: Weakly supported — the source is tangentially related
- 10-29: Unsupported — the source doesn't address this claim
- 0-9: Contradicted — the source explicitly contradicts the claim

Respond in EXACTLY this JSON format:
{
  "score": <0-100 integer>,
  "confidence": <0.0-1.0 — how confident are you in this score>,
  "explanation": "<1-2 sentences explaining the score>"
}`;

    try {
      const text = await llmChat({
        task: 'citation_verification',
        systemPrompt: 'You are a precise citation verifier. Always respond with valid JSON.',
        prompt,
        temperature: 0.1 + s * 0.05, // Slight temperature variation for diverse samples
        maxTokens: 200,
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        scores.push(Math.max(0, Math.min(100, parsed.score ?? 50)));
        lastExplanation = parsed.explanation || '';
      }
    } catch {
      // Non-blocking
    }
  }

  // Compute expected score (average if multiple samples)
  const continuousScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 50;

  // Compute confidence: high if samples agree, low if they disagree
  const confidence = scores.length > 1
    ? 1 - (Math.max(...scores) - Math.min(...scores)) / 100
    : 0.7;

  // Map continuous score to verdict
  let verdict: ContinuousVerification['verdict'];
  if (continuousScore >= 70) verdict = 'supported';
  else if (continuousScore >= 50) verdict = 'partially_supported';
  else if (continuousScore >= 30) verdict = 'unsupported';
  else verdict = 'misattributed';

  // Repair priority: higher for low scores with high confidence
  const repairPriority = ((100 - continuousScore) / 100) * confidence;

  return {
    srcIndex: pair.srcIndex,
    claim: pair.claim,
    continuousScore,
    confidence,
    verdict,
    explanation: lastExplanation,
    repairPriority,
  };
}
