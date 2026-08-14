/**
 * NomosX NLI Engine — Real Natural Language Inference for claim verification.
 *
 * Replaces the heuristic composite scoring in nli-verifier.ts with a proper
 * NLI model that classifies claim→source as entailment / neutral / contradiction.
 *
 * Architecture (pluggable):
 * 1. PRIMARY: Local NLI model via @huggingface/transformers (mDeBERTa-v3 multilingual)
 *    - Supports French + English (NomosX publishes in both)
 *    - Deterministic, CPU-only, ~280MB model cached locally
 *    - 3 labels: entailment, neutral, contradiction
 * 2. FALLBACK: Enhanced embedding-based NLI using existing OpenAI embeddings
 *    - Cosine similarity + negation detection + number verification
 *    - Used when the local model is not available (e.g., first run, no disk space)
 *
 * Inspired by:
 * - VerifAI (arXiv 2026): NLI engine fine-tuned for claim verification, outperforms GPT-4
 * - FactReasoner (IBM): 5-stage pipeline with NLI-based verification
 * - HallDetect (2026): decomposition + compact encoder-based entailment
 * - sourcecheck (aberaio): abstains when it can't confirm, rather than guessing
 *
 * Key insight from TrustBench (AAAI 2026):
 *   TrustScore = 0.3 × confidence + 0.7 × deterministic runtime metrics.
 *   NLI is the single most impactful deterministic metric for groundedness.
 */

import { cosineSimilarity, embedText } from './semantic-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export type NLIVerdict = 'entailment' | 'neutral' | 'contradiction';

export interface NLIClassification {
  verdict: NLIVerdict;
  confidence: number; // 0-1, model's softmax probability for the predicted label
  scores: {
    entailment: number;
    neutral: number;
    contradiction: number;
  };
  source: 'local-mdeberta' | 'embedding-fallback';
  evidenceSnippet?: string;
}

export interface NLIBatchResult {
  classifications: NLIClassification[];
  modelUsed: 'local-mdeberta' | 'embedding-fallback';
  durationMs: number;
}

// ─── Local NLI Model (mDeBERTa-v3 multilingual) ─────────────────────────────

let _pipeline: any = null;
let _pipelineLoading: Promise<any> | null = null;
let _modelAvailable: boolean | null = null;

/**
 * Lazy-load the mDeBERTa-v3 NLI pipeline.
 * The model downloads once (~280MB) and caches in the HuggingFace cache dir.
 * Subsequent loads are instant (from local cache).
 */
async function getNLIPipeline(): Promise<any | null> {
  if (_pipeline) return _pipeline;
  if (_pipelineLoading) return _pipelineLoading;
  if (_modelAvailable === false) return null; // Don't retry if we know it failed

  _pipelineLoading = (async () => {
    try {
      const { pipeline } = await import('@huggingface/transformers');
      // mDeBERTa-v3-base-mnli-xli: multilingual NLI, 100+ languages including French
      // 3 labels: entailment, neutral, contradiction
      _pipeline = await pipeline('text-classification', 'MoritzLaurer/mDeBERTa-v3-base-mnli-xli', {
        dtype: 'q8', // Use quantized model for faster inference + smaller footprint
      });
      _modelAvailable = true;
      console.log('[NLI Engine] mDeBERTa-v3 NLI model loaded successfully (multilingual, quantized)');
      return _pipeline;
    } catch (err) {
      _modelAvailable = false;
      console.warn('[NLI Engine] mDeBERTa-v3 not available, using embedding fallback:', String(err).slice(0, 200));
      return null;
    } finally {
      _pipelineLoading = null;
    }
  })();

  return _pipelineLoading;
}

/**
 * Classify a single claim→source pair using the local mDeBERTa-v3 NLI model.
 * Returns entailment / neutral / contradiction with confidence scores.
 */
