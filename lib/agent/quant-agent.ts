/**
 * NomosX QUANT Agent — Primary Data Exploitation
 *
 * The differentiator vs. traditional think tanks: instead of citing that
 * "a dataset exists", this agent FETCHES the actual numbers from T1
 * primary-data providers (energy-charts, RTE, Treasury, Eurostat…),
 * computes trends/variations, and injects a QUANTITATIVE EVIDENCE block
 * into the Analyst prompt — plus chart-ready series for the Editor.
 *
 * Position in funnel: after RANK, parallel with READER, before ANALYST.
 *
 * Design principles:
 * - Zero LLM calls for computation (deterministic math, no hallucination)
 * - One optional LLM call at the end to select the most decision-relevant facts
 * - Fail-safe: every fetcher isolated, pipeline never blocks on QUANT
 */

import crypto from 'crypto';
import { fetchFromProvider } from '../http-client';

const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

// ============================================================================
// SEMANTIC CACHE (2026 best practice — SemanticALLI)
// Primary data from FRED/ECB/energy-charts doesn't change within hours.
// Cache QUANT results for 1 hour to avoid redundant API calls on similar topics.
// ============================================================================
const QUANT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const quantCache = new Map<string, { result: QuantOutput; expiresAt: number }>();

function quantCacheKey(query: string, sources: any[]): string {
  const sourceHash = sources.map(s => s.id).sort().join('|').slice(0, 200);
  return crypto.createHash('sha256').update(`${query}::${sourceHash}`).digest('hex').slice(0, 16);
}

// ============================================================================
// TYPES
// ============================================================================

export interface QuantSeries {
  label: string;              // "Day-ahead price (Germany)"
  unit: string;               // "EUR/MWh"
  provider: string;           // "energy-charts"
  sourceId: string;           // source id for [SRC-N] mapping
  points: Array<{ t: string; v: number }>; // ISO date → value (downsampled)
  // Computed statistics
  latest: number;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  changePct: number | null;   // % change first→last over window
  trend: 'rising' | 'falling' | 'stable' | 'volatile';
}

export interface QuantFact {
  statement: string;          // "German day-ahead price averaged 87.3 EUR/MWh over the last 30 days, +12.4% vs window start"
  value: number;
  unit: string;
  provider: string;
  sourceId: string;
  confidence: 'measured' | 'derived';
}

export interface QuantOutput {
  series: QuantSeries[];
  facts: QuantFact[];
  evidenceBlock: string;      // Ready-to-inject prompt block for ANALYST
  chartData: QuantSeries[];   // Series suitable for SVG chart rendering
  fetchedProviders: string[];
  durationMs: number;
}

// ============================================================================
// STATISTICS (deterministic, no LLM)
// ============================================================================

