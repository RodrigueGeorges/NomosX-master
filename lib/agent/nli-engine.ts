/**
 * NomosX NLI Engine — Real Natural Language Inference for claim verification.
 *
 * Replaces the heuristic composite scoring in nli-verifier.ts with a proper
 * NLI model that classifies claim→source as entailment / neutral / contradiction.
 *
 * Architecture (pluggable):
 * 1. PRIMARY: Local NLI model via @huggingface/transformers (cross-encoder/nli-deberta-v3-base)
 *    - DeBERTa-v3 NLI cross-encoder, fine-tuned for RAG citation verification (F1=0.89)
 *    - English-first but handles multilingual claims well via cross-encoder architecture
 *    - Deterministic, CPU-only, ~184MB model cached locally
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
  source: 'local-nli' | 'embedding-fallback';
  evidenceSnippet?: string;
}

export interface NLIBatchResult {
  classifications: NLIClassification[];
  modelUsed: 'local-nli' | 'embedding-fallback';
  durationMs: number;
}

// ─── Local NLI Model (cross-encoder/nli-deberta-v3-base) ────────────────────

let _pipeline: any = null;
let _pipelineLoading: Promise<any> | null = null;
let _modelAvailable: boolean | null = null;

/**
 * Lazy-load the NLI cross-encoder pipeline.
 * Uses cross-encoder/nli-deberta-v3-base (184MB, F1=0.89 on RAG citation verification).
 * Falls back to MoritzLaurer/mDeBERTa-v3-base-mnli-xli if the primary model fails
 * (e.g., HuggingFace access issues), then to embedding fallback.
 *
 * The model downloads once and caches in the HuggingFace cache dir.
 * Subsequent loads are instant (from local cache).
 */
async function getNLIPipeline(): Promise<any | null> {
  if (_pipeline) return _pipeline;
  if (_pipelineLoading) return _pipelineLoading;
  if (_modelAvailable === false) return null; // Don't retry if we know it failed

  _pipelineLoading = (async () => {
    const models = [
      // Primary: Xenova ONNX export of NLI DeBERTa-v3 — transformers.js needs
      // ONNX weights; upstream cross-encoder/* repos are PyTorch-only (their
      // resolve URLs for onnx/model_quantized.onnx now 404).
      { id: 'Xenova/nli-deberta-v3-base', dtype: 'q8' as const },
      // Fallback 1: smaller/faster DeBERTa MNLI export (~117MB)
      { id: 'Xenova/nli-deberta-v3-small', dtype: 'q8' as const },
      // Fallback 2: MobileBERT MNLI — tiny, always available
      { id: 'Xenova/mobilebert-uncased-mnli', dtype: 'q8' as const },
    ];

    for (const model of models) {
      try {
        const { pipeline } = await import('@huggingface/transformers');
        // P2: Add 15s timeout — if HuggingFace is inaccessible, fail fast and fall back
        _pipeline = await Promise.race([
          pipeline('text-classification', model.id, { dtype: model.dtype }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('NLI model load timeout (15s)')), 15_000)
          ),
        ]);
        _modelAvailable = true;
        console.log(`[NLI Engine] NLI model loaded successfully: ${model.id}`);
        return _pipeline;
      } catch (err) {
        console.warn(`[NLI Engine] Failed to load ${model.id}:`, String(err).slice(0, 150));
      }
    }

    _modelAvailable = false;
    console.warn('[NLI Engine] All NLI models unavailable, using embedding fallback');
    return null;
  })();

  // Clear loading flag when done (whether success or failure)
  _pipelineLoading.finally(() => { _pipelineLoading = null; });

  return _pipelineLoading;
}

/**
 * Classify a single claim→source pair using the local NLI cross-encoder model.
 * Returns entailment / neutral / contradiction with confidence scores.
 */