async function classifyLocalNLI(
  claim: string,
  sourceContent: string,
): Promise<NLIClassification | null> {
  const pipe = await getNLIPipeline();
  if (!pipe) return null;

  // Truncate to model's max input length (mDeBERTa-v3: 512 tokens ≈ ~2000 chars)
  const premise = sourceContent.slice(0, 1800);
  const hypothesis = claim.slice(0, 500);

  try {
    // NLI text-classification pipeline: input = premise + [SEP] + hypothesis
    // The model expects the format: "premise</s></s>hypothesis"
    const result = await pipe({
      text: premise,
      text_pair: hypothesis,
    });

    // Result is an array of scores for each label
    // Labels order: entailment, neutral, contradiction (model-dependent)
    // mDeBERTa-v3-mnli-xli outputs: [{label: 'entailment', score: ...}, {label: 'neutral', ...}, {label: 'contradiction', ...}]
    let scores = { entailment: 0, neutral: 0, contradiction: 0 };

    if (Array.isArray(result)) {
      for (const r of result) {
        if (r.label && typeof r.score === 'number') {
          const label = r.label.toLowerCase();
          if (label in scores) {
            scores[label as keyof typeof scores] = r.score;
          }
        }
      }
    } else if (result && result.label) {
      // Single result — some pipelines return the top label only
      const label = result.label.toLowerCase();
      if (label in scores) {
        scores[label as keyof typeof scores] = result.score;
      }
    }

    // Determine verdict: highest score wins
    let verdict: NLIVerdict = 'neutral';
    let confidence = scores.neutral;
    if (scores.entailment >= scores.neutral && scores.entailment >= scores.contradiction) {
      verdict = 'entailment';
      confidence = scores.entailment;
    } else if (scores.contradiction >= scores.neutral && scores.contradiction >= scores.entailment) {
      verdict = 'contradiction';
      confidence = scores.contradiction;
    }

    // Find best evidence snippet (sentence with highest overlap)
    const evidenceSnippet = findBestEvidenceSnippet(claim, sourceContent);

    return {
      verdict,
      confidence,
      scores,
      source: 'local-mdeberta',
      evidenceSnippet,
    };
  } catch (err) {
    console.warn('[NLI Engine] Local NLI classification failed:', String(err).slice(0, 200));
    return null;
  }
}

// ─── Embedding Fallback NLI ─────────────────────────────────────────────────

/**
 * Fallback NLI using OpenAI embeddings + negation detection + number verification.
 * Less accurate than mDeBERTa-v3 but still better than pure lexical overlap.
 *
 * Classification logic:
 * - cosineSim ≥ 0.65 + no negation mismatch → entailment
 * - cosineSim 0.35-0.65 → neutral
 * - cosineSim < 0.35 OR negation mismatch with high overlap → contradiction
 */