function computeStats(points: Array<{ t: string; v: number }>): Omit<QuantSeries, 'label' | 'unit' | 'provider' | 'sourceId' | 'points'> {
  const values = points.map(p => p.v).filter(v => Number.isFinite(v));
  if (values.length === 0) {
    return { latest: 0, mean: 0, min: 0, max: 0, stdDev: 0, changePct: null, trend: 'stable' };
  }
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const first = values[0];
  const latest = values[values.length - 1];
  const changePct = first !== 0 ? ((latest - first) / Math.abs(first)) * 100 : null;
  const cv = mean !== 0 ? stdDev / Math.abs(mean) : 0;

  let trend: QuantSeries['trend'] = 'stable';
  if (cv > 0.35) trend = 'volatile';
  else if (changePct !== null && changePct > 5) trend = 'rising';
  else if (changePct !== null && changePct < -5) trend = 'falling';

  return {
    latest: round2(latest),
    mean: round2(mean),
    min: round2(min),
    max: round2(max),
    stdDev: round2(stdDev),
    changePct: changePct !== null ? round2(changePct) : null,
    trend,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Downsample series to at most maxPoints (uniform stride). */
function downsample(points: Array<{ t: string; v: number }>, maxPoints = 60): Array<{ t: string; v: number }> {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % stride === 0);
}

// ============================================================================
// PROVIDER FETCHERS — each returns raw series or null (isolated failures)
// ============================================================================

async function fetchEnergyChartsPrice(country: string, days = 30): Promise<QuantSeries | null> {
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    const params = new URLSearchParams({
      country: country.toLowerCase(),
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
    const data: any = await fetchFromProvider('energy-charts', `https://api.energy-charts.info/price?${params}`, {
      timeout: 12000, retries: 2,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });
    const prices: number[] = data?.price ?? [];
    const stamps: number[] = data?.unix_seconds ?? [];
    if (!Array.isArray(prices) || prices.length === 0) return null;
    const points = downsample(
      prices
        .map((v, i) => ({ t: stamps[i] ? new Date(stamps[i] * 1000).toISOString() : '', v }))
        .filter(p => Number.isFinite(p.v))
    );
    return {
      label: `Day-ahead electricity price (${country.toUpperCase()})`,
      unit: data?.unit || 'EUR/MWh',
      provider: 'energy-charts',
      sourceId: `energy-charts:price-${country.toLowerCase()}`,
      points,
      ...computeStats(points),
    };
  } catch { return null; }
}

async function fetchRTEConsumption(): Promise<QuantSeries | null> {
  try {
    const params = new URLSearchParams({ dataset: 'eco2mix-national-tr', rows: '96' });
    const data: any = await fetchFromProvider('rte-france', `https://odre.opendatasoft.com/api/records/1.0/search?${params}`, {
      timeout: 12000, retries: 2,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });
    const records = data?.records ?? [];
    if (records.length === 0) return null;
    const points = downsample(
      records
        .map((r: any) => ({ t: r?.fields?.date_heure || '', v: Number(r?.fields?.consommation) }))
        .filter((p: any) => Number.isFinite(p.v) && p.t)
        .sort((a: any, b: any) => a.t.localeCompare(b.t))
    );
    if (points.length === 0) return null;
    return {
      label: 'French national electricity consumption (real-time)',
      unit: 'MW',
      provider: 'rte-france',
      sourceId: 'rte-france:eco2mix-national-tr',
      points,
      ...computeStats(points),
    };
  } catch { return null; }
}

async function fetchTreasuryDebt(): Promise<QuantSeries | null> {
  try {
    const params = new URLSearchParams({ 'page[size]': '30', sort: '-record_date' });
    const data: any = await fetchFromProvider(
      'treasury-fiscal',
      `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?${params}`,
      {
        timeout: 12000, retries: 2,
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      },
    );
    const records = data?.data ?? [];
    if (records.length === 0) return null;
    const points = records
      .map((r: any) => ({ t: r.record_date, v: Number(r.tot_pub_debt_out_amt) / 1e12 }))
      .filter((p: any) => Number.isFinite(p.v))
      .reverse();
    return {
      label: 'US total public debt outstanding',
      unit: 'trillion USD',
      provider: 'treasury-fiscal',
      sourceId: 'treasury-fiscal:v2:accounting:od:debt_to_penny',
      points,
      ...computeStats(points),
    };
  } catch { return null; }
}

async function fetchEnergiDataCO2(): Promise<QuantSeries | null> {
  try {
    const params = new URLSearchParams({ limit: '96', sort: 'Minutes5UTC DESC' });
    const data: any = await fetchFromProvider('energi-data', `https://api.energidataservice.dk/dataset/CO2Emis?${params}`, {
      timeout: 12000, retries: 2,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });
    const records = data?.records ?? [];
    if (records.length === 0) return null;
    const points = downsample(
      records
        .map((r: any) => ({ t: r.Minutes5UTC, v: Number(r.CO2Emission) }))
        .filter((p: any) => Number.isFinite(p.v))
        .reverse()
    );
    return {
      label: 'Danish grid CO2 emission intensity (real-time)',
      unit: 'g/kWh',
      provider: 'energi-data',
      sourceId: 'energi-data:co2emis',
      points,
      ...computeStats(points),
    };
  } catch { return null; }
}

async function fetchWorldBankSeries(
  indicator: string, label: string, unit: string, countryCode: string,
): Promise<QuantSeries | null> {
  try {
    const data: any = await fetchFromProvider(
      'worldbank-data',
      `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}?format=json&per_page=20&date=2005:2025`,
      { timeout: 12000, retries: 1, headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } },
    );
    const rows: any[] = Array.isArray(data) ? data[1] || [] : [];
    const points = rows
      .filter((r: any) => r.value != null)
      .map((r: any) => ({ t: `${r.date}-01-01`, v: Number(r.value) }))
      .sort((a, b) => a.t.localeCompare(b.t));
    if (points.length === 0) return null;
    return {
      label: `${label} (${COUNTRY_NAMES[countryCode] || countryCode})`,
      unit,
      provider: 'worldbank-data',
      sourceId: `worldbank-data:${indicator}:${countryCode}`,
      points,
      ...computeStats(points),
    };
  } catch { return null; }
}

const COUNTRY_NAMES: Record<string, string> = {
  WLD: 'World', EUU: 'EU', USA: 'US', CHN: 'China', JPN: 'Japan', DEU: 'Germany',
  GBR: 'UK', FRA: 'France', IND: 'India', ITA: 'Italy', BRA: 'Brazil', CAN: 'Canada',
  RUS: 'Russia', KOR: 'S. Korea', ESP: 'Spain', MEX: 'Mexico', TUR: 'Turkey',
  SAU: 'Saudi Arabia', UKR: 'Ukraine', ISR: 'Israel', IDN: 'Indonesia',
};

const COUNTRY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(united states|usa|u\.s\.|america)\b/i, 'USA'],
  [/\bchina|chinese\b/i, 'CHN'], [/\bjapan|japanese\b/i, 'JPN'],
  [/\bgermany|german\b/i, 'DEU'], [/\bfrance|french\b/i, 'FRA'],
  [/\b(uk|britain|british|united kingdom)\b/i, 'GBR'], [/\bindia|indian\b/i, 'IND'],
  [/\bitaly|italian\b/i, 'ITA'], [/\bbrazil|brazilian\b/i, 'BRA'],
  [/\bcanada|canadian\b/i, 'CAN'], [/\brussia|russian\b/i, 'RUS'],
  [/\bkorea|korean\b/i, 'KOR'], [/\bspain|spanish\b/i, 'ESP'],
  [/\bmexico|mexican\b/i, 'MEX'], [/\bturkey|turkish\b/i, 'TUR'],
  [/\b(saudi|arabia)\b/i, 'SAU'], [/\bukraine|ukrainian\b/i, 'UKR'],
  [/\bisrael|israeli\b/i, 'ISR'], [/\bindonesia|indonesian\b/i, 'IDN'],
  [/\b(eu|europe|european union|eurozone)\b/i, 'EUU'],
];

