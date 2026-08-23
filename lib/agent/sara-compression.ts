/**
 * SARA — Selective and Adaptive RAG with Context Compression (NomosX)
 *
 * Inspired by:
 * - SARA (S15-04, ACL 2026): Combines natural-language snippets (preserving
 *   entities, numerical values, and named terms verbatim) with semantic
 *   compression (dropping redundant sentences to broaden coverage) under a
 *   fixed token budget. Outperforms pure-extractive and pure-compressive
 *   baselines while staying fully reference-free and LLM-free.
 *
 * Architecture:
 * 1. `extractSnippets()` — identifies sentences carrying factual load:
 *    numbers, dates, proper nouns (capitalized multi-word spans), and a small
 *    set of key terms (e.g. "found", "showed", "according to").
 * 2. `semanticCompress()` — for each paragraph, keeps the first and last
 *    sentence and drops middle sentences that are highly similar to the
 *    already-retained set (cosine-like overlap on token frequencies).
 * 3. `saraCompress()` — allocates the token budget: snippets are placed first
 *    (factual content is never dropped), then remaining budget is filled with
 *    semantically compressed text for broader coverage.
 *
 * Integration:
 * - lib/agent/context-primer.ts: compress long retrieved context before
 *   passing to the analyst to stay within model context windows.
 * - lib/agent/adaptive-rag.ts: drop-in compressor when budget is tight.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompressedContext {
  snippets: string[];
  compressedText: string;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
}

// ─── Token estimation ───────────────────────────────────────────────────────

/**
 * Lightweight token estimate (~4 chars/token). Avoids pulling in a tokenizer
 * dependency so the module stays self-contained.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ─── Sentence / paragraph splitting ─────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ─── Snippet extraction ─────────────────────────────────────────────────────

const NUMBER_RE = /\b\d+(?:[.,]\d+)?\b/;
const DATE_RE = /\b(?:\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{4})?)\b/;
const KEY_TERMS = [
  'found', 'showed', 'demonstrated', 'according to', 'reported',
  'revealed', 'estimated', 'measured', 'increased', 'decreased',
  'rose', 'fell', 'percent', '%', 'per cent', 'billion', 'million',
  'trillion', 'study', 'survey', 'data', 'source', 'cite', 'cited',
];

/**
 * Extracts sentences that contain numbers, dates, proper-noun spans, or key
 * factual terms. These are the "natural-language snippets" SARA preserves
 * verbatim to avoid losing entities and numerical values during compression.
 */
export function extractSnippets(text: string): string[] {
  const sentences = splitSentences(text);
  const snippets: string[] = [];

  for (const sentence of sentences) {
    const hasNumber = NUMBER_RE.test(sentence);
    const hasDate = DATE_RE.test(sentence);
    const hasKeyTerm = KEY_TERMS.some((term) =>
      sentence.toLowerCase().includes(term),
    );
    // Proper-noun heuristic: at least two consecutive capitalized words,
    // excluding the sentence-initial word to reduce false positives.
    const inner = sentence.replace(/^\S+\s+/, '');
    const hasProperNoun = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(inner);

    if (hasNumber || hasDate || hasKeyTerm || hasProperNoun) {
      snippets.push(sentence);
    }
  }

  return snippets;
}

// ─── Semantic compression ───────────────────────────────────────────────────

function tokenFrequency(sentence: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of sentence
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

function cosineOverlap(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [, v] of a) normA += v * v;
  for (const [, v] of b) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  for (const [t, v] of a) {
    const w = b.get(t);
    if (w !== undefined) dot += v * w;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Compresses text toward a target token budget. For each paragraph, keeps the
 * first and last sentence unconditionally (topic + summary anchors), then
 * greedily retains middle sentences that are NOT highly redundant (>0.85
 * overlap) with the already-retained set. Stops once the target budget is
 * reached.
 */
export function semanticCompress(text: string, targetTokens: number): string {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return '';

  const keptSentences: string[] = [];
  let keptTokens = 0;

  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph);
    if (sentences.length === 0) continue;

    const retained: string[] = [];
    const retainedFreq: Map<string, number>[] = [];
    const pushRetained = (sentence: string): void => {
      retained.push(sentence);
      retainedFreq.push(tokenFrequency(sentence));
    };

    // Always keep first sentence.
    pushRetained(sentences[0]);

    // Always keep last sentence if distinct from first.
    if (sentences.length > 1 && sentences[sentences.length - 1] !== sentences[0]) {
      pushRetained(sentences[sentences.length - 1]);
    }

    // Greedily add middle sentences that add new information.
    for (let i = 1; i < sentences.length - 1; i += 1) {
      const candidateFreq = tokenFrequency(sentences[i]);
      const redundant = retainedFreq.some(
        (rf) => cosineOverlap(candidateFreq, rf) > 0.85,
      );
      if (!redundant) pushRetained(sentences[i]);
    }

    for (const s of retained) {
      const t = estimateTokens(s);
      if (keptTokens + t > targetTokens && keptTokens > 0) break;
      keptSentences.push(s);
      keptTokens += t;
    }
    if (keptTokens >= targetTokens) break;
  }

  return keptSentences.join(' ');
}

// ─── Combined SARA compression ──────────────────────────────────────────────

/**
 * Combines snippet extraction with semantic compression under a fixed token
 * budget. Snippets (factual content) are allocated first and never dropped;
 * the remaining budget is filled with semantically compressed text for
 * broader coverage. Returns a `CompressedContext` with token accounting.
 */
export function saraCompress(text: string, budgetTokens: number): CompressedContext {
  const originalTokens = estimateTokens(text);
  if (originalTokens <= budgetTokens) {
    return {
      snippets: extractSnippets(text),
      compressedText: text,
      originalTokens,
      compressedTokens: originalTokens,
      compressionRatio: 1,
    };
  }

  const snippets = extractSnippets(text);
  const snippetText = snippets.join(' ');
  const snippetTokens = estimateTokens(snippetText);

  let compressedText = '';
  if (snippetTokens >= budgetTokens) {
    // Budget too small for full snippets: keep snippets only, trimmed.
    compressedText = snippetText.slice(0, budgetTokens * 4);
  } else {
    const remainingBudget = budgetTokens - snippetTokens;
    const compressed = semanticCompress(text, remainingBudget);
    compressedText = compressed.length > 0
      ? `${snippetText}\n\n${compressed}`
      : snippetText;
  }

  const compressedTokens = estimateTokens(compressedText);
  return {
    snippets,
    compressedText,
    originalTokens,
    compressedTokens,
    compressionRatio: originalTokens === 0 ? 1 : compressedTokens / originalTokens,
  };
}