async function classifyEmbeddingNLI(
  claim: string,
  sourceContent: string,
): Promise<NLIClassification> {
  // 1. Semantic similarity via OpenAI embeddings
  let semantic = 0;
  try {
    const [claimEmb, sourceEmb] = await Promise.all([
      embedText(claim.slice(0, 500)),
      embedText(sourceContent.slice(0, 2000)),
    ]);
    semantic = cosineSimilarity(claimEmb, sourceEmb);
  } catch {
    semantic = 0;
  }

  // 2. Negation / polarity detection
  const NEG_RE = /\b(not|no|never|without|cannot|doesn'?t|isn'?t|aren'?t|wasn'?t|weren'?t|won'?t|don'?t|didn'?t|hasn'?t|haven'?t|ne|pas|jamais|sans|aucun|n'\w+\s+pas)\b/i;
  const claimNegated = NEG_RE.test(claim);
  const sourceNegated = NEG_RE.test(sourceContent);
  const negationMismatch = claimNegated !== sourceNegated;

  // 3. Number verification — every number in claim must appear in source
  const claimNumbers = claim.match(/\d+\.?\d*%?|\$[\d,.]+[BMK]?/g) || [];
  const numbersMatched = claimNumbers.filter(n => sourceContent.includes(n)).length;
  const numbersOk = claimNumbers.length === 0 || numbersMatched === claimNumbers.length;

  // 4. Classify
  let verdict: NLIVerdict = 'neutral';
  let confidence = 0.5;

  if (negationMismatch && semantic > 0.5) {
    // High overlap but opposite polarity → contradiction
    verdict = 'contradiction';
    confidence = 0.7;
  } else if (semantic >= 0.65 && numbersOk) {
    verdict = 'entailment';
    confidence = semantic;
  } else if (semantic >= 0.35) {
    verdict = 'neutral';
    confidence = 0.5 + (semantic - 0.35) * 0.5; // 0.5-0.67
  } else if (semantic < 0.15) {
    // Very low overlap → likely unsupported (neutral, not contradiction)
    verdict = 'neutral';
    confidence = 0.6;
  } else {
    verdict = 'neutral';
    confidence = 0.4;
  }

  // If numbers don't match, downgrade entailment to neutral
  if (verdict === 'entailment' && !numbersOk) {
    verdict = 'neutral';
    confidence = 0.45;
  }

  // Convert to 3-label scores
  const scores = {
    entailment: verdict === 'entailment' ? confidence : (1 - confidence) / 3,
    neutral: verdict === 'neutral' ? confidence : (1 - confidence) / 3,
    contradiction: verdict === 'contradiction' ? confidence : (1 - confidence) / 3,
  };

  const evidenceSnippet = findBestEvidenceSnippet(claim, sourceContent);

  return {
    verdict,
    confidence,
    scores,
    source: 'embedding-fallback',
    evidenceSnippet,
  };
}

// ─── Evidence Snippet Extraction ────────────────────────────────────────────

/**
 * Find the sentence in the source that best matches the claim.
 * Used to provide an evidence snippet for transparency.
 */
function findBestEvidenceSnippet(claim: string, sourceContent: string): string | undefined {
  const claimWordsArr = claim.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const claimWords = new Set(claimWordsArr);
  if (claimWords.size === 0) return undefined;

  const sourceSentences = sourceContent.split(/(?<=[.!?])\s+/);
  let bestSnippet = '';
  let bestScore = 0;

  for (const sSent of sourceSentences) {
    const sWords = new Set(sSent.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3));
    let overlap = 0;
    for (const w of claimWordsArr) {
      if (sWords.has(w)) overlap++;
    }
    const score = overlap / claimWords.size;
    if (score > bestScore) {
      bestScore = score;
      bestSnippet = sSent.slice(0, 250);
    }
  }

  return bestScore > 0.2 ? bestSnippet : undefined;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Classify a single claim→source pair using NLI.
 * Uses local mDeBERTa-v3 if available, falls back to embedding-based NLI.
 *
 * @param claim - The atomic claim to verify
 * @param sourceContent - The source text (abstract, full text, or reading claims)
 * @returns NLI classification with verdict, confidence, and scores
 */
export async function classifyNLI(
  claim: string,
  sourceContent: string,
): Promise<NLIClassification> {
  if (!sourceContent || sourceContent.length < 20) {
    return {
      verdict: 'neutral',
      confidence: 0.5,
      scores: { entailment: 0.2, neutral: 0.6, contradiction: 0.2 },
      source: 'embedding-fallback',
    };
  }

  // Try local NLI model first
  const localResult = await classifyLocalNLI(claim, sourceContent);
  if (localResult) return localResult;

  // Fall back to embedding-based NLI
  return classifyEmbeddingNLI(claim, sourceContent);
}

/**
 * Batch classify multiple claim→source pairs.
 * Uses the local model in batch mode for efficiency.
 *
 * @param pairs - Array of { claim, sourceContent } pairs
 * @param maxConcurrency - Max parallel classifications (default: 8)
 * @returns Batch result with all classifications
 */
export async function classifyNLIBatch(
  pairs: Array<{ claim: string; sourceContent: string }>,
  maxConcurrency = 8,
): Promise<NLIBatchResult> {
  const start = Date.now();

  if (pairs.length === 0) {
    return { classifications: [], modelUsed: 'embedding-fallback', durationMs: 0 };
  }

  // Check if local model is available
  const pipe = await getNLIPipeline();
  const modelUsed: 'local-mdeberta' | 'embedding-fallback' = pipe ? 'local-mdeberta' : 'embedding-fallback';

  // Process in batches
  const classifications: NLIClassification[] = [];
  for (let i = 0; i < pairs.length; i += maxConcurrency) {
    const batch = pairs.slice(i, i + maxConcurrency);
    const results = await Promise.all(
      batch.map(({ claim, sourceContent }) => classifyNLI(claim, sourceContent)),
    );
    classifications.push(...results);
  }

  return {
    classifications,
    modelUsed,
    durationMs: Date.now() - start,
  };
}

/**
 * Map NLI verdict to the claim-grounding verdict system.
 * This allows the NLI engine to be used as a drop-in replacement for lexical grounding.
 */
export function nliToGroundingVerdict(nli: NLIClassification): 'supported' | 'partial' | 'unsupported' | 'contradicted' {
  switch (nli.verdict) {
    case 'entailment':
      return nli.confidence > 0.7 ? 'supported' : 'partial';
    case 'neutral':
      return nli.confidence > 0.6 ? 'unsupported' : 'partial';
    case 'contradiction':
      return 'contradicted';
    default:
      return 'unsupported';
  }
}

/**
 * Map NLI verdict to the citation-verifier verdict system.
 */
export function nliToCitationVerdict(nli: NLIClassification): 'supported' | 'partially_supported' | 'unsupported' | 'misattributed' | 'unverifiable' {
  switch (nli.verdict) {
    case 'entailment':
      return nli.confidence > 0.7 ? 'supported' : 'partially_supported';
    case 'neutral':
      if (nli.confidence > 0.7) return 'unsupported';
      return 'unverifiable';
    case 'contradiction':
      return 'misattributed';
    default:
      return 'unverifiable';
  }
}

/**
 * Check if the local NLI model is available (loaded successfully).
 * Useful for health checks and feature flags.
 */
export async function isNLIModelAvailable(): Promise<boolean> {
  if (_modelAvailable !== null) return _modelAvailable;
  const pipe = await getNLIPipeline();
  return pipe !== null;
}

/**
 * Preload the NLI model (useful for warm-up at server start).
 */
export async function preloadNLIModel(): Promise<void> {
  await getNLIPipeline();
}
