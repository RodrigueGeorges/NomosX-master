/**
 * Claim→passage evidence contract — deterministic, no LLM.
 *
 * Audit priority #1, second half: a [SRC-N] citation proves a claim points
 * at a SOURCE, not that the source's extracted content actually carries
 * the claim. CausalChain links already carry claim/evidence/warrant/
 * sourceRef — this module checks each present_fact link's claim text
 * against the cited source's READING passages (claims/results/
 * limitations extracted by the reader), and marks links whose claim has
 * no passage-level support as `unsupported` so the existing pruning
 * trust-propagation treats them accordingly.
 *
 * Deliberately conservative: only `present_fact` links are contract-
 * checked — mechanisms and future_extrapolation links are inferential by
 * design and legitimately outrun their immediate passages. A link is only
 * marked unsupported on a near-zero containment score, never on a weak
 * one — this contract removes fabricated citations, it does not police
 * phrasing.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'at', 'by',
  'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'that', 'this', 'these', 'those', 'it', 'its', 'their', 'his', 'her',
  'not', 'no', 'but', 'if', 'then', 'than', 'so', 'such', 'can', 'could',
  'will', 'would', 'may', 'might', 'must', 'shall', 'should', 'do', 'does',
  'did', 'has', 'have', 'had', 'into', 'over', 'under', 'between', 'through',
  'during', 'about', 'against', 'within', 'without', 'per', 'via', 'vs',
  'new', 'also', 'more', 'most', 'less', 'least', 'very', 'much', 'many',
  'some', 'any', 'all', 'each', 'other', 'which', 'who', 'whom', 'what',
  'when', 'where', 'why', 'how', 'there', 'here', 'they', 'them', 'we',
  'our', 'you', 'your', 'he', 'she', 'his', 'hers',
]);

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/);
  return new Set(words.filter(w => w.length > 2 && !STOPWORDS.has(w)));
}

/** Fraction of the claim's content words present in the passage corpus. */
export function passageContainment(claim: string, passageText: string): number {
  const claimWords = contentWords(claim);
  if (claimWords.size === 0) return 0;
  const passageWords = contentWords(passageText);
  if (passageWords.size === 0) return 0;
  let hits = 0;
  for (const w of claimWords) if (passageWords.has(w)) hits++;
  return hits / claimWords.size;
}

export interface ClaimPassageContractResult {
  checked: number;
  grounded: number;
  weak: number;
  unsupportedMarked: number;
  skippedNoReading: number;
}

const NEAR_ZERO = 0.08;   // below this: fabricated citation, mark unsupported
const WEAK = 0.20;        // below this: report only, keep the link

/**
 * Check every present_fact causalChain link against its cited source's
 * reading passages. Mutates links in place: sets `unsupported: true` on
 * near-zero containment and annotates `passageVerdict` for observability.
 * Returns a summary for stats/_meta.
 */
export function applyClaimPassageContract(
  analysis: { causalChain?: any[] },
  sources: any[],
  readings: any[],
): ClaimPassageContractResult {
  const result: ClaimPassageContractResult = {
    checked: 0, grounded: 0, weak: 0, unsupportedMarked: 0, skippedNoReading: 0,
  };
  const chain = analysis?.causalChain;
  if (!Array.isArray(chain) || chain.length === 0 || !Array.isArray(readings)) {
    return result;
  }

  // sourceId → concatenated passage corpus (reader-extracted fields only)
  const passageBySourceId = new Map<string, string>();
  for (const r of readings) {
    if (!r?.sourceId) continue;
    const parts = [
      ...(Array.isArray(r.claims) ? r.claims : []),
      ...(Array.isArray(r.results) ? r.results : []),
      ...(Array.isArray(r.limitations) ? r.limitations : []),
      ...(Array.isArray(r.methods) ? r.methods : []),
    ].filter((s: any) => typeof s === 'string');
    if (parts.length > 0) passageBySourceId.set(r.sourceId, parts.join(' '));
  }

  for (const link of chain) {
    if (!link || typeof link !== 'object') continue;
    // Only facts owe a passage contract — mechanisms/extrapolations are
    // inferential and legitimately outrun immediate passages.
    if (link.temporalStatus !== 'present_fact') continue;
    const claim = typeof link.claim === 'string' ? link.claim : '';
    const ref = typeof link.sourceRef === 'number' ? link.sourceRef : null;
    if (claim.trim().length < 15 || ref === null || ref < 1 || ref > sources.length) continue;

    const source = sources[ref - 1];
    const sourceId = source?.id;
    const passage = sourceId ? passageBySourceId.get(sourceId) : undefined;
    if (!passage) { result.skippedNoReading++; continue; }

    result.checked++;
    const score = passageContainment(claim, passage);
    if (score >= WEAK) {
      result.grounded++;
      link.passageVerdict = score >= NEAR_ZERO * 2.5 ? 'grounded' : 'weak';
      if (link.passageVerdict === 'weak') result.weak++;
    } else {
      // Near-zero containment: the cited source's extracted content does
      // not carry this claim — a fabricated or mis-attributed citation.
      link.passageVerdict = 'none';
      link.unsupported = true;
      result.unsupportedMarked++;
    }
  }
  return result;
}