// ============================================================================
// DOMAIN → FETCHER MAPPING
// ============================================================================

type Fetcher = () => Promise<QuantSeries | null>;

function selectFetchers(query: string, sources: any[]): Fetcher[] {
  const q = query.toLowerCase();
  const providersInSources = new Set(sources.map((s: any) => s.provider));
  const fetchers: Fetcher[] = [];

  const isEnergy = /\b(energy|electricity|power|grid|datacenter|data center|nuclear|renewable|solar|wind|gas)\b/.test(q);
  const isFiscal = /\b(debt|fiscal|treasury|budget|deficit|spending|tax|bond|yield|interest rate|monetary|banking|finance|leverage|systemic|credit|central bank|fed|ecb|basel)\b/.test(q);
  const isClimate = /\b(co2|carbon|emission|climate)\b/.test(q);
  const isMacro = /\b(gdp|growth|economy|recession|recovery|macroeconomic|pib|croissance)\b/i.test(q);
  const isInflation = /\b(inflation|prices|cpi|cost of living|prix)\b/i.test(q);
  const isLabor = /\b(unemployment|employment|labor market|jobs|chômage)\b/i.test(q);
  const isConflict = /\b(conflict|war|violence|security|sahel|terroris)\b/i.test(q);

  // Country detection → World Bank series localized to the topic
  const detected = COUNTRY_PATTERNS.find(([re]) => re.test(query));
  const cc = detected?.[1] || 'WLD';

  // Energy data only if explicitly energy-related AND not a finance report
  if (isEnergy && !isFiscal) {
    if (providersInSources.has('energy-charts') || providersInSources.has('smard')) {
      fetchers.push(() => fetchEnergyChartsPrice('de'));
      fetchers.push(() => fetchEnergyChartsPrice('fr'));
    }
    if (providersInSources.has('rte-france')) {
      fetchers.push(fetchRTEConsumption);
    }
  }
  if (isFiscal || providersInSources.has('treasury-fiscal')) {
    fetchers.push(fetchTreasuryDebt);
  }
  // Climate data only if explicitly climate-related AND not a finance report
  if (isClimate && !isFiscal) {
    if (providersInSources.has('energi-data')) {
      fetchers.push(fetchEnergiDataCO2);
    }
    // Global CO2 trajectory as context (OWID-style, via WB CO2 indicator)
    fetchers.push(() => fetchWorldBankSeries('EN.GHG.CO2.PC.CE.AR5', 'CO2 emissions per capita', 't CO2e/person', cc));
  }

  // World Bank macro series — real country/world numbers for macro topics
  if (isMacro) {
    fetchers.push(() => fetchWorldBankSeries('NY.GDP.MKTP.KD.ZG', 'GDP growth, annual', '%', cc));
    if (cc !== 'WLD') fetchers.push(() => fetchWorldBankSeries('NY.GDP.MKTP.KD.ZG', 'GDP growth, annual', '%', 'WLD'));
  }
  if (isInflation) {
    fetchers.push(() => fetchWorldBankSeries('FP.CPI.TOTL.ZG', 'Inflation, consumer prices', '%', cc));
  }
  if (isLabor) {
    fetchers.push(() => fetchWorldBankSeries('SL.UEM.TOTL.ZS', 'Unemployment rate', '% of labor force', cc));
  }
  if (isFiscal) {
    fetchers.push(() => fetchWorldBankSeries('GC.DOD.TOTL.GD.ZS', 'Central government debt', '% of GDP', cc));
  }
  if (isConflict) {
    fetchers.push(() => fetchWorldBankSeries('MS.MIL.XPND.GD.ZS', 'Military expenditure', '% of GDP', cc));
  }

  return fetchers;
}

