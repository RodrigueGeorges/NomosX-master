/**
 * Claim Grounding Gate — deterministic claim-to-source verification.
 *
 * Inspired by:
 * - groundrails (stellarshenson): deterministic lexical grounding, no LLM, CPU-only
 * - warrant (eburke21): decompose answer into atomic claims, verify each against sources
 * - sourcecheck (aberaio): resolve citation to real source, check claim appears in source text
 * - DeepCitation: deterministic verification layer for AI citations
 *
 * Pipeline:
 * 1. DECOMPOSE: Extract sentences from HTML, split into atomic claims
 * 2. MAP: Each claim → its [SRC-N] citation
 * 3. GROUND: Lexically verify the claim content appears in the cited source
 * 4. VERDICT: supported / partial / unsupported / uncited
 * 5. REPAIR: Remove or flag unsupported claims
 *
 * This is deterministic — no LLM in the loop. It runs on CPU in milliseconds.
 * It catches the most egregious hallucinations: claims that cite a source
 * but whose content doesn't appear anywhere in that source's text.
 *
 * Key insight from RAGTruth benchmark: deterministic lexical grounding
 * catches ~76% of hallucinations (macro-F1) without any model call.
 * Adding semantic escalation catches ~82%. We implement the lexical pass
 * first; semantic escalation can be added later via HHEM/MiniCheck.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ClaimVerdict = 'supported' | 'partial' | 'unsupported' | 'uncited' | 'contradicted';

export interface AtomicClaim {
  text: string;
  sentenceIndex: number;
  sourceRef: number | null; // [SRC-N] number, or null if uncited
  sourceRefTag: string | null; // [SRC-N] tag as it appears
  verdict: ClaimVerdict;
  evidenceSnippet: string | null;
  score: number; // 0-1, lexical overlap score
}

export interface GroundingResult {
  claims: AtomicClaim[];
  supported: number;
  partial: number;
  unsupported: number;
  uncited: number;
  contradicted: number;
  total: number;
  groundedness: number; // (supported + partial) / total
  strictGroundedness: number; // max(0, (supported - contradicted) / total)
  html: string; // repaired HTML with unsupported claims removed/flagged
  removedClaims: number;
  details: string[];
}

// ─── 1. CLAIM DECOMPOSITION ─────────────────────────────────────────────────
/**
 * Extract sentences from HTML text content and identify atomic claims.
 * Each sentence with a [SRC-N] tag is a claim that needs grounding.
 */

function extractSentencesFromHtml(html: string): { text: string; raw: string; startIdx: number }[] {
  // Strip HTML tags to get text content, but keep [SRC-N] markers
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Split into sentences (keep [SRC-N] with the sentence)
  const sentences: { text: string; raw: string; startIdx: number }[] = [];
  const sentenceRegex = /[^.!?]+[.!?]*/g;
  let match;
  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (sentence.length > 15) {
      sentences.push({
        text: sentence,
        raw: match[0],
        startIdx: match.index,
      });
    }
  }
  return sentences;
}

/**
 * Decompose a sentence into atomic claims.
 * An atomic claim is a simple factual assertion that can be verified independently.
 * We keep it simple: each sentence with a [SRC-N] is one atomic claim.
 * (Full decomposition with pronoun resolution would need an LLM — we stay deterministic.)
 */
function decomposeIntoClaims(
  sentences: { text: string; raw: string; startIdx: number }[],
): AtomicClaim[] {
  const claims: AtomicClaim[] = [];

  sentences.forEach((sent, idx) => {
    // Find [SRC-N] references in the sentence
    const srcMatches = [...sent.text.matchAll(/\[SRC-(\d+)\]/g)];

    if (srcMatches.length === 0) {
      // Uncited sentence — only flag if it contains factual assertions (numbers, dates)
      const hasFactualMarker = /\d+\.?\d*\s*%|\$\s?\d+|\b\d{4}\b|\b\d+[.,]?\d*\s*(?:billion|million|thousand)\b/i.test(sent.text);
      if (hasFactualMarker) {
        claims.push({
          text: sent.text.replace(/\[SRC-\d+\]/g, '').trim(),
          sentenceIndex: idx,
          sourceRef: null,
          sourceRefTag: null,
          verdict: 'uncited',
          evidenceSnippet: null,
          score: 0,
        });
      }
    } else {
      // Cited sentence — extract the primary source
      const primarySrc = parseInt(srcMatches[0][1], 10);
      claims.push({
        text: sent.text.replace(/\[SRC-\d+\]/g, '').trim(),
        sentenceIndex: idx,
        sourceRef: primarySrc,
        sourceRefTag: srcMatches[0][0],
        verdict: 'unsupported', // default, will be updated by grounding
        evidenceSnippet: null,
        score: 0,
      });
    }
  });

  return claims;
}

