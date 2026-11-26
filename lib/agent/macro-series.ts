/**
 * MACRO SERIES — P0-C quantitative core.
 *
 * Real, citable primary-data series for EVERY note: DBnomics aggregates
 * INSEE, Eurostat, OECD and IMF under one API; FRED covers US/global
 * markets and macro; Eurostat is reachable through DBnomics provider
 * 'Eurostat' (and the direct dissemination API remains in providers/).
 *
 * Every fetcher degrades to null — a provider outage removes a series,
 * never the run. QuantSeries shape matches quant-agent.ts so the evidence
 * block, facts ledger and [DATA] citation rules work unchanged.
 */

import { fetchFromProvider } from '../http-client';

export interface MacroPoint { t: string; v: number }

export interface MacroSeries {
  provider: 'dbnomics' | 'fred' | 'eurostat';
  /** Human label, e.g. "INSEE CPI (DBnomics)". */
  label: string;
  unit: string;
  /** Series identifier for citation, e.g. "INSEE/IPC-2015/…" or "FRED/GDPC1". */
  sourceId: string;
  points: MacroPoint[];
  latest: number;
  mean: number;
  min: number;
  max: number;
  changePct: number | null;
  trend: 'rising' | 'falling' | 'flat';
}

// ─── DBnomics ────────────────────────────────────────────────────────────
// GET /v22/series/{provider}/{dataset}?observations=1&q=<terms>&limit=N
// returns series.docs[] each with period[] + value[] (aligned arrays).

interface DBnomicsDoc {
  series_code?: string;
  series_name?: string;
  period?: Array<string | number>;
  value?: Array<number | string | null>;
  'period_start_day'?: string[];
}

async function fetchDBnomicsSeries(opts: {
  provider: string;      // 'INSEE' | 'Eurostat' | 'OECD' | 'IMF'
  dataset: string;       // e.g. 'IPC-2015', 'nama_10_gdp', 'MEI'
  q?: string;            // full-text filter inside the dataset
  limit?: number;
  label: string;
  unit: string;
  /** Pick the doc whose name/geo best matches — defaults to first with data. */
  preferName?: RegExp;
}): Promise<MacroSeries | null> {
  const { provider, dataset, q, limit = 8, label, unit, preferName } = opts;
  const params = new URLSearchParams({ observations: '1', limit: String(limit) });
  if (q) params.set('q', q);
  const url = `https://api.db.nomics.world/v22/series/${encodeURIComponent(provider)}/${encodeURIComponent(dataset)}?${params}`;
  const data: any = await fetchFromProvider('dbnomics', url, { timeout: 15000, retries: 1 });
  const docs: DBnomicsDoc[] = data?.series?.docs ?? [];
  if (!docs.length) return null;

  const withData = docs
    .map(d => {
      const periods = Array.isArray(d.period) ? d.period : [];
      const values = Array.isArray(d.value) ? d.value : [];
      const points: MacroPoint[] = [];
      for (let i = 0; i < Math.min(periods.length, values.length); i++) {
        const raw = values[i];
        const v = typeof raw === 'number' ? raw : parseFloat(String(raw));
        if (Number.isFinite(v)) points.push({ t: String(periods[i]), v });
      }
      return { d, points };
    })
    .filter(x => x.points.length >= 3);
  if (!withData.length) return null;

  const picked = (preferName && withData.find(x => preferName.test(String(x.d.series_name ?? x.d.series_code ?? '')))) || withData[0];
  const pts = picked.points;
  const vals = pts.map(p => p.v);
  const latest = vals[vals.length - 1];
  const first = vals[0];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const changePct = first !== 0 ? ((latest - first) / Math.abs(first)) * 100 : null;
  const trend: MacroSeries['trend'] = latest > mean * 1.02 ? 'rising' : latest < mean * 0.98 ? 'falling' : 'flat';
  const code = picked.d.series_code ?? `${provider}/${dataset}`;
  return {
    provider: 'dbnomics',
    label: `${label} — ${String(picked.d.series_name ?? code).slice(0, 80)}`,
    unit,
    sourceId: `${provider}/${dataset}/${code}`,
    points: pts,
    latest, mean, min: Math.min(...vals), max: Math.max(...vals),
    changePct: changePct !== null ? Math.round(changePct * 10) / 10 : null,
    trend,
  };
}

// ─── FRED ────────────────────────────────────────────────────────────────

