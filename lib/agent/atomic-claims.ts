/**
 * NomosX Atomic Claim Decomposition — Decontextualized claim extraction.
 *
 * Inspired by:
 * - FactReasoner (IBM): 5-stage pipeline with atomic decomposition + decontextualization
 * - VeriScore: pipelined claim extraction → evidence retrieval → claim verification
 * - HallDetect (2026): decomposition + compact encoder-based entailment
 * - chaincheck: claim-level hallucination detection via NLI
 *
 * Decomposes complex paragraphs into atomic, decontextualized claims
 * that can be independently verified against sources.
 *
 * An atomic claim is a minimal unit of information that can be evaluated
 * for truthfulness independently. Example:
 *   "The study by Smith et al. (2023) found that carbon taxes reduce
 *    emissions by 15% in the first year [SRC-3]"
 * →
 *   Atomic claim 1: "Smith et al. (2023) found that carbon taxes reduce emissions"
 *   Atomic claim 2: "The reduction was 15% in the first year"
 *   Source: [SRC-3]
 *
 * Decontextualization resolves pronouns ("they" → "Smith et al."),
 * demonstratives ("this study" → "the 2023 carbon tax study"), and
 * incomplete names to make each claim standalone.
 *
 * Cost: ~$0.001 per paragraph (one LLM call, temp=0, json mode)
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AtomicClaim {
  id: string; // Stable ID: "claim-{paragraphIdx}-{claimIdx}"
  text: string; // Decontextualized atomic claim
  originalText: string; // Original sentence/clause from the text
  sourceRef: number | null; // [SRC-N] number
  paragraphIndex: number;
  claimIndex: number;
  hasNumbers: boolean; // Contains numerical data
  isFutureExtrapolation: boolean; // Prediction/forecast
}

export interface DecompositionResult {
  claims: AtomicClaim[];
  totalClaims: number;
  decontextualizedClaims: number;
  claimsWithNumbers: number;
  futureExtrapolationClaims: number;
  costUsd: number;
}

// ─── Decontextualization Prompt ─────────────────────────────────────────────

const DECOMPOSITION_PROMPT = `You are a factuality analyst. Decompose the following text into ATOMIC CLAIMS.

RULES:
1. Each atomic claim must be a SINGLE, self-contained factual assertion.
2. Decontextualize: resolve pronouns ("they" → "Smith et al."), demonstratives ("this study" → "the 2023 study by Smith"), and incomplete names.
3. Preserve ALL numbers, percentages, dates, and statistics — each number should be in its own atomic claim when possible.
4. Keep the [SRC-N] citation tag with the claim it supports.
5. Do NOT add information that isn't in the text.
6. Do NOT interpret or extrapolate — just decompose.
7. Mark future predictions/forecasts with isFutureExtrapolation: true.

TEXT TO DECOMPOSE:
"""
{text}
"""

Return JSON:
{
  "claims": [
    {
      "text": "Decontextualized atomic claim",
      "originalText": "Original sentence or clause",
      "sourceRef": 3,  // The N from [SRC-N], or null if no citation
      "hasNumbers": true,  // Does this claim contain numerical data?
      "isFutureExtrapolation": false  // Is this a prediction/forecast?
    }
  ]
}

Examples of good atomic claims:
- "Carbon taxes reduce CO2 emissions by 15% in the first year [SRC-3]"
  → { "text": "Carbon taxes reduce CO2 emissions by 15% in the first year", "sourceRef": 3, "hasNumbers": true }
- "They found significant effects [SRC-5]"
  → { "text": "Smith et al. (2023) found significant effects of carbon taxes on emissions", "sourceRef": 5, "hasNumbers": false }
- "This could reach 50% by 2030 [SRC-2]"
  → { "text": "Carbon tax coverage could reach 50% by 2030", "sourceRef": 2, "hasNumbers": true, "isFutureExtrapolation": true }`;

// ─── Fallback: Rule-based decomposition (no LLM) ────────────────────────────

/**
 * Fallback decomposition without LLM: split sentences, extract [SRC-N],
 * and keep as-is (no decontextualization).
 * This is what the existing claim-grounding.ts already does.
 */