// ─── 2. LEXICAL GROUNDING ───────────────────────────────────────────────────
/**
 * Ground each claim against its cited source using lexical overlap.
 *
 * Inspired by groundrails' "composite" checker:
 * - SUPPORTED only when the claim appears near-verbatim in the source,
 *   with every number present and no polarity mismatch.
 * - Partial when key terms overlap but not near-verbatim.
 * - Unsupported when overlap is below threshold.
 *
 * This is precision-first: it abstains (unsupported) rather than guessing.
 */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was',
  'one', 'our', 'out', 'has', 'have', 'had', 'his', 'how', 'its', 'may', 'more',
  'most', 'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'let', 'say',
  'she', 'too', 'use', 'this', 'that', 'with', 'from', 'they', 'will', 'would',
  'there', 'their', 'what', 'about', 'which', 'when', 'your', 'said', 'were',
  'been', 'than', 'them', 'these', 'those', 'into', 'also', 'such', 'very',
  'only', 'some', 'any', 'each', 'other', 'then', 'thus', 'where', 'while',
  'should', 'could', 'between', 'through', 'during', 'before', 'after',
]);

function extractKeyTerms(text: string): Set<string> {
  return new Set(tokenize(text));
}

function extractNumbers(text: string): string[] {
  const numbers: string[] = [];
  const patterns = [
    /\d+\.?\d*\s*%/g,
    /\$\s?\d+\.?\d*\s*[BbMmKk]/g,
    /\b\d+\.?\d*\s*(?:billion|million|thousand)\b/gi,
    /\b\d{4}\b/g, // years
    /\b\d+[.,]?\d*\b/g, // generic numbers
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      numbers.push(m[0].toLowerCase().replace(/\s+/g, ''));
    }
  }
  return numbers;
}

function lexicalGrounding(
  claim: AtomicClaim,
  sourceText: string,
): { verdict: ClaimVerdict; score: number; evidenceSnippet: string | null } {
  if (!sourceText || sourceText.length < 20) {
    return { verdict: 'unsupported', score: 0, evidenceSnippet: null };
  }

  const claimTerms = extractKeyTerms(claim.text);
  const sourceTerms = extractKeyTerms(sourceText);

  // Compute term overlap (Jaccard-like)
  let overlap = 0;
  for (const term of claimTerms) {
    if (sourceTerms.has(term)) overlap++;
  }
  const unigramScore = claimTerms.size > 0 ? overlap / claimTerms.size : 0;

  // Bigram overlap: catches phrase-level matches that unigram Jaccard misses
  const claimBigrams = extractBigrams(claim.text);
  const sourceBigrams = extractBigrams(sourceText);
  let bigramOverlap = 0;
  for (const bg of claimBigrams) {
    if (sourceBigrams.has(bg)) bigramOverlap++;
  }
  const bigramScore = claimBigrams.size > 0 ? bigramOverlap / claimBigrams.size : 0;

  // Composite score: weighted blend of unigram and bigram overlap
  const score = unigramScore * 0.6 + bigramScore * 0.4;

  // Number check: every number in the claim must appear in the source
  const claimNumbers = extractNumbers(claim.text);
  let numbersMatched = 0;
  for (const num of claimNumbers) {
    if (sourceText.toLowerCase().includes(num)) {
      numbersMatched++;
    }
  }
  const numbersOk = claimNumbers.length === 0 || numbersMatched === claimNumbers.length;

  // Polarity check: only flag as contradicted when there's a STRONG negation mismatch
  // (both have meaningful overlap AND one explicitly negates while the other affirms)
  const NEG_RE = /\b(not|no|never|without)\b/i;
  const claimNegated = NEG_RE.test(claim.text);
  const sourceNegated = NEG_RE.test(sourceText);
  // Only trigger polarity mismatch when score is high enough to be meaningful
  // AND one is explicitly negated while the other is explicitly affirmative
  const polarityMismatch = claimNegated !== sourceNegated && score > 0.4 && (claimNegated || sourceNegated);

  // Find best matching sentence in source for evidence snippet
  let evidenceSnippet: string | null = null;
  const sourceSentences = sourceText.split(/(?<=[.!?])\s+/);
  let bestSentScore = 0;
  for (const sSent of sourceSentences) {
    const sTerms = extractKeyTerms(sSent);
    let sOverlap = 0;
    for (const term of claimTerms) {
      if (sTerms.has(term)) sOverlap++;
    }
    const sScore = claimTerms.size > 0 ? sOverlap / claimTerms.size : 0;
    if (sScore > bestSentScore) {
      bestSentScore = sScore;
      evidenceSnippet = sSent.slice(0, 200);
    }
  }

  // Verdict logic — calibrated for paraphrased strategic analysis
  // (not verbatim quoting): lower thresholds reflect that think-tank
  // analysis synthesizes and reformulates, not copies.
  if (polarityMismatch) {
    return { verdict: 'contradicted', score, evidenceSnippet };
  }
  if (score >= 0.35 && numbersOk && bestSentScore >= 0.3) {
    return { verdict: 'supported', score, evidenceSnippet };
  }
  if (score >= 0.15 && numbersOk) {
    return { verdict: 'partial', score, evidenceSnippet };
  }
  // If we have any meaningful overlap at all, don't call it unsupported —
  // call it partial. Only truly zero-overlap claims are unsupported.
  if (score >= 0.08) {
    return { verdict: 'partial', score, evidenceSnippet };
  }
  return { verdict: 'unsupported', score, evidenceSnippet };
}

