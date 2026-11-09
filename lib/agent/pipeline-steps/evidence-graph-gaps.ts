// pipeline-steps/evidence-graph-gaps.ts — Argus-lite: claim→evidence DAG audit.
//
// The claim→passage contract (analyst-multipass) already marks present_fact
// causal links whose cited source's reading does not carry the claim
// (`passageVerdict: 'none'` / `unsupported: true`). Until now those marks
// only propagated trust downward — the missing support edge never became a
// retrieval target. Argus (arXiv 2605.16217) makes exactly this computable:
// an unsupported claim is a gap in the evidence DAG, and the Navigator
// dispatches a targeted search for THAT claim instead of re-running broad
// retrieval.
//
// This module derives blackboard gap requests from unsupported links —
// deterministic, zero LLM cost. The existing processGapRequests consumer
// scouts the claim-derived query, re-ranks, screens additions for
// relevance, and re-analyzes under the normal budget/headroom guards.
// In fixed-corpus replay the requests are drained without scouting, so the
// recorded call stream is unchanged.

export interface EvidenceGapRequest {
  /** Scout query derived from the unsupported claim text. */
  query: string;
  /** The claim that lacks passage-level support (audit trail). */
  claim: string;
  /** 1-based [SRC-N] index the claim cited — may be a mis-attribution. */
  citedSourceRef: number | null;
}

const MAX_GAP_REQUESTS = 3;
const QUERY_MAX = 200;

function toQueryText(claim: string): string {
  // Strip citation markers and collapse whitespace; keep it under the
  // scout query budget at a word boundary.
  const clean = claim.replace(/\[SRC-\d+\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= QUERY_MAX) return clean;
  const cut = clean.slice(0, QUERY_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Collect present_fact links the passage contract marked unsupported and
 * turn each into a targeted evidence request. Dedupes on normalized claim
 * text (the same unsupported claim cited twice is one gap). 'weak' verdicts
 * are intentionally excluded — the contract keeps them by design; only
 * near-zero/contradicted support warrants new retrieval spend.
 */
export function deriveEvidenceGapRequests(
  analysis: { causalChain?: any[] } | null | undefined,
): EvidenceGapRequest[] {
  const chain = analysis?.causalChain;
  if (!Array.isArray(chain)) return [];
  const seen = new Set<string>();
  const out: EvidenceGapRequest[] = [];
  for (const link of chain) {
    if (!link || typeof link !== 'object') continue;
    if (link.temporalStatus !== 'present_fact') continue;
    const unsupported = link.unsupported === true || link.passageVerdict === 'none';
    if (!unsupported) continue;
    const claim = typeof link.claim === 'string' ? link.claim.trim() : '';
    if (claim.length < 25) continue;
    const key = claim.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      query: toQueryText(claim),
      claim: claim.slice(0, 300),
      citedSourceRef: typeof link.sourceRef === 'number' ? link.sourceRef : null,
    });
    if (out.length >= MAX_GAP_REQUESTS) break;
  }
  return out;
}
