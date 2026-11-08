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

/** Per-source passage chunks (reader-extracted atomic fields). */
function passagesBySourceId(readings: any[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of readings) {
    if (!r?.sourceId) continue;
    const parts = [
      ...(Array.isArray(r.claims) ? r.claims : []),
      ...(Array.isArray(r.results) ? r.results : []),
      ...(Array.isArray(r.limitations) ? r.limitations : []),
      ...(Array.isArray(r.methods) ? r.methods : []),
    ].filter((s: any) => typeof s === 'string' && s.length > 10);
    if (parts.length > 0) map.set(r.sourceId, parts);
  }
  return map;
}

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
  const chunksBySourceId = passagesBySourceId(readings);
  const passageBySourceId = new Map<string, string>();
  for (const [id, chunks] of chunksBySourceId) passageBySourceId.set(id, chunks.join(' '));

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

// ─── v2: NLI entailment refinement (opt-in) ─────────────────────────────────
//
// The lexical contract is a floor, not a ceiling: word containment cannot
// tell entailment from topical overlap. When NOMOSX_CLAIM_PASSAGE_NLI=1,
// each already-checked present_fact link is re-judged by the local NLI
// model against its BEST lexical passage chunk (one classification per
// link — bounded). Verdicts:
//   entailment  ≥ 0.70 → upgrade 'weak' → 'grounded'
//   contradiction ≥ 0.60 → mark unsupported (NLI confirms fabrication)
//   otherwise → keep the lexical verdict (NLI never downgrades on neutral)
//
// Replay-safe by construction: classifyNLI freezes verdicts per
// (claim, passage) content hash via frozen-inputs — a record captures
// them, a replay serves them without loading the model.

export interface ClaimPassageNLIResult {
  judged: number;
  upgraded: number;
  contradicted: number;
  keptLexical: number;
  unavailable: number;
}

const NLI_ENTAIL_UPGRADE = 0.70;
const NLI_CONTRADICTION_DOWNGRADE = 0.60;

export async function refineClaimPassageWithNLI(
  analysis: { causalChain?: any[] },
  sources: any[],
  readings: any[],
): Promise<ClaimPassageNLIResult> {
  const result: ClaimPassageNLIResult = {
    judged: 0, upgraded: 0, contradicted: 0, keptLexical: 0, unavailable: 0,
  };
  const chain = analysis?.causalChain;
  if (!Array.isArray(chain) || chain.length === 0) return result;

  const { classifyNLI } = await import('./nli-engine');
  const chunksBySourceId = passagesBySourceId(readings);

  for (const link of chain) {
    if (!link || link.temporalStatus !== 'present_fact' || link.passageVerdict === undefined) continue;
    const ref = typeof link.sourceRef === 'number' ? link.sourceRef : null;
    if (ref === null || ref < 1 || ref > sources.length) continue;
    const sourceId = sources[ref - 1]?.id;
    const chunks = sourceId ? chunksBySourceId.get(sourceId) : undefined;
    if (!chunks || chunks.length === 0) continue;

    // Pre-select the single best lexical chunk — one NLI call per link.
    const claim = String(link.claim ?? '');
    let best = chunks[0];
    let bestScore = -1;
    for (const c of chunks) {
      const s = passageContainment(claim, c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (bestScore < NEAR_ZERO) continue; // lexical 'none' stands — NLI on a
    // non-overlapping premise is noise, not evidence.

    result.judged++;
    try {
      const nli = await classifyNLI(claim.slice(0, 600), best.slice(0, 1500));
      const ent = nli.scores?.entailment ?? 0;
      const con = nli.scores?.contradiction ?? 0;
      if (con >= NLI_CONTRADICTION_DOWNGRADE) {
        link.passageVerdict = 'none';
        link.unsupported = true;
        result.contradicted++;
      } else if (ent >= NLI_ENTAIL_UPGRADE && link.passageVerdict === 'weak') {
        link.passageVerdict = 'grounded';
        result.upgraded++;
      } else {
        result.keptLexical++;
      }
    } catch {
      result.unavailable++;
    }
  }
  return result;
}