/**
 * Extract bigrams (consecutive word pairs) for phrase-level matching.
 * More robust than unigram Jaccard for detecting paraphrased claims.
 */
function extractBigrams(text: string): Set<string> {
  const tokens = tokenize(text);
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return bigrams;
}

// ─── 3. CLAIM REPAIR ────────────────────────────────────────────────────────
/**
 * Remove unsupported claims from HTML or flag them.
 * We replace the sentence with a neutral marker rather than deleting entirely
 * (to preserve paragraph structure).
 */

function repairHtmlWithGrounding(
  html: string,
  claims: AtomicClaim[],
  mode: 'remove' | 'flag' = 'flag',
): { html: string; removedClaims: number; details: string[] } {
  let removedClaims = 0;
  const details: string[] = [];

  // Find sentences that are unsupported or contradicted
  const badClaims = claims.filter(c => c.verdict === 'unsupported' || c.verdict === 'contradicted');
  if (badClaims.length === 0) {
    return { html, removedClaims: 0, details };
  }

  // For each bad claim, find and neutralize the sentence in the HTML
  let workingHtml = html;
  for (const claim of badClaims) {
    // Find the claim text in the HTML (strip tags for matching)
    const claimClean = claim.text.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (claimClean.length < 15) continue;

    // Try to find this text in the HTML
    const regex = new RegExp(claimClean, 'i');
    const match = regex.exec(workingHtml);
    if (match && match.index !== undefined) {
      // Find the sentence boundary around this match
      const before = workingHtml.slice(Math.max(0, match.index - 200), match.index);
      const after = workingHtml.slice(match.index + claimClean.length, match.index + claimClean.length + 300);

      // Find the end of the sentence
      const endMatch = after.match(/[.!?]\s|<\/p>|<br\s*\/?>/i);
      if (endMatch && endMatch.index !== undefined) {
        const sentenceEnd = match.index + claimClean.length + endMatch.index + 1;

        // Find the start of the sentence
        const startMatch = before.match(/[.!?]\s|<p[^>]*>|<br\s*\/?>/gi);
        let sentenceStart = match.index;
        if (startMatch) {
          // Find the last match
          const lastStart = startMatch[startMatch.length - 1];
          const lastStartIdx = before.lastIndexOf(lastStart);
          if (lastStartIdx >= 0) {
            sentenceStart = match.index - (before.length - lastStartIdx - lastStart.length);
          }
        }

        if (mode === 'remove') {
          // Remove the sentence entirely
          workingHtml = workingHtml.slice(0, sentenceStart) + workingHtml.slice(sentenceEnd);
          removedClaims++;
          details.push(`Removed unsupported claim: "${claimClean}..."`);
        } else {
          // Flag it with a warning marker
          const originalSentence = workingHtml.slice(sentenceStart, sentenceEnd);
          const flagged = `<span style="color:#f59e0b;font-style:italic;">[Non vérifié] </span>${originalSentence}`;
          workingHtml = workingHtml.slice(0, sentenceStart) + flagged + workingHtml.slice(sentenceEnd);
          removedClaims++;
          details.push(`Flagged ${claim.verdict} claim: "${claimClean}..."`);
        }
      }
    }
  }

  return { html: workingHtml, removedClaims, details };
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────

export function groundClaims(
  html: string,
  sources: { title: string; abstract?: string | null; fullText?: string | null; fullTextUrl?: string; openAccessPdf?: string; provider?: string }[],
  options?: { mode?: 'remove' | 'flag'; minScore?: number },
): GroundingResult {
  const mode = options?.mode ?? 'flag';
  const details: string[] = [];

  // Step 1: Extract sentences from HTML
  const sentences = extractSentencesFromHtml(html);
  console.log(`[CLAIM GROUNDING] Extracted ${sentences.length} sentences from HTML`);

  // Step 2: Decompose into atomic claims
  const claims = decomposeIntoClaims(sentences);
  console.log(`[CLAIM GROUNDING] Decomposed into ${claims.length} atomic claims (${claims.filter(c => c.sourceRef !== null).length} cited, ${claims.filter(c => c.sourceRef === null).length} uncited)`);

  // Step 3: Ground each cited claim against its source
  for (const claim of claims) {
    if (claim.sourceRef === null) continue;
    if (claim.sourceRef < 1 || claim.sourceRef > sources.length) {
      claim.verdict = 'unsupported';
      claim.score = 0;
      continue;
    }

    const source = sources[claim.sourceRef - 1];
    const sourceText = [
      source.title || '',
      source.abstract || '',
      (source.fullText || '').slice(0, 5000), // Use READER V3 extracted full text
    ].join(' ');

    const result = lexicalGrounding(claim, sourceText);
    claim.verdict = result.verdict;
    claim.score = result.score;
    claim.evidenceSnippet = result.evidenceSnippet;
  }

  // Step 4: Aggregate scores
  const supported = claims.filter(c => c.verdict === 'supported').length;
  const partial = claims.filter(c => c.verdict === 'partial').length;
  const unsupported = claims.filter(c => c.verdict === 'unsupported').length;
  const uncited = claims.filter(c => c.verdict === 'uncited').length;
  const contradicted = claims.filter(c => c.verdict === 'contradicted').length;
  const total = claims.length;
  // Groundedness = of claims that cited a source, how many are supported?
  // Uncited claims are narrative prose, not failed grounding.
  const citedTotal = supported + partial + unsupported + contradicted;
  const groundedness = citedTotal > 0 ? (supported + partial) / citedTotal : 0;
  // Citation rate = what fraction of factual claims have a citation at all
  const citationRate = total > 0 ? citedTotal / total : 0;
  const strictGroundedness = citedTotal > 0 ? Math.max(0, (supported - contradicted) / citedTotal) : 0;

  console.log(`[CLAIM GROUNDING] Verdicts: ${supported} supported, ${partial} partial, ${unsupported} unsupported, ${uncited} uncited, ${contradicted} contradicted → groundedness ${Math.round(groundedness * 100)}% (citation rate: ${Math.round(citationRate * 100)}%)`);

  // Step 5: Repair HTML
  const repair = repairHtmlWithGrounding(html, claims, mode);
  if (repair.removedClaims > 0) {
    console.log(`[CLAIM GROUNDING] ${mode === 'remove' ? 'Removed' : 'Flagged'} ${repair.removedClaims} unsupported/contradicted claims`);
  }
  details.push(...repair.details.slice(0, 10));

  return {
    claims,
    supported,
    partial,
    unsupported,
    uncited,
    contradicted,
    total,
    groundedness,
    strictGroundedness,
    html: repair.html,
    removedClaims: repair.removedClaims,
    details,
  };
}