const FRED_SERIES_IDS: Record<string, { id: string; label: string; unit: string }> = {
  growth:      { id: 'GDP',        label: 'US GDP (nominal, FRED)',        unit: 'billions USD' },
  inflation:   { id: 'CPIAUCSL',   label: 'US CPI all urban (FRED)',       unit: 'index' },
  unemployment:{ id: 'UNRATE',     label: 'US unemployment rate (FRED)',   unit: '%' },
  rates:       { id: 'FEDFUNDS',   label: 'Fed funds rate (FRED)',         unit: '%' },
  yields:      { id: 'DGS10',      label: 'US 10Y Treasury yield (FRED)',  unit: '%' },
  energy:      { id: 'DCOILWTICO', label: 'WTI crude price (FRED)',        unit: 'USD/barrel' },
  gas:         { id: 'DHHNGSP',    label: 'Henry Hub gas price (FRED)',    unit: 'USD/MMBtu' },
  vix:         { id: 'VIXCLS',     label: 'VIX volatility (FRED)',         unit: 'index' },
  trade:       { id: 'BOPGSTB',    label: 'US trade balance (FRED)',       unit: 'millions USD' },
};

async function fetchFREDSimple(key: keyof typeof FRED_SERIES_IDS): Promise<MacroSeries | null> {
  const meta = FRED_SERIES_IDS[key];
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;
  const start = new Date(Date.now() - 6 * 365.25 * 86400_000).toISOString().slice(0, 10);
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${meta.id}&api_key=${apiKey}&file_type=json&observation_start=${start}`;
  const data: any = await fetchFromProvider('fred', url, { timeout: 15000, retries: 1 });
  const obs: Array<{ date?: string; value?: string }> = data?.observations ?? [];
  const points: MacroPoint[] = obs
    .map(o => ({ t: String(o.date ?? ''), v: parseFloat(String(o.value)) }))
    .filter(p => p.t && Number.isFinite(p.v));
  if (points.length < 3) return null;
  const vals = points.map(p => p.v);
  const latest = vals[vals.length - 1];
  const first = vals[0];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const changePct = first !== 0 ? ((latest - first) / Math.abs(first)) * 100 : null;
  return {
    provider: 'fred',
    label: meta.label,
    unit: meta.unit,
    sourceId: `FRED/${meta.id}`,
    points,
    latest, mean, min: Math.min(...vals), max: Math.max(...vals),
    changePct: changePct !== null ? Math.round(changePct * 10) / 10 : null,
    trend: latest > mean * 1.02 ? 'rising' : latest < mean * 0.98 ? 'falling' : 'flat',
  };
}

// ─── Eurostat (via DBnomics provider 'Eurostat') ─────────────────────────
// Curated dataset codes on DBnomics' Eurostat provider. `q` narrows inside
// the dataset; preferName picks the geo/unit variant closest to the query.

export interface MacroSpec {
  provider?: 'INSEE' | 'Eurostat' | 'OECD' | 'IMF';
  dataset?: string;
  q?: string;
  label?: string;
  unit?: string;
  preferName?: RegExp;
  fredKey?: keyof typeof FRED_SERIES_IDS;
}

const DOMAIN_SPECS: Array<{ re: RegExp; specs: MacroSpec[] }> = [
  {
    re: /\b(inflation|cpi|prices|consumer price|prix|cost of living)\b/i,
    specs: [
      { provider: 'INSEE', dataset: 'IPC-2015', q: 'ensemble', label: 'INSEE consumer price index', unit: 'index', preferName: /ensemble|FR\b/i },
      { provider: 'Eurostat', dataset: 'prc_hicp_midx', q: 'CP00', label: 'Eurostat HICP inflation', unit: '%', preferName: /EA|EU|FR/i },
      { fredKey: 'inflation' } as MacroSpec,
    ],
  },
  {
    re: /\b(gdp|growth|economy|economic|recession|pib|croissance|output)\b/i,
    specs: [
      { provider: 'Eurostat', dataset: 'nama_10_gdp', q: 'B1GQ', label: 'Eurostat GDP', unit: 'million EUR', preferName: /EA|EU27|FR/i },
      { provider: 'OECD', dataset: 'QNA', q: 'GDP', label: 'OECD quarterly national accounts', unit: 'USD', preferName: /USA|OECD/i },
      { provider: 'IMF', dataset: 'WEO', q: 'NGDP_RPCH', label: 'IMF WEO real GDP growth', unit: '%', preferName: /World|Advanced|Emerging/i },
      { fredKey: 'growth' } as MacroSpec,
    ],
  },
  {
    re: /\b(unemployment|employment|labor|jobs|chômage|jobless)\b/i,
    specs: [
      { provider: 'Eurostat', dataset: 'une_rt_m', q: 'TOTAL', label: 'Eurostat unemployment rate', unit: '%', preferName: /EA|EU|FR/i },
      { provider: 'OECD', dataset: 'KEI', q: 'UNRATE', label: 'OECD unemployment', unit: '%', preferName: /USA|OECD/i },
      { fredKey: 'unemployment' } as MacroSpec,
    ],
  },
  {
    re: /\b(interest rate|monetary|central bank|fed|ecb|rate hike|rate cut|policy rate|yields?|bond)\b/i,
    specs: [
      { provider: 'IMF', dataset: 'IFS', q: 'IRSTCI', label: 'IMF policy interest rate', unit: '%', preferName: /USA|EA|World/i },
      { provider: 'Eurostat', dataset: 'irt_st_m', q: 'MIR', label: 'Eurostat MIR interest rates', unit: '%', preferName: /EA|EU|FR/i },
      { fredKey: 'rates' }, { fredKey: 'yields' },
    ],
  },
  {
    re: /\b(energy|electricity|power|grid|renewable|solar|wind|gas|oil|nuclear|petroleum)\b/i,
    specs: [
      { provider: 'Eurostat', dataset: 'nrg_ind_ren', q: 'REN', label: 'Eurostat renewable energy share', unit: '%', preferName: /EA|EU|FR/i },
      { fredKey: 'energy' }, { fredKey: 'gas' },
    ],
  },
  {
    re: /\b(trade|export|import|tariff|customs|commerce)\b/i,
    specs: [
      { provider: 'Eurostat', dataset: 'namt_10_gdp', q: 'B1GQ', label: 'Eurostat trade in goods/services', unit: 'million EUR', preferName: /EA|EU|FR/i },
      { provider: 'IMF', dataset: 'DOTS', q: 'TXG', label: 'IMF trade in goods', unit: 'USD', preferName: /World|Advanced/i },
      { fredKey: 'trade' },
    ],
  },
  {
    re: /\b(climate|co2|carbon|emission|temperature)\b/i,
    specs: [
      { provider: 'IMF', dataset: 'WEO', q: 'NGSD_NGDP', label: 'IMF WEO carbon intensity', unit: 'tCO2/$', preferName: /World|Advanced/i },
      { provider: 'OECD', dataset: 'DF_TABLE1_EXP', q: 'CO2', label: 'OECD CO2 emissions', unit: 'Mt', preferName: /OECD|USA/i },
    ],
  },
  {
    re: /\b(deficit|debt|fiscal|budget|spending|government finance|public debt)\b/i,
    specs: [
      { provider: 'Eurostat', dataset: 'gov_10dd_edpt1', q: 'GG_DEBT', label: 'Eurostat government debt', unit: '% of GDP', preferName: /EA|EU|FR/i },
      { provider: 'IMF', dataset: 'WEO', q: 'GGXWDG_NGDP', label: 'IMF general government gross debt', unit: '% of GDP', preferName: /World|Advanced|Emerging/i },
    ],
  },
];

/** Always-on macro context — a note on ANY topic gets at least these attempts. */
const ALWAYS_SPECS: MacroSpec[] = [
  { provider: 'IMF', dataset: 'WEO', q: 'NGDP_RPCH', label: 'IMF WEO real GDP growth (world)', unit: '%', preferName: /World/i },
  { provider: 'Eurostat', dataset: 'prc_hicp_midx', q: 'CP00', label: 'Eurostat HICP inflation (EA)', unit: '%', preferName: /EA/i },
  { fredKey: 'rates' } as MacroSpec,
];

export interface MacroFetchResult {
  series: MacroSeries[];
  attempted: number;
}

/**
 * Fetch real macro series for a query. Domain-matched specs first, then the
 * always-on macro floor — every note attempts ≥1 real series (P0-C).
 * Bounded: at most 6 fetches, allSettled, ~15s each in parallel.
 */
/** Domain-matched specs first, then the always-on macro floor, deduped. */
export function macroSpecsForQuery(query: string, max = 6): MacroSpec[] {
  const specs: MacroSpec[] = [];
  for (const { re, specs: s } of DOMAIN_SPECS) {
    if (re.test(query)) specs.push(...s);
  }
  specs.push(...ALWAYS_SPECS);
  const seen = new Set<string>();
  return specs.filter(s => {
    const k = s.fredKey ?? `${s.provider}/${s.dataset}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, max);
}

export async function fetchMacroSeries(query: string): Promise<MacroFetchResult> {
  const unique = macroSpecsForQuery(query);

  const settled = await Promise.allSettled(unique.map(async (s): Promise<MacroSeries | null> => {
    if (s.fredKey) return fetchFREDSimple(s.fredKey);
    if (!s.provider || !s.dataset) return null;
    return fetchDBnomicsSeries({
      provider: s.provider, dataset: s.dataset, q: s.q,
      label: s.label ?? `${s.provider}/${s.dataset}`, unit: s.unit ?? '', preferName: s.preferName,
    });
  }));

  const series = settled
    .filter((r): r is PromiseFulfilledResult<MacroSeries | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((s): s is MacroSeries => s !== null && s.points.length >= 3);

  return { series, attempted: unique.length };
}