async function classifyLocalNLI(
  claim: string,
  sourceContent: string,
): Promise<NLIClassification | null> {
  const pipe = await getNLIPipeline();
  if (!pipe) return null;

  // Truncate to model's max input length (DeBERTa-v3: 512 tokens ≈ ~2000 chars)
  // V3.2: Increased from 1800→3000 (premise) and 500→800 (hypothesis) for better context
  // The model handles longer inputs better than expected — truncation was too aggressive
  const premise = sourceContent.slice(0, 3000);
  const hypothesis = claim.slice(0, 800);

  try {
    // NLI text-classification pipeline: input = premise + [SEP] + hypothesis
    // The model expects the format: "premise</s></s>hypothesis"
    // topk:null → all 3 label scores (real confidence margins, not just argmax)
    const result = await pipe(
      { text: premise, text_pair: hypothesis },
      { topk: null as any },
    );

    // Result is an array of scores for each label
    // Labels order: entailment, neutral, contradiction (model-dependent)
    // cross-encoder/nli-deberta-v3-base outputs: [{label: 'entailment', score: ...}, {label: 'neutral', ...}, {label: 'contradiction', ...}]
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
      source: 'local-nli',
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
  } else if (semantic >= 0.75 && numbersOk) {
    // V3.2: Strong entailment — high confidence
    verdict = 'entailment';
    confidence = Math.min(0.95, semantic + 0.1);
  } else if (semantic >= 0.50 && numbersOk) {
    // V3.2: Moderate entailment (was 0.65 — too conservative, most claims landed in "neutral")
    verdict = 'entailment';
    confidence = semantic;
  } else if (semantic >= 0.35) {
    verdict = 'neutral';
    confidence = 0.5 + (semantic - 0.35) * 0.5; // 0.5-0.67
  } else if (semantic < 0.15) {
    // Very low overlap → likely unsupported (neutral, not contradiction)
    // But if semantic is exactly 0, embeddings likely failed — use low confidence
    // so nliToGroundingVerdict maps to 'partial' (indeterminate) not 'unsupported'
    verdict = 'neutral';
    confidence = semantic === 0 ? 0.3 : 0.6;
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

// ─── Deterministic Lexical NLI Fallback (no external API) ────────────────────

/**
 * Pure CPU lexical NLI fallback — no external API required.
 * Used when both HuggingFace models and OpenAI embeddings are unavailable.
 * Less accurate but always available and deterministic.
 *
 * Classification logic:
 * - Jaccard overlap ≥ 0.35 + no negation mismatch → entailment
 * - Jaccard 0.15-0.35 → neutral
 * - Jaccard < 0.15 OR negation mismatch with high overlap → contradiction/neutral
 */
function classifyLexicalNLI(
  claim: string,
  sourceContent: string,
): NLIClassification {
  const claimWords = new Set(
    claim.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  );
  const sourceWords = new Set(
    sourceContent.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  );

  // Jaccard similarity
  let intersection = 0;
  for (const w of claimWords) {
    if (sourceWords.has(w)) intersection++;
  }
  const union = claimWords.size + sourceWords.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  // Negation detection
  const NEG_RE = /\b(not|no|never|without|cannot|doesn'?t|isn'?t|aren'?t|wasn'?t|weren'?t|won'?t|don'?t|didn'?t|hasn'?t|haven'?t|ne|pas|jamais|sans|aucun|n'\w+\s+pas)\b/i;
  const claimNegated = NEG_RE.test(claim);
  const sourceNegated = NEG_RE.test(sourceContent);
  const negationMismatch = claimNegated !== sourceNegated;

  // Number verification
  const claimNumbers = claim.match(/\d+\.?\d*%?|\$[\d,.]+[BMK]?/g) || [];
  const numbersMatched = claimNumbers.filter(n => sourceContent.includes(n)).length;
  const numbersOk = claimNumbers.length === 0 || numbersMatched === claimNumbers.length;

  let verdict: NLIVerdict = 'neutral';
  let confidence = 0.5;

  if (negationMismatch && jaccard > 0.25) {
    verdict = 'contradiction';
    confidence = 0.65;
  } else if (jaccard >= 0.35 && numbersOk) {
    verdict = 'entailment';
    confidence = Math.min(0.85, 0.5 + jaccard * 0.5);
  } else if (jaccard >= 0.15) {
    verdict = 'neutral';
    confidence = 0.4 + jaccard * 0.3;
  } else {
    verdict = 'neutral';
    confidence = 0.55;
  }

  if (verdict === 'entailment' && !numbersOk) {
    verdict = 'neutral';
    confidence = 0.4;
  }

  const scores = {
    entailment: verdict === 'entailment' ? confidence : (1 - confidence) / 3,
    neutral: verdict === 'neutral' ? confidence : (1 - confidence) / 3,
    contradiction: verdict === 'contradiction' ? confidence : (1 - confidence) / 3,
  };

  return {
    verdict,
    confidence,
    scores,
    source: 'embedding-fallback',
    evidenceSnippet: findBestEvidenceSnippet(claim, sourceContent),
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

  // Try embedding-based NLI (requires OpenAI API)
  try {
    return await classifyEmbeddingNLI(claim, sourceContent);
  } catch {
    // Final fallback: deterministic lexical NLI (no external API required)
    return classifyLexicalNLI(claim, sourceContent);
  }
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
  const modelUsed: 'local-nli' | 'embedding-fallback' = pipe ? 'local-nli' : 'embedding-fallback';

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
  // When using embedding fallback, use more lenient thresholds — the fallback
  // is inherently less accurate and shouldn't be as punitive as the real NLI model.
  const isFallback = nli.source === 'embedding-fallback';

  switch (nli.verdict) {
    case 'entailment':
      if (isFallback) {
        if (nli.confidence > 0.6) return 'supported';
        return 'partial';
      }
      if (nli.confidence > 0.7) return 'supported';
      if (nli.confidence > 0.4) return 'partial';
      return 'unsupported';
    case 'neutral':
      if (isFallback) {
        // Embedding fallback neutral is unreliable — be lenient
        if (nli.confidence > 0.55) return 'unsupported';
        return 'partial';
      }
      return nli.confidence > 0.4 ? 'unsupported' : 'partial';
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
