/**
 * TOPIC VIABILITY PROBE — cheap pre-dispatch surface check.
 *
 * Before the dispatcher spends a full inquiry (~60-90min, the whole
 * scout→reader→analyst→gate funnel) on an autonomous topic, probe whether
 * the topic has ANY retrievable surface area. Raw result counts are NOT
 * enough: Crossref returns fuzzy "best matches" for gibberish and feed
 * matchers accept any single query term — both produce phantom hits on
 * nonsense queries. The probe therefore counts only items that actually
 * mention the topic: ≥2 significant query terms in title/abstract (or the
 * single term when the query is very short).
 *
 * Deliberately conservative: only a near-zero REAL footprint skips the
 * funnel. Every failure is fail-open — a probe error means "proceed".
 *
 * Env:
 *   NOMOSX_VIABILITY_PROBE=0   — disable (default: enabled)
 *   VIABILITY_PROBE_MIN        — min relevant hits to pass (default 4)
 */

export interface ViabilityProbe {
  viable: boolean;
  relevant: number;
  raw: { openAlex: number; crossref: number; thinkTanks: number };
  terms: string[];
  threshold: number;
  durationMs: number;
  error?: string;
}

const PROBE_TIMEOUT_MS = 30_000;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'how', 'what', 'does', 'did', 'are', 'was',
  'were', 'will', 'would', 'could', 'should', 'their', 'there', 'this',
  'that', 'from', 'into', 'about', 'which', 'while', 'when', 'where',
  'why', 'who', 'not', 'can', 'its', 'our', 'your', 'has', 'have', 'had',
  'les', 'des', 'une', 'dans', 'pour', 'avec', 'sur', 'est', 'sont', 'par',
  'que', 'qui', 'son', 'sa', 'ses', 'aux', 'ces', 'cette', 'entre',
]);

function queryTerms(question: string): string[] {
  return question.toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(t => t.length > 3 && !STOPWORDS.has(t))
    .slice(0, 8);
}

function itemText(item: any): string {
  return [item?.title, item?.display_name, item?.abstract, item?.description]
    .filter(Boolean).join(' ').toLowerCase();
}

/** Count items whose text mentions enough of the query's own vocabulary. */
function relevantHits(items: any[], terms: string[]): number {
  if (terms.length === 0) return items.length;
  const need = terms.length <= 2 ? 1 : 2;
  return items.filter(item => {
    const text = itemText(item);
    if (!text) return false;
    return terms.filter(t => text.includes(t)).length >= need;
  }).length;
}

export async function probeTopicViability(question: string): Promise<ViabilityProbe> {
  const threshold = Number(process.env.VIABILITY_PROBE_MIN ?? 4);
  const t0 = Date.now();
  const q = question.slice(0, 300);
  const terms = queryTerms(question);

  const timed = <T>(p: Promise<T[]>): Promise<T[]> =>
    Promise.race([
      p,
      new Promise<T[]>((_, rej) => setTimeout(() => rej(new Error('probe timeout')), PROBE_TIMEOUT_MS)),
    ]);

  const [oa, cr, tt] = await Promise.allSettled([
    timed(import('../providers/openalex').then(m => m.searchOpenAlex(q, 8))),
    timed(import('../providers/crossref').then(m => m.searchCrossref(q, 8))),
    timed(import('../providers/institutional/think-tanks/global-think-tanks')
      .then(m => m.searchGlobalThinkTanks(q, 15))),
  ]);

  const raw = {
    openAlex: oa.status === 'fulfilled' ? oa.value.length : 0,
    crossref: cr.status === 'fulfilled' ? cr.value.length : 0,
    thinkTanks: tt.status === 'fulfilled' ? tt.value.length : 0,
  };
  const relevant =
    (oa.status === 'fulfilled' ? relevantHits(oa.value, terms) : 0) +
    (cr.status === 'fulfilled' ? relevantHits(cr.value, terms) : 0) +
    (tt.status === 'fulfilled' ? relevantHits(tt.value, terms) : 0);

  const rejected = [oa, cr, tt].filter(r => r.status === 'rejected');
  const errors = rejected
    .map(r => (r as PromiseRejectedResult).reason?.message ?? 'error').join('; ');

  // A probe that measured a BROKEN surface cannot establish "near-zero
  // footprint everywhere": circuit-broken providers contribute 0 hits on
  // every topic, not on weak ones (run-17: oa=0 cr=0 both tripped → a
  // gate-accepted subject skipped on a measurement of our own outage).
  // ≥2 channels down → surface unknown → proceed, per the fail-open contract.
  const viable = rejected.length >= 2 ? true : relevant >= threshold;

  return {
    viable,
    relevant, raw, terms, threshold,
    durationMs: Date.now() - t0,
    error: errors || undefined,
  };
}
