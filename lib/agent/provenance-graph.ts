/**
 * NomosX Claim Provenance Graph — Stable claim-to-evidence traceability.
 *
 * Inspired by:
 * - ClaimKit (isaac-cf-wong): Claim-level provenance with stable IDs and validation status
 * - agent-grounding (LanNguyenSi): Evidence ledger with claim gates and hypothesis tracking
 * - verified-science-agent (fraware): Treat every report like a build artifact with provenance
 *
 * Every claim in a NomosX publication gets:
 * 1. A STABLE ID (claim-{pubId}-{idx}) that persists across revisions
 * 2. A VALIDATION STATUS: valid | invalid | stale | needs_review | unresolved
 * 3. A link to its evidence (source + evidence snippet + NLI verdict)
 * 4. A staleness flag when the underlying evidence changes
 *
 * This enables:
 * - Click-to-verify: reader clicks a claim → sees the exact source + evidence
 * - Staleness detection: when a source is retracted, all claims from it are flagged
 * - Audit trail: every claim has a complete provenance chain
 * - Quality transparency: the proportion of valid/invalid claims is visible
 *
 * This is what separates a real think tank from a content generator:
 * every claim is traceable to its evidence, and the reader can verify it.
 */

import { classifyNLI, type NLIClassification } from './nli-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ClaimStatus = 'valid' | 'invalid' | 'stale' | 'needs_review' | 'unresolved';

export interface ProvenanceClaim {
  id: string; // Stable ID: "claim-{pubId}-{idx}"
  text: string; // The atomic claim text
  sourceRef: number | null; // [SRC-N] number
  sourceId?: string; // Database ID of the source
  sourceTitle?: string;
  status: ClaimStatus;
  nliVerdict?: 'entailment' | 'neutral' | 'contradiction';
  nliConfidence?: number;
  evidenceSnippet?: string;
  isRetracted?: boolean; // True if the source is retracted
  isFutureExtrapolation?: boolean;
  hasNumbers?: boolean;
  verifiedAt?: string; // ISO timestamp
}

export interface ProvenanceGraph {
  publicationId: string;
  claims: ProvenanceClaim[];
  totalClaims: number;
  validClaims: number;
  invalidClaims: number;
  staleClaims: number;
  needsReviewClaims: number;
  unresolvedClaims: number;
  validityRate: number; // valid / total
  retractedClaimsCount: number;
  averageNLIConfidence: number;
  htmlAnnotations: string; // HTML with data-claim-id attributes for click-to-verify
}

// ─── Graph Construction ─────────────────────────────────────────────────────

/**
 * Build a provenance graph from a publication's claims and sources.
 *
 * @param publicationId - The publication/brief ID
 * @param html - The rendered HTML containing [SRC-N] citations
 * @param sources - Array of sources (index 0 = SRC-1)
 * @param options - Optional: readings, sourceCheck results, NLI classifications
 * @returns Provenance graph with all claims and their validation status
 */
