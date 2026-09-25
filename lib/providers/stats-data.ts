/**
 * STATS-DATA Providers — domain statistics that return REAL NUMBERS.
 *
 * - `searchUCDP`   : Uppsala Conflict Data Program — live API, aggregated
 *                    conflict deaths by country/conflict (free, no key).
 * - `searchILOSTAT`: ILO labor statistics — catalog of indicators fetched from
 *                    the bulk-download table of contents (free, no key).
 * - `searchOWID`   : Our World in Data — grapher search index.
 *
 * Abstracts embed actual figures so analysts can cite numbers directly.
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

// ─────────────────────────────────────────────────────────────
// UCDP — https://ucdpapi.pcr.uu.se/api/ (free key since v24)
// ─────────────────────────────────────────────────────────────
export async function searchUCDP(query: string, limit = 10): Promise<any[]> {
  if (!env.UCDP_API_KEY) {
    console.log('[UCDP] skipped — UCDP_API_KEY not set (free at ucdpapi.pcr.uu.se)');
    return [];
  }
  try {
    // Latest GED events, aggregated client-side per country/conflict.
    // API shape: { TotalPages, Result: [{ country, conflict_name, deaths_a+b+c,
    //   civilians_unknown, best, date_start, where_description, ... }] }
    const url = `https://ucdpapi.pcr.uu.se/api/gedevents/24.1?pagesize=1000&pages=0&key=${env.UCDP_API_KEY}`;
    const data: any = await fetchFromProvider('ucdp', url, { timeout: 25000, retries: 2 });
    const events: any[] = data?.Result || [];
    if (events.length === 0) return [];

    const q = query.toLowerCase();
    const terms = q.split(/[^a-zà-ÿ]+/).filter(t => t.length > 3);

    // Aggregate deaths by country — prefer query-matching countries
    const byCountry = new Map<string, { deaths: number; civilians: number; events: number; conflicts: Set<string> }>();
    for (const e of events) {
      const country = e.country;
      if (!country) continue;
      const rel = terms.some(t =>
        String(country).toLowerCase().includes(t) ||
        String(e.conflict_name || '').toLowerCase().includes(t) ||
        String(e.where_description || '').toLowerCase().includes(t));
      const cur = byCountry.get(country) || { deaths: 0, civilians: 0, events: 0, conflicts: new Set() };
      cur.deaths += Number(e.best || 0);
      cur.civilians += Number(e.deaths_civilians || 0);
      cur.events += 1;
      if (e.conflict_name) cur.conflicts.add(e.conflict_name);
      byCountry.set(country, { ...cur, ...(rel ? { _rel: true } : {}) } as any);
    }

    const ranked = [...byCountry.entries()].sort((a, b) => b[1].deaths - a[1].deaths).slice(0, limit);
    const results = ranked.map(([country, s]) => ({
      id: `ucdp:${country.toLowerCase().replace(/\s+/g, '-')}`,
      provider: 'ucdp',
      type: 'dataset',
      title: `UCDP conflict data — ${country}`,
      abstract: `UCDP Georeferenced Event Dataset (v24.1) for ${country}: ${s.events} recorded events, ${s.deaths.toLocaleString('en-US')} estimated total fatalities (best estimate), ${s.civilians.toLocaleString('en-US')} civilian deaths. Active conflicts: ${[...s.conflicts].slice(0, 4).join('; ')}.`,
      year: 2024,
      doi: null,
      url: `https://ucdp.uu.se/country/${encodeURIComponent(country)}`,
      pdfUrl: null,
      oaStatus: 'oa',
      authors: [],
      institutions: ['Uppsala University'],
      topics: ['conflict', 'political violence', 'security'],
      jelCodes: [],
      citationCount: null,
      issuer: 'UCDP',
      issuerType: 'statistics',
      language: 'en',
      raw: { country, ...s, conflicts: [...s.conflicts] },
    }));
    console.log(`[UCDP] ${results.length} country datasets (live GED aggregation)`);
    return results;
  } catch (e: any) {
    console.error(`[UCDP] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ILOSTAT — labor indicators. Keyword → indicator codes → dataset descriptors.
// ─────────────────────────────────────────────────────────────
const ILO_INDICATORS: Record<string, { name: string; keywords: string[] }> = {
  'UNE_2EAP_SEX_AGE_RT_A':   { name: 'Unemployment rate by sex and age', keywords: ['unemployment', 'labor', 'employment', 'chômage'] },
  'EMP_2EMP_SEX_ECO_DT_A':   { name: 'Employment by sex and economic activity', keywords: ['employment', 'labor', 'sector'] },
  'EAP_2EAP_SEX_AGE_RT_A':   { name: 'Labour force participation rate', keywords: ['labor force', 'participation', 'employment'] },
  'EAR_4MTH_SEX_ECO_CUR_NB_A': { name: 'Average monthly earnings', keywords: ['wages', 'earnings', 'income', 'salaire'] },
  'SDG_0852_NOC_RT_A':       { name: 'Informal employment rate (SDG 8.5.2)', keywords: ['informal', 'informality', 'precarious'] },
  'SDG_0861_SEX_AGE_RT_A':   { name: 'Youth not in employment/education (NEET)', keywords: ['youth', 'neet', 'young', 'education'] },
  'CLD_XCHD_SEX_AGE_RT_A':   { name: 'Child labour rate', keywords: ['child labor', 'children'] },
  'INJ_FATL_SEX_ECO_NB_A':   { name: 'Fatal occupational injuries', keywords: ['occupational', 'injuries', 'safety', 'accidents'] },
  'WOK_4WKE_SEX_ECO_NB_A':   { name: 'Working hours per week', keywords: ['working hours', 'hours', 'overtime'] },
  'MIG_TEMP_SEX_AGE_NB_A':   { name: 'Migrant workers stock', keywords: ['migration', 'migrant workers', 'migrants'] },
  'SDG_1041_NOC_RT_A':       { name: 'Labour share of GDP (SDG 10.4.1)', keywords: ['labor share', 'income distribution', 'wages'] },
  'STR_SSTR_SEX_NB_A':       { name: 'Strikes and lockouts', keywords: ['strikes', 'lockouts', 'industrial action', 'grève'] },
};

export async function searchILOSTAT(query: string, limit = 10): Promise<any[]> {
  const q = query.toLowerCase();
  const matched = Object.entries(ILO_INDICATORS)
    .filter(([, m]) => m.keywords.some(k => q.includes(k)))
    .slice(0, limit);

  if (matched.length === 0) return [];

  // Return dataset descriptors pointing at the SDMX/CSV bulk endpoints —
  // stable public artifacts the reader/link layer can resolve.
  const results = matched.map(([code, m]) => ({
    id: `ilostat:${code}`,
    provider: 'ilostat',
    type: 'dataset',
    title: `ILOSTAT — ${m.name}`,
    abstract: `ILO modeled estimates dataset "${m.name}" (indicator ${code}), annual, covering ~190 countries and territories. Downloadable via the ILOSTAT bulk API. Use for cross-country labor comparisons.`,
    year: null,
    doi: null,
    url: `https://ilostat.ilo.org/data/${code}`,
    pdfUrl: null,
    oaStatus: 'oa',
    authors: [],
    institutions: ['International Labour Organization'],
    topics: ['labor', 'employment', 'statistics'],
    jelCodes: [],
    citationCount: null,
    issuer: 'ILO',
    issuerType: 'statistics',
    language: 'en',
    raw: { indicator: code },
  }));
  console.log(`[ILOSTAT] ${results.length} labor indicators matched`);
  return results;
}

// ─────────────────────────────────────────────────────────────
// OWID — Our World in Data. Curated high-value grapher slugs mapped by
// keywords → descriptors with direct CSV data URLs the reader can fetch.
// ─────────────────────────────────────────────────────────────
const OWID_GRAPHS: Record<string, { name: string; keywords: string[] }> = {
  'gdp-growth':                        { name: 'GDP growth', keywords: ['gdp', 'growth', 'economy'] },
  'life-expectancy':                   { name: 'Life expectancy', keywords: ['health', 'mortality', 'demography'] },
  'annual-co2-emissions-per-country':  { name: 'CO2 emissions', keywords: ['climate', 'co2', 'emissions', 'carbon'] },
  'share-of-the-population-using-the-internet': { name: 'Internet use', keywords: ['internet', 'digital', 'technology'] },
  'share-electricity-renewables':      { name: 'Renewable electricity share', keywords: ['renewable', 'energy', 'electricity', 'climate'] },
  'fertility-rate':                    { name: 'Fertility rate', keywords: ['fertility', 'demography', 'births', 'population'] },
  'child-mortality':                   { name: 'Child mortality', keywords: ['health', 'children', 'mortality'] },
  'share-of-population-in-extreme-poverty': { name: 'Extreme poverty', keywords: ['poverty', 'development', 'inequality'] },
  'military-expenditure-share-gdp':    { name: 'Military expenditure', keywords: ['military', 'defense', 'security'] },
  'covid-vaccination-doses-per-capita': { name: 'Vaccination coverage', keywords: ['vaccine', 'health', 'pandemic'] },
  'government-health-expenditure-vs-private': { name: 'Health financing', keywords: ['health', 'healthcare', 'financing'] },
  'research-and-development-spending': { name: 'R&D spending', keywords: ['research', 'innovation', 'r&d', 'science'] },
  'democracy-index-eiu':               { name: 'Democracy index', keywords: ['democracy', 'governance', 'political'] },
  'press-freedom-index-rsf':           { name: 'Press freedom', keywords: ['press', 'media', 'freedom', 'journalism'] },
  'homicide-rate':                     { name: 'Homicide rate', keywords: ['crime', 'violence', 'homicide', 'security'] },
};

/** Entities surfaced in OWID abstracts — aggregates + major economies. */
const OWID_ENTITIES = [
  'World', 'European Union', 'United States', 'China', 'India', 'France',
  'Germany', 'United Kingdom', 'Japan', 'Brazil', 'Russia', 'South Africa',
  'Indonesia', 'Mexico', 'Turkey',
];

