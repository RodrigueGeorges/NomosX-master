/**
 * CORPUS QUOTAS — Lot 2.
 *
 * For public-policy questions in force, a note cannot be built on whatever
 * the scout happened to return. Minimum evidence mass by category:
 *
 *   - regulatory:      ≥2 official texts (EUR-Lex, Council, Commission,
 *                      national official journals, statutes)
 *   - implementation:  ≥1 source <18 months old on implementation /
 *                      transposition / first reporting
 *   - exAnte:          ≥2 ex-ante modelling studies — only when the
 *                      question carries a dated horizon
 *   - contrary:        ≥3 sources arguing against the dominant direction
 *
 * Quota unmet after two targeted refill rounds → the run stops BEFORE the
 * reader with motif `corpus_quota_unmet:<missing>` (pipeline-v2 pre-reader
 * check consumes stats.corpusQuotas.met === false).
 *
 * Classification is deterministic where possible (domains, dates, title
 * keywords) — the contrary stance needs one bounded LLM batch, same
 * pattern as the relevance screen. Non-policy questions skip everything.
 */

export interface CorpusSourceLike {
  id?: string;
  title?: string | null;
  abstract?: string | null;
  url?: string | null;
  provider?: string | null;
  year?: number | null;
  publishedAt?: string | Date | null;
  date?: string | Date | null;
}

export interface QuotaBucket {
  count: number;
  required: number;
  met: boolean;
}

export interface CorpusQuotaReport {
  policyQuestion: boolean;
  datedHorizon: boolean;
  quotas: {
    regulatory: QuotaBucket;
    implementationRecent: QuotaBucket;
    exAnte: QuotaBucket;
    contrary: QuotaBucket;
  };
  /** True when every required quota is met (or the question is not policy). */
  met: boolean;
  /** Machine-readable missing motifs, e.g. 'regulatory','contrary'. */
  missing: string[];
  /** Human-readable detail persisted to stats. */
  detail?: Record<string, unknown>;
}

// ── Policy-question detection ────────────────────────────────────────────
const POLICY_RE = /\b(regulation|directive|policy|CBAM|carbon border|ETS|emissions trading|sanction|tariff|quota|subsidy|mandate|ban|treaty|agreement|climate|emission|decarboni|energy transition|industrial policy|export control|rare earth|chip act|inflation reduction|carbon price|cap.and.trade|free allocation|border adjustment|local content|carbon leakage)\b/i;
const POLICY_ACTION_RE = /\b(20\d{2}|by |will |impact|effect|reduce|cut|increase|comply|adopt|phase|implement|apply|enforce|exempt)\b/i;
// Policy-relevant domains: forecast- or topic-phrased questions in these
// domains ("renewables reach 50% of capacity by 2030", "mineral resource
// dependencies") carry no policy keyword yet are exactly what the quotas
// exist for. Domain membership alone triggers evaluation — the exAnte
// bucket already scales to zero without a dated horizon, and unmet quotas
// only refuse after two bounded refill rounds. Observed live (radar run
// 11): 3/3 policy-relevant runs skipped quota evaluation entirely.
const POLICY_DOMAIN_RE = /\b(energy|climate|emission|renewable|solar|wind|grid|capacity|storage|battery|mineral|lithium|cobalt|nickel|graphite|rare earth|semiconductor|supply.chain|trade|tariff|sanction|border|carbon|decarboni|fossil|hydrocarbon|nuclear|hydrogen|utilities|export.control|industrial.policy)\b/i;

export function detectPolicyQuestion(query: string): boolean {
  if (POLICY_RE.test(query) && POLICY_ACTION_RE.test(query)) return true;
  return POLICY_DOMAIN_RE.test(query);
}

export function hasDatedHorizon(query: string): boolean {
  return /\b20\d{2}\b/.test(query) || /\b(by|horizon|deadline|target year)\b/i.test(query);
}

