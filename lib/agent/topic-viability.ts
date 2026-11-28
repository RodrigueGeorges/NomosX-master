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
 * Dual surface: the subject question is probed first, the verified
 * forecastQuestion (when present) as an alternate. The forecast question's
 * verification vocabulary (deadlines, "explicitly addresses", "implement")
 * does not literally appear in real documents — probing it alone skips
 * gate-passed topics that have a large genuine surface (canary: "US AI
 * policy frameworks × industry self-regulation" skipped at 2 hits while
 * the subject is a major literature area). The funnel scouts the subject
 * question, so the subject is the primary surface; a topic is skipped
 * only when BOTH surfaces measure near-zero.
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

function itemKey(item: any): string {
  return String(item?.url ?? item?.href ?? item?.doi ?? item?.id ?? item?.title ?? item?.display_name ?? '')
    .toLowerCase().trim();
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

export async function probeTopicViability(question: string, altQuestion?: string): Promise<ViabilityProbe> {
  const threshold = Number(process.env.VIABILITY_PROBE_MIN ?? 4);
  const t0 = Date.now();
  const queries = [...new Set(
    [question.trim(), altQuestion?.trim() ?? '']
      .filter(q => q.length > 0)
      .map(q => q.slice(0, 300)),
  )].slice(0, 2);
  const terms = [...new Set(queries.flatMap(queryTerms))].slice(0, 12);

  const timed = <T>(p: Promise<T[]>): Promise<T[]> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS);
      p.then(resolve, reject).finally(() => clearTimeout(timer));
    });

  // Each query hits all three channels; a channel is only "down" when it
  // failed for EVERY query — a per-query timeout is not a channel outage.
  const perQuery = await Promise.all(queries.map(q =>
    Promise.allSettled([
      timed(import('../providers/openalex').then(m => m.searchOpenAlex(q, 8))),
      timed(import('../providers/crossref').then(m => m.searchCrossref(q, 8))),
      timed(import('../providers/institutional/think-tanks/global-think-tanks')
        .then(m => m.searchGlobalThinkTanks(q, 15))),
    ]),
  ));

  const channel = (idx: number) => {
    const results = perQuery.map(r => r[idx]);
    const seen = new Set<string>();
    const items = results
      .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
      .filter(item => {
        const k = itemKey(item);
        if (k && seen.has(k)) return false;
        if (k) seen.add(k);
        return true;
      });
    return { items, down: results.every(r => r.status === 'rejected') };
  };

  const oa = channel(0), cr = channel(1), tt = channel(2);
  const raw = {
    openAlex: oa.items.length,
    crossref: cr.items.length,
    thinkTanks: tt.items.length,
  };
  const relevant =
    relevantHits(oa.items, terms) +
    relevantHits(cr.items, terms) +
    relevantHits(tt.items, terms);

  const downCount = [oa, cr, tt].filter(c => c.down).length;
  const errors = perQuery
    .flatMap(r => r)
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason?.message ?? 'error')
    .filter((v, i, a) => a.indexOf(v) === i)
    .join('; ');

  // A probe that measured a BROKEN surface cannot establish "near-zero
  // footprint everywhere": circuit-broken providers contribute 0 hits on
  // every topic, not on weak ones (run-17: oa=0 cr=0 both tripped → a
  // gate-accepted subject skipped on a measurement of our own outage).
  // ≥2 channels down → surface unknown → proceed, per the fail-open contract.
  const viable = downCount >= 2 ? true : relevant >= threshold;

  return {
    viable,
    relevant, raw, terms, threshold,
    durationMs: Date.now() - t0,
    error: errors || undefined,
  };
}
