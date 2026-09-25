/**
 * WORLD BANK DATA Provider — api.worldbank.org/v2 (free, no key).
 *
 * Two faces:
 *  1. `ingestWorldBankIndicators()` — bulk series ingestion for the macro DB
 *     (macro-refresh.ts), curated indicators × major economies, last 15 years.
 *  2. `searchWorldBankData(query)` — doc-layer provider returning "dataset"
 *     sources whose abstracts embed the LATEST VALUES for major economies,
 *     so analysts can cite real numbers (GDP growth FR: 0.9%, DE: -0.3%...).
 */

import { fetchFromProvider } from '../http-client';
import type { MacroSeries } from './eurostat';

const WB = 'https://api.worldbank.org/v2';

/** Indicators covering macro, labor, health, environment, education, military. */
export const WB_INDICATORS: Record<string, { name: string; unit: string; keywords: string[] }> = {
  'NY.GDP.MKTP.CD':        { name: 'GDP (current US$)', unit: 'USD', keywords: ['gdp', 'economy', 'growth', 'pib', 'economic'] },
  'NY.GDP.MKTP.KD.ZG':     { name: 'GDP growth (annual %)', unit: '%', keywords: ['gdp', 'growth', 'recession', 'recovery', 'pib', 'croissance'] },
  'NY.GDP.PCAP.CD':        { name: 'GDP per capita (current US$)', unit: 'USD', keywords: ['gdp', 'income', 'per capita', 'development', 'pib'] },
  'FP.CPI.TOTL.ZG':        { name: 'Inflation, consumer prices (annual %)', unit: '%', keywords: ['inflation', 'prices', 'cpi', 'cost of living'] },
  'SL.UEM.TOTL.ZS':        { name: 'Unemployment, total (% of labor force)', unit: '%', keywords: ['unemployment', 'labor', 'employment', 'jobs', 'chômage'] },
  'SP.POP.TOTL':           { name: 'Population, total', unit: 'persons', keywords: ['population', 'demography', 'demographic'] },
  'SP.POP.GROW':           { name: 'Population growth (annual %)', unit: '%', keywords: ['population', 'demography', 'fertility', 'aging'] },
  'SP.DYN.LE00.IN':        { name: 'Life expectancy at birth', unit: 'years', keywords: ['health', 'life expectancy', 'mortality', 'demography'] },
  'SI.POV.GINI':           { name: 'Gini index', unit: 'index', keywords: ['inequality', 'gini', 'poverty', 'distribution'] },
  'SI.POV.DDAY':           { name: 'Poverty headcount ($2.15/day)', unit: '%', keywords: ['poverty', 'development', 'inequality'] },
  'NE.TRD.GNFS.ZS':        { name: 'Trade (% of GDP)', unit: '%', keywords: ['trade', 'exports', 'imports', 'commerce'] },
  'BX.KLT.DINV.CD.WD':     { name: 'FDI, net inflows (US$)', unit: 'USD', keywords: ['investment', 'fdi', 'capital flows'] },
  'GC.DOD.TOTL.GD.ZS':     { name: 'Central government debt (% of GDP)', unit: '%', keywords: ['debt', 'fiscal', 'deficit', 'dette', 'public finance'] },
  'MS.MIL.XPND.GD.ZS':     { name: 'Military expenditure (% of GDP)', unit: '%', keywords: ['military', 'defense', 'security', 'defence', 'défense'] },
  'SH.XPD.CHEX.GD.ZS':     { name: 'Health expenditure (% of GDP)', unit: '%', keywords: ['health', 'healthcare', 'santé'] },
  'SE.XPD.TOTL.GD.ZS':     { name: 'Education expenditure (% of GDP)', unit: '%', keywords: ['education', 'schools'] },
  'IT.NET.USER.ZS':        { name: 'Internet users (% of population)', unit: '%', keywords: ['internet', 'digital', 'technology', 'numérique'] },
  'EG.ELC.ACCS.ZS':        { name: 'Access to electricity (% of population)', unit: '%', keywords: ['energy', 'electricity', 'infrastructure'] },
  'SM.POP.REFG':           { name: 'Refugee population by country of asylum', unit: 'persons', keywords: ['refugees', 'migration', 'displacement', 'asylum'] },
  'AG.LND.AGRI.ZS':        { name: 'Agricultural land (% of land area)', unit: '%', keywords: ['agriculture', 'land', 'food'] },
};

/** Major economies + regional aggregates — bounded to keep refresh fast. */
const WB_COUNTRIES = [
  'WLD', 'EUU', 'USA', 'CHN', 'JPN', 'DEU', 'GBR', 'FRA', 'IND', 'ITA',
  'BRA', 'CAN', 'RUS', 'KOR', 'AUS', 'ESP', 'MEX', 'IDN', 'NLD', 'SAU',
  'TUR', 'CHE', 'POL', 'ARG', 'SWE', 'BEL', 'NOR', 'AUT', 'IRL', 'DNK',
  'NGA', 'ZAF', 'EGY', 'VNM', 'THA', 'MYS', 'PHL', 'BGD', 'COL', 'CHL',
  'UKR', 'ISR', 'ARE', 'SGP', 'NZL', 'PRT', 'GRC', 'CZE', 'ROU', 'MAR',
];