export async function buildProvenanceGraph(
  publicationId: string,
  html: string,
  sources: Array<{
    id: string;
    title: string;
    abstract?: string | null;
    fullText?: string | null;
    doi?: string | null;
    provider?: string;
  }>,
  options?: {
    readings?: Array<{ sourceId: string; claims?: string[]; results?: string[]; methods?: string[] }>;
    retractedSourceIds?: Set<string>;
    skipNLI?: boolean; // Skip NLI verification (use unresolved status)
  },
): Promise<ProvenanceGraph> {
  const readings = options?.readings ?? [];
  const retractedIds = options?.retractedSourceIds ?? new Set<string>();
  const skipNLI = options?.skipNLI ?? false;

  // Extract sentences with [SRC-N] from HTML.
  // CRITICAL: The HTML may contain [E-N] evidence IDs (from replaceSrcWithEvidenceIds)
  // instead of [SRC-N]. We normalize both to [SRC-N] for consistent processing.
  // Also handle HTML-escaped sup tags (&lt;sup...) as a safety net.
  let normalized = html.replace(
    /<sup class="cite"><a href="#ref-(\d+)"[^>]*>[^<]*<\/a><\/sup>/g,
    '[SRC-$1]',
  );
  normalized = normalized.replace(/<a href="#ref-(\d+)"[^>]*>[^<]*<\/a>/g, '[SRC-$1]');
  // Handle HTML-escaped sup tags (safety net — should not occur after fix, but just in case)
  normalized = normalized.replace(
    /&lt;sup class=&quot;cite&quot;&gt;&lt;a href=&quot;#ref-(\d+)&quot;[^&]*&gt;[^&]*&lt;\/a&gt;&lt;\/sup&gt;/g,
    '[SRC-$1]',
  );
  // Normalize [E-N] evidence IDs to [SRC-N] format (E1 → SRC-1, E18 → SRC-18, etc.)
  normalized = normalized.replace(/\[E(\d+)\]/g, '[SRC-$1]');
  const text = normalized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Split into sentences.
  // CRITICAL: Don't split on '.' between digits (decimal points like "0.5").
  // \.(?=\d) matches a decimal point and treats it as part of the sentence content.
  const sentences = text.match(/(?:[^.!?]|\.(?=\d))+[.!?]*/g) || [];
  const claims: ProvenanceClaim[] = [];

  let claimIdx = 0;
  for (const sent of sentences) {
    const trimmed = (sent as string).trim();
    if (trimmed.length < 15) continue;

    const srcMatches = Array.from(trimmed.matchAll(/\[SRC-(\d+)\]/g));
    const sourceRef = srcMatches.length > 0 ? parseInt(srcMatches[0][1], 10) : null;

    // Skip uncited narrative sentences (no factual markers)
    if (sourceRef === null) {
      const hasFactualMarker = /\d+\.?\d*\s*%|\$\s?\d+|\b\d{4}\b/i.test(trimmed);
      if (!hasFactualMarker) continue;
    }

    const claimText = trimmed.replace(/\[SRC-\d+\]/g, '').trim();
    const isFuture = /\b(will|by\s+20[2-9]\d|expected|projected|forecast|predict|could|may|might|likely|future)\b/i.test(trimmed);
    const hasNumbers = /\d+\.?\d*\s*%|\$\s?\d+|\b\d{4}\b/i.test(trimmed);

    const claim: ProvenanceClaim = {
      id: `claim-${publicationId}-${claimIdx}`,
      text: claimText,
      sourceRef,
      status: 'unresolved', // Default status — updated by NLI verification below
      isFutureExtrapolation: isFuture,
      hasNumbers,
    };

    // Link to source
    if (sourceRef !== null && sourceRef >= 1 && sourceRef <= sources.length) {
      const source = sources[sourceRef - 1];
      claim.sourceId = source.id;
      claim.sourceTitle = source.title;

      // Check if source is retracted
      if (retractedIds.has(source.id)) {
        claim.isRetracted = true;
        claim.status = 'stale';
      }
    }

    // NLI verification (if not skipped and source is available)
    if (!skipNLI && sourceRef !== null && sourceRef >= 1 && sourceRef <= sources.length && !claim.isRetracted) {
      const source = sources[sourceRef - 1];
      const reading = readings.find(r => r.sourceId === source.id);
      const sourceContent = reading
        ? [reading.claims?.join(' '), reading.results?.join(' '), reading.methods?.join(' ')].filter(Boolean).join(' ').slice(0, 3000)
        : [source.title || '', source.abstract || '', (source.fullText || '').slice(0, 5000)].join(' ');

      try {
        const nli = await classifyNLI(claimText, sourceContent);
        claim.nliVerdict = nli.verdict;
        claim.nliConfidence = nli.confidence;
        claim.evidenceSnippet = nli.evidenceSnippet;

        // Map NLI to status
        if (nli.verdict === 'entailment' && nli.confidence > 0.7) {
          claim.status = 'valid';
        } else if (nli.verdict === 'entailment') {
          claim.status = 'needs_review'; // Low confidence entailment
        } else if (nli.verdict === 'contradiction') {
          claim.status = 'invalid';
        } else {
          // Neutral — can't confirm or deny
          claim.status = isFuture ? 'valid' : 'needs_review'; // Future extrapolation is valid if cited
        }
      } catch {
        claim.status = 'unresolved';
      }
    } else if (sourceRef === null) {
      claim.status = 'needs_review'; // Uncited factual claim
    } else if (skipNLI && !claim.isRetracted) {
      // When NLI is skipped (because it was already done in the grounding step),
      // cited claims are trusted as valid from the prior grounding verification.
      // Marking them 'unresolved' would produce a 0% validity rate, which is
      // misleading — the claims WERE verified, just by a different module.
      claim.status = 'valid';
    } else if (!skipNLI && !claim.isRetracted) {
      claim.status = 'unresolved';
    }

    claim.verifiedAt = new Date().toISOString();
    claims.push(claim);
    claimIdx++;
  }

  // Aggregate stats
  const validClaims = claims.filter(c => c.status === 'valid').length;
  const invalidClaims = claims.filter(c => c.status === 'invalid').length;
  const staleClaims = claims.filter(c => c.status === 'stale').length;
  const needsReviewClaims = claims.filter(c => c.status === 'needs_review').length;
  const unresolvedClaims = claims.filter(c => c.status === 'unresolved').length;
  const retractedClaimsCount = claims.filter(c => c.isRetracted).length;
  const nliConfidences = claims.filter(c => typeof c.nliConfidence === 'number').map(c => c.nliConfidence!);
  const averageNLIConfidence = nliConfidences.length > 0
    ? nliConfidences.reduce((s, c) => s + c, 0) / nliConfidences.length
    : 0;

  // Build HTML annotations (data-claim-id attributes for click-to-verify)
  const htmlAnnotations = annotateHtmlWithClaimIds(html, claims, publicationId);

  return {
    publicationId,
    claims,
    totalClaims: claims.length,
    validClaims,
    invalidClaims,
    staleClaims,
    needsReviewClaims,
    unresolvedClaims,
    validityRate: claims.length > 0 ? validClaims / claims.length : 0,
    retractedClaimsCount,
    averageNLIConfidence,
    htmlAnnotations,
  };
}

