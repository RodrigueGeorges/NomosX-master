/**
 * HallDetect — Lightweight Reference-Free Hallucination Detection (NomosX)
 *
 * Inspired by:
 * - HallDetect (S15-07, arXiv 2026): Decomposed entailment with a contrastive
 *   formulation for reference-free hallucination detection. Runs as a
 *   lightweight complement to mDeBERTa-v3 NLI, catching internal
 *   contradictions and unsupported claims without an LLM in the loop.
 *
 * Architecture:
 * 1. `decomposeClaims()` — splits text into atomic, sentence-level claims.
 * 2. `detectInternalContradictions()` — checks pairs of claims for negation
 *    patterns, number conflicts, and date conflicts (contrastive signals).
 * 3. `detectUnsupportedClaims()` — lexical check that each claim's content
 *    terms appear in at least one provided source (reference-free in the
 *    sense of not requiring a trained entailment model; sources are optional
 *    grounding text).
 * 4. `hallDetect()` — combines all checks into a 0-100 hallucination risk
 *    score with per-claim flags and reasons.
 *
 * Integration:
 * - lib/agent/nli-verifier.ts: runs alongside mDeBERTa NLI as a cheap
 *   pre-filter; flagged claims can be escalated to the NLI model.
 * - lib/agent/critic-agent.ts: hallucination score feeds into overall quality.
 * - lib/agent/btprop-hallucination.ts: complementary probabilistic layer for
 *   borderline cases.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FlaggedClaim {
  claim: string;
  reason: string;
  confidence: number;
}

export interface ContradictionPair {
  claim1: string;
  claim2: string;
  reason: string;
}

export interface UnsupportedClaim {
  claim: string;
  reason: string;
}

export interface HallucinationScore {
  score: number;
  flaggedClaims: FlaggedClaim[];
}

// ─── Claim decomposition ────────────────────────────────────────────────────

/**
 * Splits text into atomic, sentence-level claims. Each claim is a trimmed
 * sentence. Clause-level splitting on "; " and " — " further decomposes
 * compound sentences into smaller atomic units.
 */
export function decomposeClaims(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const claims: string[] = [];
  for (const sentence of sentences) {
    const clauses = sentence
      .split(/\s*;\s*|\s+—\s+|\s+–\s+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    for (const clause of clauses) {
      // Ensure the clause reads as a standalone claim.
      const normalized = /[.!?]$/.test(clause) ? clause : `${clause}.`;
      claims.push(normalized);
    }
  }
  return claims;
}

// ─── Internal contradiction detection ───────────────────────────────────────

const NEGATION_CUES = [
  'not', 'no ', 'never', 'none', 'cannot', "can't", "doesn't", "isn't",
  "wasn't", "aren't", "weren't", "don't", "doesn't", "didn't", "won't",
  "wouldn't", "shouldn't", "couldn't", 'non-', 'without', 'fails to',
  'unable to', 'denies', 'rejects', 'contradicts',
];

const NUMBER_RE = /\b\d+(?:[.,]\d+)?\b/g;
const DATE_RE = /\b(?:\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{4})?)\b/g;

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

function hasNegation(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  return NEGATION_CUES.some((cue) => lower.includes(` ${cue}`) || lower.includes(cue));
}

/**
 * Detects contradictions between pairs of claims:
 * - Negation conflicts: two claims share content tokens but one is negated
 *   and the other is not.
 * - Number conflicts: two claims share strong content overlap but cite
 *   different numbers.
 * - Date conflicts: two claims share strong content overlap but cite
 *   different dates.
 */
export function detectInternalContradictions(claims: string[]): ContradictionPair[] {
  const contradictions: ContradictionPair[] = [];

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const c1 = claims[i];
      const c2 = claims[j];
      const t1 = contentTokens(c1);
      const t2 = contentTokens(c2);
      let intersection = 0;
      for (const t of t1) if (t2.has(t)) intersection += 1;
      const union = t1.size + t2.size - intersection;
      const overlap = union === 0 ? 0 : intersection / union;
      if (overlap < 0.4) continue;

      // Negation conflict.
      const neg1 = hasNegation(c1);
      const neg2 = hasNegation(c2);
      if (neg1 !== neg2) {
        contradictions.push({
          claim1: c1,
          claim2: c2,
          reason: 'Negation conflict: one claim asserts while the other negates.',
        });
        continue;
      }

      // Number conflict.
      const nums1 = c1.match(NUMBER_RE) ?? [];
      const nums2 = c2.match(NUMBER_RE) ?? [];
      if (nums1.length > 0 && nums2.length > 0) {
        const set1 = new Set(nums1);
        const shared = nums2.some((n) => set1.has(n));
        if (!shared) {
          contradictions.push({
            claim1: c1,
            claim2: c2,
            reason: `Number conflict: ${nums1.join(',')} vs ${nums2.join(',')}.`,
          });
          continue;
        }
      }

      // Date conflict.
      const dates1 = c1.match(DATE_RE) ?? [];
      const dates2 = c2.match(DATE_RE) ?? [];
      if (dates1.length > 0 && dates2.length > 0) {
        const set1 = new Set(dates1);
        const shared = dates2.some((d) => set1.has(d));
        if (!shared) {
          contradictions.push({
            claim1: c1,
            claim2: c2,
            reason: `Date conflict: ${dates1.join(',')} vs ${dates2.join(',')}.`,
          });
        }
      }
    }
  }

  return contradictions;
}