const COUNTRY_LABELS: Record<string, string> = {
  WLD: 'World', EUU: 'EU', USA: 'US', CHN: 'China', JPN: 'Japan', DEU: 'Germany',
  GBR: 'UK', FRA: 'France', IND: 'India', ITA: 'Italy', BRA: 'Brazil', CAN: 'Canada',
  RUS: 'Russia', KOR: 'S. Korea', AUS: 'Australia', ESP: 'Spain', MEX: 'Mexico',
  IDN: 'Indonesia', NLD: 'Netherlands', SAU: 'Saudi Arabia', TUR: 'Turkey',
  CHE: 'Switzerland', POL: 'Poland', ARG: 'Argentina', SWE: 'Sweden', BEL: 'Belgium',
  NOR: 'Norway', AUT: 'Austria', IRL: 'Ireland', DNK: 'Denmark', NGA: 'Nigeria',
  ZAF: 'S. Africa', EGY: 'Egypt', VNM: 'Vietnam', THA: 'Thailand', MYS: 'Malaysia',
  PHL: 'Philippines', BGD: 'Bangladesh', COL: 'Colombia', CHL: 'Chile', UKR: 'Ukraine',
  ISR: 'Israel', ARE: 'UAE', SGP: 'Singapore', NZL: 'New Zealand', PRT: 'Portugal',
  GRC: 'Greece', CZE: 'Czechia', ROU: 'Romania', MAR: 'Morocco',
};

async function fetchWBSeries(
  indicator: string,
  countries: string[],
  dateRange: string,
): Promise<Array<{ country: string; code: string; points: Array<{ date: Date; value: number }> }>> {
  const countryStr = countries.join(';');
  const url = `${WB}/country/${countryStr}/indicator/${indicator}?format=json&per_page=${countries.length * 40}&date=${dateRange}`;
  const data: any = await fetchFromProvider('worldbank-data', url, { timeout: 20000, retries: 2 });
  const rows: any[] = Array.isArray(data) ? data[1] || [] : [];

  const byCountry = new Map<string, Array<{ date: Date; value: number }>>();
  for (const r of rows) {
    if (r.value == null) continue;
    const c = r.countryiso3code || r.country?.id;
    if (!c) continue;
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c)!.push({ date: new Date(`${r.date}-01-01`), value: Number(r.value) });
  }
  for (const pts of byCountry.values()) pts.sort((a, b) => a.date.getTime() - b.date.getTime());
  return [...byCountry.entries()].map(([code, points]) => ({
    country: COUNTRY_LABELS[code] || code,
    code,
    points,
  }));
}

/** Bulk ingestion for macro-refresh — one request per indicator (all countries). */
export async function ingestWorldBankIndicators(): Promise<MacroSeries[]> {
  const series: MacroSeries[] = [];
  for (const [code, meta] of Object.entries(WB_INDICATORS)) {
    try {
      const rows = await fetchWBSeries(code, WB_COUNTRIES, '2010:2025');
      // Flatten: one MacroSeries per indicator×country
      for (const r of rows) {
        if (r.points.length === 0) continue;
        series.push({
          provider: 'worldbank',
          code: `${code}:${r.code}`,
          name: `${meta.name} — ${r.country}`,
          unit: meta.unit,
          frequency: 'annual',
          points: r.points,
        });
      }
    } catch (e: any) {
      console.warn(`[WB-DATA] indicator ${code} failed: ${e?.message}`);
    }
  }
  console.log(`[WB-DATA] ingested ${series.length} indicator×country series`);
  return series;
}

/** Doc-layer: match query keywords → indicators → dataset sources with real numbers. */
export async function searchWorldBankData(query: string, limit = 10): Promise<any[]> {
  const q = query.toLowerCase();
  const matched = Object.entries(WB_INDICATORS)
    .filter(([, m]) => m.keywords.some(k => q.includes(k)))
    .slice(0, 6);

  if (matched.length === 0) {
    // Broad fallback: growth + inflation + unemployment are relevant to almost any macro topic
    matched.push(
      ['NY.GDP.MKTP.KD.ZG', WB_INDICATORS['NY.GDP.MKTP.KD.ZG']],
      ['FP.CPI.TOTL.ZG', WB_INDICATORS['FP.CPI.TOTL.ZG']],
      ['SL.UEM.TOTL.ZS', WB_INDICATORS['SL.UEM.TOTL.ZS']],
    );
  }

  const results: any[] = [];
  for (const [code, meta] of matched) {
    try {
      const rows = await fetchWBSeries(code, WB_COUNTRIES.slice(0, 30), '2018:2025');
      if (rows.length === 0) continue;
      // Latest value per country → numeric abstract
      const latest = rows
        .map(r => ({ country: r.country, point: r.points[r.points.length - 1] }))
        .filter(x => x.point)
        .slice(0, 15);
      const lines = latest.map(x => {
        const v = meta.unit === 'USD' || meta.unit === 'persons'
          ? x.point.value.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : x.point.value.toFixed(1);
        return `${x.country}: ${v} ${meta.unit === 'persons' || meta.unit === 'USD' ? '' : meta.unit} (${x.point.date.getFullYear()})`;
      });
      results.push({
        id: `worldbank-data:${code}`,
        provider: 'worldbank-data',
        type: 'dataset',
        title: `World Bank — ${meta.name}`,
        abstract: `Latest available values for ${meta.name} (${meta.unit}): ${lines.join('; ')}. Source: World Bank World Development Indicators, indicator ${code}.`,
        year: latest[0]?.point?.date.getFullYear() ?? null,
        doi: null,
        url: `https://data.worldbank.org/indicator/${code}`,
        pdfUrl: null,
        oaStatus: 'oa',
        authors: [],
        institutions: ['World Bank'],
        topics: ['statistics', 'development', 'economics'],
        jelCodes: [],
        citationCount: null,
        issuer: 'World Bank',
        issuerType: 'statistics',
        language: 'en',
        raw: { indicator: code, values: latest.map(x => ({ c: x.country, y: x.point.date.getFullYear(), v: x.point.value })) },
      });
    } catch {
      // skip failed indicator
    }
    if (results.length >= limit) break;
  }
  console.log(`[WB-DATA] ${results.length} indicator datasets with live values`);
  return results;
}