// ── Deterministic source classification ──────────────────────────────────
const REGULATORY_PROVIDERS = new Set([
  'eur-lex', 'legifrance', 'govinfo', 'federalregister', 'official-journal',
  'eurlex', 'conseil', 'consilium', 'commission', 'parl', 'lei', 'openjur',
]);
const REGULATORY_DOMAINS = [
  'eur-lex.europa.eu', 'consilium.europa.eu', 'commission.europa.eu',
  'legislation.gov.uk', 'legifrance.gouv.fr', 'federalregister.gov',
  'govinfo.gov', 'eur-lex.europa.eu', 'data.europa.eu', 'oj.ec.europa.eu',
];
const REGULATORY_TITLE_RE = /\b(regulation|directive|treaty|agreement|decision|recommendation)\s*\(?\s*(EU|EC|of the European)\b|\bOJ\s+L\b|\bOfficial Journal\b|\b(UE)\s*\d{4}\/\d+|\b20\d{2}\/\d+\b/i;

const IMPLEMENTATION_RE = /\b(implement|transpos|application|entry into force|first report|annual report|review|guidance|delegated act|implementing act|enforcement|compliance|monitoring|registry|benchmark|free allocation phase)\w*/i;

const EX_ANTE_RE = /\b(impact assessment|ex[- ]ante|cost[- ]benefit|CGE\b|DSGE\b|computable general|scenario (analysis|modelling|modeling)|projection model|forecast model|modelling study|modeling study|evaluation study|integrated assessment|MARKAL| TIMES model|partial equilibrium|general equilibrium model)\b/i;

function sourceYear(s: CorpusSourceLike, now: Date): number {
  if (typeof s.year === 'number' && Number.isFinite(s.year)) return s.year;
  const raw = s.publishedAt ?? s.date;
  if (raw) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.getUTCFullYear();
  }
  const m = String(s.url ?? '').match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : now.getUTCFullYear();
}