// ─── Unsupported claim detection ────────────────────────────────────────────

const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for',
  'with', 'as', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'this', 'that', 'these', 'those', 'it', 'its', 'at', 'from', 'which',
  'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how', 'can',
  'could', 'should', 'would', 'may', 'might', 'must', 'shall', 'will',
  'do', 'does', 'did', 'has', 'have', 'had', 'not', 'no', 'so', 'than',
  'then', 'there', 'their', 'they', 'them', 'we', 'you', 'your', 'our',
  'i', 'me', 'my', 'if', 'about', 'into', 'over', 'under', 'after',
  'before', 'between', 'during', 'through', 'without', 'within', 'said',
  'says', 'according', 'per', 'than',
]);

function contentTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Checks whether each claim's content terms appear in at least one source.
 * A claim is flagged as unsupported if fewer than half of its content terms
 * are found across all sources (lexical check, no LLM or model required).
 */
export function detectUnsupportedClaims(
  claims: string[],
  sources: string[],
): UnsupportedClaim[] {
  if (sources.length === 0) return [];
  const sourceText = sources.join(' \n ').toLowerCase();
  const sourceTokens = new Set(
    sourceText.split(/[^a-z0-9]+/).filter((t) => t.length > 2),
  );

  const unsupported: UnsupportedClaim[] = [];
  for (const claim of claims) {
    const terms = contentTerms(claim);
    if (terms.length === 0) continue;
    let found = 0;
    for (const term of terms) {
      if (sourceTokens.has(term)) found += 1;
    }
    const ratio = found / terms.length;
    if (ratio < 0.5) {
      unsupported.push({
        claim,
        reason: `Only ${found}/${terms.length} content terms found in sources (${(ratio * 100).toFixed(0)}%).`,
      });
    }
  }
  return unsupported;
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Combines all checks into a 0-100 hallucination risk score.
 * Scoring:
 * - Each internal contradiction contributes up to 30 points (weighted by
 *   the number of contradictions relative to claims).
 * - Each unsupported claim contributes up to 50 points (weighted by the
 *   share of claims that are unsupported). The weight was reduced from 70
 *   to 50 because lexical matching misses paraphrases, synonyms, and
 *   inferred claims — the old weight produced too many false positives.
 */
export function hallDetect(text: string, sources: string[]): HallucinationScore {
  const claims = decomposeClaims(text);
  if (claims.length === 0) {
    return { score: 0, flaggedClaims: [] };
  }

  const contradictions = detectInternalContradictions(claims);
  const unsupported = detectUnsupportedClaims(claims, sources);

  const contradictionRatio = Math.min(
    1,
    contradictions.length / Math.max(1, claims.length / 2),
  );
  const unsupportedRatio = unsupported.length / claims.length;

  const contradictionScore = contradictionRatio * 30;
  const unsupportedScore = Math.min(1, unsupportedRatio) * 50;
  const score = Math.round(Math.min(100, contradictionScore + unsupportedScore));

  const flaggedClaims: FlaggedClaim[] = [];
  const flaggedSet = new Set<string>();

  for (const c of contradictions) {
    for (const claim of [c.claim1, c.claim2]) {
      if (flaggedSet.has(claim)) continue;
      flaggedSet.add(claim);
      flaggedClaims.push({
        claim,
        reason: c.reason,
        confidence: 0.8,
      });
    }
  }

  for (const u of unsupported) {
    if (flaggedSet.has(u.claim)) {
      // Upgrade confidence if already flagged by a contradiction.
      const existing = flaggedClaims.find((f) => f.claim === u.claim);
      if (existing) {
        existing.reason = `${existing.reason} | ${u.reason}`;
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      }
      continue;
    }
    flaggedSet.add(u.claim);
    flaggedClaims.push({
      claim: u.claim,
      reason: u.reason,
      confidence: 0.6,
    });
  }

  return { score, flaggedClaims };
}