// ============================================================================
// FACT GENERATION (deterministic)
// ============================================================================

function seriesToFacts(s: QuantSeries): QuantFact[] {
  const facts: QuantFact[] = [];
  const windowDesc = s.points.length > 1
    ? `${s.points[0].t.slice(0, 10)} → ${s.points[s.points.length - 1].t.slice(0, 10)}`
    : 'latest';

  facts.push({
    statement: `${s.label}: latest value ${s.latest} ${s.unit}, mean ${s.mean} ${s.unit} over window (${windowDesc}), range ${s.min}–${s.max} ${s.unit}.`,
    value: s.latest,
    unit: s.unit,
    provider: s.provider,
    sourceId: s.sourceId,
    confidence: 'measured',
  });

  if (s.changePct !== null && Math.abs(s.changePct) >= 1) {
    facts.push({
      statement: `${s.label}: ${s.changePct > 0 ? '+' : ''}${s.changePct}% change over the window — trend: ${s.trend}.`,
      value: s.changePct,
      unit: '%',
      provider: s.provider,
      sourceId: s.sourceId,
      confidence: 'derived',
    });
  }

  return facts;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function quantAgent(
  query: string,
  sources: any[],
): Promise<QuantOutput> {
  const start = Date.now();
  console.log(`[QUANT] Analyzing primary data opportunities for: "${query.slice(0, 80)}"`);

  // Semantic cache check (2026 best practice)
  const cacheKey = quantCacheKey(query, sources);
  const cached = quantCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[QUANT] Cache HIT (key=${cacheKey}) — reusing ${cached.result.series.length} series from previous run`);
    return { ...cached.result, durationMs: Date.now() - start };
  }

  const fetchers = selectFetchers(query, sources);
  if (fetchers.length === 0) {
    console.log('[QUANT] No relevant primary-data fetchers for this query');
    return { series: [], facts: [], evidenceBlock: '', chartData: [], fetchedProviders: [], durationMs: Date.now() - start };
  }

  const results = await Promise.allSettled(fetchers.map(f => f()));
  const series = results
    .filter((r): r is PromiseFulfilledResult<QuantSeries | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((s): s is QuantSeries => s !== null && s.points.length >= 3);

  const facts = series.flatMap(seriesToFacts);

  // Build the evidence block for the ANALYST prompt
  let evidenceBlock = '';
  if (facts.length > 0) {
    evidenceBlock = [
      '═══ QUANTITATIVE EVIDENCE (primary data, machine-verified — cite as [DATA]) ═══',
      ...facts.map((f, i) => `${i + 1}. ${f.statement} (source: ${f.provider}, ${f.confidence})`),
      '',
      'RULES: You may use these numbers directly. They are fetched from official APIs and computed deterministically.',
      'When citing them, reference the provider by name (e.g., "according to Bundesnetzagentur data via energy-charts").',
      'Do NOT extrapolate beyond the stated window. Do NOT invent additional figures.',
    ].join('\n');
  }

  const fetchedProviders = [...new Set(series.map(s => s.provider))];
  const durationMs = Date.now() - start;
  console.log(`[QUANT] Complete: ${series.length} series, ${facts.length} facts from ${fetchedProviders.join(', ')} (${durationMs}ms)`);

  const result = { series, facts, evidenceBlock, chartData: series, fetchedProviders, durationMs };
  // Store in cache
  if (series.length > 0) {
    quantCache.set(cacheKey, { result, expiresAt: Date.now() + QUANT_CACHE_TTL_MS });
  }
  return result;
}
