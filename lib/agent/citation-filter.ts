/**
 * NomosX Citation Filter — Post-generation grounding enforcement
 *
 * Inspired by WueRAG (TREC 2025 #1) and DEER benchmark.
 *
 * Two-level policy:
 * 1. Uncited-claim flagging: sentences without [SRC-N] are never given
 *    borrowed citations (inheritance removed — it fabricated grounding);
 *    standalone uncited factual claims are candidates for removal.
 *    from the nearest preceding paragraph that has one (semantic proximity).
 * 2. Uncited claim flagging: sentences that still have no citation after
 *    back-tracking get a [UNCITED] marker so the editor can remove or fix them.
 *
 * This runs AFTER HTML rendering but BEFORE the critical loop, so the critical
 * loop can work on a cleaner draft.
 */

import { stripHtmlForEvidence, extractCitationNumbers } from './evidence-ledger';

const CLAIM_HINTS = [
  "shows", "suggests", "finds", "indicates", "increases", "reduces",
  "causes", "correlates", "evidence", "impact", "risk", "policy",
  "study", "research", "according", "demonstrates", "reveals", "highlights",
  "montre", "suggere", "indique", "augmente", "reduit", "preuve",
  "risque", "etude", "recherche", "prouve", "demontre",
];

export interface CitationFilterResult {
  filteredHtml: string;
  totalSentences: number;
  claimSentences: number;
  uncitedClaims: number;
  backtrackedClaims: number;
  removedSentences: number;
  citationCoverageBefore: number;
  citationCoverageAfter: number;
}

/**
 * Check if a sentence looks like a factual claim that needs a citation.
 */
function looksLikeClaim(sentence: string): boolean {
  const normalized = sentence.toLowerCase().trim();
  if (normalized.length < 45) return false;
  if (/\[SRC-\d+\]/.test(sentence)) return true;
  return CLAIM_HINTS.some((hint) => normalized.includes(hint));
}

/**
 * Apply implicit claim back-tracking and uncited sentence flagging to HTML.
 *
 * This works on the text content within HTML tags. It:
 * 1. Splits the visible text into sentences
 * 2. For each sentence that looks like a claim but has no [SRC-N], it is
 *    treated as uncited — never inherits a neighbouring citation
 * 3. Removes sentences that are standalone factual claims with numbers
 *    or strong factual markers and no citation of their own
 *
 * Non-claim sentences (narrative transitions, headings, questions) are preserved.
 */
export function applyCitationFilter(html: string): CitationFilterResult {
  const text = stripHtmlForEvidence(html);

  // Split into sentences.
  // CRITICAL: Don't split on '.' between digits (decimal points like "0.5" or "27.31").
  const allSentences = text.split(/(?<=[.!?])(?<!\d)\s+/).map(s => s.trim()).filter(Boolean);

  // Track which sentences are claims
  const claimFlags = allSentences.map(s => looksLikeClaim(s));
  const totalSentences = allSentences.length;
  const claimSentences = claimFlags.filter(Boolean).length;

  // Count citation coverage before
  const citedBefore = allSentences.filter((s, i) => claimFlags[i] && extractCitationNumbers(s).length > 0).length;
  const citationCoverageBefore = claimSentences > 0 ? citedBefore / claimSentences : 1;

  let backtrackedClaims = 0;
  let removedSentences = 0;
  const sentencesToRemove = new Set<number>();

  // Pass 1: Implicit claim back-tracking
  for (let i = 0; i < allSentences.length; i++) {
    if (!claimFlags[i]) continue;

    const citations = extractCitationNumbers(allSentences[i]);
    if (citations.length > 0) continue; // Already cited

    // Mark for removal if it's a standalone factual claim with no citation
    // Only remove if the sentence contains numbers or strong factual claims
    const hasNumbers = /\d+[%.,]/.test(allSentences[i]);
    const hasStrongClaim = /\b(is|are|was|were|has|have|will|must|should)\b/i.test(allSentences[i]);
    if (hasNumbers && hasStrongClaim) {
      sentencesToRemove.add(i);
    }
  }

  // Pass 2: Remove sentences marked for removal
  // We remove them from the HTML by finding their text content
  for (const idx of sentencesToRemove) {
    const sentence = allSentences[idx];
    const escaped = sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
    // Remove the sentence and surrounding whitespace
    const regex = new RegExp(`\\s*${escaped}[^.]*?\\.\\s*`, 'g');
    const before = html;
    html = html.replace(regex, ' ');
    if (html.length < before.length) {
      removedSentences++;
    }
  }

  // Recalculate coverage after
  const textAfter = stripHtmlForEvidence(html);
  const sentencesAfter = textAfter.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const claimFlagsAfter = sentencesAfter.map(s => looksLikeClaim(s));
  const claimSentencesAfter = claimFlagsAfter.filter(Boolean).length;
  const citedAfter = sentencesAfter.filter((s, i) => claimFlagsAfter[i] && extractCitationNumbers(s).length > 0).length;
  const citationCoverageAfter = claimSentencesAfter > 0 ? citedAfter / claimSentencesAfter : 1;

  const uncitedClaims = claimSentencesAfter - citedAfter;

  return {
    filteredHtml: html,
    totalSentences,
    claimSentences,
    uncitedClaims,
    backtrackedClaims,
    removedSentences,
    citationCoverageBefore,
    citationCoverageAfter,
  };
}