function fallbackDecompose(
  text: string,
  paragraphIndex: number,
): AtomicClaim[] {
  const claims: AtomicClaim[] = [];

  // Split into sentences
  const sentences: string[] = text.match(/[^.!?]+[.!?]*/g) || [];
  sentences.forEach((sent, idx) => {
    const trimmed = (sent as string).trim();
    if (trimmed.length < 15) return;

    const srcMatches = Array.from(trimmed.matchAll(/\[SRC-(\d+)\]/g));
    const sourceRef = srcMatches.length > 0 ? parseInt(srcMatches[0][1], 10) : null;

    const hasNumbers = /\d+\.?\d*\s*%|\$\s?\d+|\b\d{4}\b|\b\d+[.,]?\d*\s*(?:billion|million|thousand)\b/i.test(trimmed);
    const isFuture = /\b(will|by\s+20[2-9]\d|expected|projected|forecast|predict|could|may|might|likely|future|going\s+to)\b/i.test(trimmed);

    claims.push({
      id: `claim-${paragraphIndex}-${idx}`,
      text: trimmed.replace(/\[SRC-\d+\]/g, '').trim(),
      originalText: trimmed,
      sourceRef,
      paragraphIndex,
      claimIndex: idx,
      hasNumbers,
      isFutureExtrapolation: isFuture,
    });
  });

  return claims;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Decompose a text into atomic, decontextualized claims.
 *
 * Uses LLM for proper decontextualization (pronoun resolution, etc.)
 * Falls back to rule-based sentence splitting if LLM fails.
 *
 * @param text - The text to decompose (HTML stripped, [SRC-N] preserved)
 * @param paragraphIndex - Index of the paragraph (for claim ID generation)
 * @returns Array of atomic claims
 */
export async function decomposeIntoAtomicClaims(
  text: string,
  paragraphIndex = 0,
): Promise<{ claims: AtomicClaim[]; costUsd: number; usedLLM: boolean }> {
  if (!text || text.trim().length < 20) {
    return { claims: [], costUsd: 0, usedLLM: false };
  }

  // Try LLM-based decomposition for better decontextualization
  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: DECOMPOSITION_PROMPT.replace('{text}', text.slice(0, 4000)) }],
      temperature: 0,
      jsonMode: true,
      maxTokens: 2000,
      enableCache: true,
      task: 'reader_v3',
    });

    const result = parseJson<{ claims: Array<{ text: string; originalText: string; sourceRef: number | null; hasNumbers: boolean; isFutureExtrapolation: boolean }> }>(response.content);

    if (result?.claims && Array.isArray(result.claims) && result.claims.length > 0) {
      const claims: AtomicClaim[] = result.claims.map((c, idx) => ({
        id: `claim-${paragraphIndex}-${idx}`,
        text: c.text || '',
        originalText: c.originalText || '',
        sourceRef: c.sourceRef ?? null,
        paragraphIndex,
        claimIndex: idx,
        hasNumbers: !!c.hasNumbers,
        isFutureExtrapolation: !!c.isFutureExtrapolation,
      }));

      return {
        claims,
        costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0,
        usedLLM: true,
      };
    }
  } catch (err) {
    console.warn('[AtomicDecompose] LLM decomposition failed, using fallback:', String(err).slice(0, 100));
  }

  // Fallback: rule-based decomposition
  return {
    claims: fallbackDecompose(text, paragraphIndex),
    costUsd: 0,
    usedLLM: false,
  };
}

/**
 * Decompose an entire HTML document into atomic claims.
 * Strips HTML, preserves [SRC-N] tags, and decomposes paragraph by paragraph.
 *
 * @param html - The HTML document to decompose
 * @param maxParagraphs - Maximum paragraphs to process (default: 50)
 * @returns Decomposition result with all atomic claims
 */
export async function decomposeHtmlIntoAtomicClaims(
  html: string,
  maxParagraphs = 50,
): Promise<DecompositionResult> {
  // Normalize <sup class="cite"> to [SRC-N] before stripping HTML
  let normalized = html.replace(
    /<sup class="cite"><a href="#ref-(\d+)"[^>]*>[^<]*<\/a><\/sup>/g,
    '[SRC-$1]',
  );
  normalized = normalized.replace(/<a href="#ref-(\d+)"[^>]*>[^<]*<\/a>/g, '[SRC-$1]');

  // Strip HTML tags
  const text = normalized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Split into paragraphs (by sentence groups)
  const paragraphs = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(p => p.length > 30);

  const allClaims: AtomicClaim[] = [];
  let totalCost = 0;
  let usedLLMCount = 0;

  // Process paragraphs (limit to control cost)
  const toProcess = paragraphs.slice(0, maxParagraphs);
  for (let i = 0; i < toProcess.length; i++) {
    const result = await decomposeIntoAtomicClaims(toProcess[i], i);
    allClaims.push(...result.claims);
    totalCost += result.costUsd;
    if (result.usedLLM) usedLLMCount++;
  }

  return {
    claims: allClaims,
    totalClaims: allClaims.length,
    decontextualizedClaims: usedLLMCount > 0 ? allClaims.length : 0,
    claimsWithNumbers: allClaims.filter(c => c.hasNumbers).length,
    futureExtrapolationClaims: allClaims.filter(c => c.isFutureExtrapolation).length,
    costUsd: totalCost,
  };
}