function hostOf(url?: string | null): string {
  const m = String(url ?? '').match(/^https?:\/\/(?:www\.)?([^/?#]+)/i);
  return m ? m[1].toLowerCase() : '';
}

export interface SourceFlags {
  regulatory: boolean;
  implementationRecent: boolean;
  exAnte: boolean;
}

/** Claude §3: a source counts as RECENT when its publication date (or year
 *  fallback) falls within the last `months` (default 18 — breaking-news
 *  evidence: actualité, institutions, données). */
export function isRecentSource(s: CorpusSourceLike, months = 18, now: Date = new Date()): boolean {
  const raw = s.publishedAt ?? s.date;
  if (raw) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const cutoff = new Date(now.getTime() - months * 30.44 * 86400000);
      return d >= cutoff;
    }
  }
  // Year granularity: <18 months ≈ year >= current year - 1.
  return sourceYear(s, now) >= now.getUTCFullYear() - 1;
}

export function classifyCorpusSource(s: CorpusSourceLike, now: Date = new Date()): SourceFlags {
  const provider = String(s.provider ?? '').toLowerCase();
  const host = hostOf(s.url);
  const title = String(s.title ?? '');
  const text = `${title} ${String(s.abstract ?? '').slice(0, 400)}`;
  const year = sourceYear(s, now);

  const regulatory =
    REGULATORY_PROVIDERS.has(provider) ||
    REGULATORY_DOMAINS.some(d => host === d || host.endsWith(`.${d}`)) ||
    REGULATORY_TITLE_RE.test(title);

  // <18 months ≈ publication year >= current year - 1 (month precision
  // unavailable on most records; conservative by one year).
  const recent = year >= now.getUTCFullYear() - 1;
  const implementationRecent = recent && (IMPLEMENTATION_RE.test(text) || regulatory);

  const exAnte = EX_ANTE_RE.test(text);

  return { regulatory, implementationRecent, exAnte };
}

// ── Contrary-stance classification (one bounded LLM batch) ─────────────────
const MAX_STANCE_SOURCES = 40;

/**
 * Classify each source's stance toward the question's likely direction.
 * 'critical' counts toward the contrary quota. Returns a map id→stance;
 * null on failure (caller treats contrary as unmet — fail-closed on the
 * quota, same contract as the relevance screen's fail-open inverse: a
 * quota that cannot be measured cannot be claimed met).
 */
export async function classifyContraryStances(opts: {
  query: string;
  sources: CorpusSourceLike[];
  addCost: (usd: number | undefined, step: string) => void;
}): Promise<Map<string, 'critical' | 'supportive' | 'neutral' | 'offtopic'> | null> {
  const batch = opts.sources.filter(s => s.id).slice(0, MAX_STANCE_SOURCES);
  if (!batch.length) return new Map();
  try {
    const { callLLM } = await import('../llm/unified-llm');
    const { parseJson } = await import('./json-utils');
    const listing = batch
      .map((s, i) => `${i}: ${(s.title || 'untitled').slice(0, 110)} — ${String(s.abstract ?? '').replace(/\s+/g, ' ').slice(0, 150)}`)
      .join('\n');
    const res = await callLLM({
      messages: [
        { role: 'system', content: 'You are a research librarian classifying evidence stance. Output JSON only.' },
        {
          role: 'user',
          content: `RESEARCH QUESTION: "${opts.query}"

For each numbered source, classify its stance toward the question's subject:
- "critical" = argues AGAINST the policy/instrument or presents evidence it fails/harms
- "supportive" = argues FOR it or presents evidence it works
- "neutral" = descriptive, no clear stance
- "offtopic" = does not address the question's subject

Return {"stances":{"0":"critical","1":"neutral",...}} covering every index 0-${batch.length - 1}.

${listing}`,
        },
      ],
      temperature: 0,
      jsonMode: true,
      maxTokens: 1500,
      enableCache: true,
      task: 'topic_classification',
    });
    opts.addCost(res.costUsd, 'CORPUS_QUOTA_STANCE');
    const parsed = parseJson<{ stances?: Record<string, string> }>(res.content);
    if (!parsed?.stances) return null;
    const out = new Map<string, 'critical' | 'supportive' | 'neutral' | 'offtopic'>();
    batch.forEach((s, i) => {
      const st = String(parsed.stances?.[String(i)] ?? '').toLowerCase();
      if (['critical', 'supportive', 'neutral', 'offtopic'].includes(st) && s.id) {
        out.set(s.id, st as 'critical' | 'supportive' | 'neutral' | 'offtopic');
      }
    });
    return out.size ? out : null;
  } catch (err) {
    console.warn('[CorpusQuotas] stance classification failed:', err);
    return null;
  }
}

// ── Evaluation ─────────────────────────────────────────────────────────────
export function evaluateCorpusQuotas(opts: {
  query: string;
  sources: CorpusSourceLike[];
  contraryStances?: Map<string, string> | null;
  now?: Date;
}): CorpusQuotaReport {
  const { query, sources } = opts;
  const now = opts.now ?? new Date();
  const policyQuestion = detectPolicyQuestion(query);
  const datedHorizon = hasDatedHorizon(query);

  const empty = (required: number): QuotaBucket => ({ count: 0, required, met: required === 0 });
  const report: CorpusQuotaReport = {
    policyQuestion,
    datedHorizon,
    quotas: {
      regulatory: empty(2),
      implementationRecent: empty(1),
      exAnte: empty(datedHorizon ? 2 : 0),
      contrary: empty(3),
    },
    met: true,
    missing: [],
  };
  if (!policyQuestion) return report; // non-policy: quotas do not apply

  const flags = sources.map(s => classifyCorpusSource(s, now));
  report.quotas.regulatory.count = flags.filter(f => f.regulatory).length;
  report.quotas.implementationRecent.count = flags.filter(f => f.implementationRecent).length;
  report.quotas.exAnte.count = flags.filter(f => f.exAnte).length;

  if (opts.contraryStances) {
    report.quotas.contrary.count = sources.filter(s => s.id && opts.contraryStances!.get(s.id) === 'critical').length;
  } else {
    // Stance unmeasured → contrary cannot be claimed met (fail-closed).
    report.quotas.contrary.count = 0;
  }

  const missing: string[] = [];
  for (const key of ['regulatory', 'implementationRecent', 'exAnte', 'contrary'] as const) {
    const q = report.quotas[key];
    q.met = q.count >= q.required;
    if (!q.met) missing.push(key);
  }
  report.missing = missing;
  report.met = missing.length === 0;
  return report;
}

// ── Targeted refill queries ───────────────────────────────────────────────
/** One scout query per missing category, in priority order. */
export function quotaScoutQueries(missing: string[], query: string): string[] {
  const qs: string[] = [];
  if (missing.includes('regulatory')) {
    qs.push(`site:eur-lex.europa.eu OR site:consilium.europa.eu OR site:commission.europa.eu ${query} regulation directive official text`);
  }
  if (missing.includes('implementationRecent')) {
    qs.push(`${query} implementation transposition application report 2025 2026`);
  }
  if (missing.includes('exAnte')) {
    qs.push(`${query} impact assessment ex-ante modelling cost-benefit study projection`);
  }
  if (missing.includes('contrary')) {
    qs.push(`${query} criticism opposing evidence failures drawbacks debate`);
  }
  return qs.slice(0, 2); // at most two refill rounds, per the lot rule
}