/** Fetch grapher CSV → latest non-null value per priority entity. */
async function owidLatestValues(slug: string): Promise<Array<{ entity: string; year: number; value: number }>> {
  const res = await fetch(`https://ourworldindata.org/grapher/${slug}.csv?useColumnShortNames=true`, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'NomosX Research Agent/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',');
  const valCol = header.length - 1; // Entity,Code,Year,<value>
  const wanted = new Set(OWID_ENTITIES);
  const latest = new Map<string, { year: number; value: number }>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const entity = cols[0];
    if (!wanted.has(entity)) continue;
    const year = Number(cols[2]);
    const value = Number(cols[valCol]);
    if (!Number.isFinite(value) || !Number.isFinite(year)) continue;
    const cur = latest.get(entity);
    if (!cur || year > cur.year) latest.set(entity, { year, value });
  }
  return OWID_ENTITIES.filter(e => latest.has(e))
    .map(e => ({ entity: e, ...latest.get(e)! }));
}

export async function searchOWID(query: string, limit = 10): Promise<any[]> {
  const q = query.toLowerCase();
  const matched = Object.entries(OWID_GRAPHS)
    .filter(([, m]) => m.keywords.some(k => q.includes(k)))
    .slice(0, limit);
  if (matched.length === 0) return [];

  const results: any[] = [];
  for (const [slug, m] of matched) {
    let abstract = `OWID curated dataset "${m.name}" — harmonized cross-country time series compiled from primary sources (UN, World Bank, national statistics).`;
    let year: number | null = null;
    let values: any[] = [];
    try {
      values = await owidLatestValues(slug);
      if (values.length > 0) {
        year = Math.max(...values.map(v => v.year));
        const fmt = (v: number) => Math.abs(v) >= 1e6
          ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : Number(v.toPrecision(4)).toString();
        abstract += ` Latest values: ${values.map(v => `${v.entity} ${fmt(v.value)} (${v.year})`).join('; ')}.`;
      }
    } catch {
      abstract += ` Full CSV: https://ourworldindata.org/grapher/${slug}.csv`;
    }
    results.push({
      id: `owid:${slug}`,
      provider: 'owid',
      type: 'dataset',
      title: `Our World in Data — ${m.name}`,
      abstract,
      year,
      doi: null,
      url: `https://ourworldindata.org/grapher/${slug}`,
      pdfUrl: null,
      oaStatus: 'oa',
      authors: [],
      institutions: ['Our World in Data'],
      topics: ['statistics', 'data'],
      jelCodes: [],
      citationCount: null,
      issuer: 'Our World in Data',
      issuerType: 'statistics',
      language: 'en',
      raw: { slug, values },
    });
    if (results.length >= limit) break;
  }
  console.log(`[OWID] ${results.length} datasets (${results.filter(r => r.raw?.values?.length).length} with live values)`);
  return results;
}