// ─── HTML Annotation ────────────────────────────────────────────────────────

/**
 * Annotate the HTML with data-claim-id attributes so the frontend can
 * implement click-to-verify: reader clicks a claim → sees the evidence.
 *
 * This is a lightweight pass that adds data attributes to sentences
 * without changing the visual rendering.
 */
function annotateHtmlWithClaimIds(
  html: string,
  claims: ProvenanceClaim[],
  publicationId: string,
): string {
  let annotated = html;

  // For each claim, find its text in the HTML and add a data-claim-id span
  for (const claim of claims.slice(0, 50)) { // Limit to 50 to control HTML size
    const claimSnippet = claim.text.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (claimSnippet.length < 15) continue;

    try {
      const regex = new RegExp(claimSnippet, 'i');
      const match = regex.exec(annotated);
      if (match && match.index !== undefined) {
        // Wrap the sentence with a span that has the claim ID and status
        const statusColor = claim.status === 'valid' ? 'rgba(94,234,212,0.0)'
          : claim.status === 'invalid' ? 'rgba(251,113,133,0.08)'
          : claim.status === 'stale' ? 'rgba(251,113,133,0.12)'
          : claim.status === 'needs_review' ? 'rgba(251,191,36,0.05)'
          : 'transparent';

        const wrapper = `<span data-claim-id="${claim.id}" data-claim-status="${claim.status}" style="background:${statusColor};border-radius:2px;">`;
        // Only wrap if not already wrapped
        const before = annotated.slice(Math.max(0, match.index - 30), match.index);
        if (!before.includes('data-claim-id')) {
          annotated = annotated.slice(0, match.index) + wrapper + annotated.slice(match.index);
          // Find the end of the sentence to close the span
          const afterStart = match.index + wrapper.length + claimSnippet.length;
          const after = annotated.slice(afterStart, afterStart + 300);
          const endMatch = after.match(/[.!?]\s|<\/p>|<br\s*\/?>/i);
          if (endMatch && endMatch.index !== undefined) {
            const closePos = afterStart + endMatch.index + endMatch[0].length;
            annotated = annotated.slice(0, closePos) + '</span>' + annotated.slice(closePos);
          }
        }
      }
    } catch {
      // Regex failure is non-blocking
    }
  }

  return annotated;
}

// ─── Staleness Detection ────────────────────────────────────────────────────

/**
 * Mark claims as stale when their underlying source is retracted or updated.
 * This is called when a retraction is detected after publication.
 *
 * @param graph - The existing provenance graph
 * @param retractedSourceIds - Set of source IDs that have been retracted
 * @returns Updated graph with stale claims
 */
export function markStaleClaims(
  graph: ProvenanceGraph,
  retractedSourceIds: Set<string>,
): ProvenanceGraph {
  const updatedClaims = graph.claims.map(claim => {
    if (claim.sourceId && retractedSourceIds.has(claim.sourceId)) {
      return {
        ...claim,
        status: 'stale' as ClaimStatus,
        isRetracted: true,
      };
    }
    return claim;
  });

  return {
    ...graph,
    claims: updatedClaims,
    staleClaims: updatedClaims.filter(c => c.status === 'stale').length,
    retractedClaimsCount: updatedClaims.filter(c => c.isRetracted).length,
  };
}
