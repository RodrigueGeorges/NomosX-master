/**
 * STATS-KEYS Providers — national/international statistics APIs.
 *
 * Free but key-gated (degrade to [] gracefully when env missing):
 *   comtrade (COMTRADE_API_KEY), bls (BLS_API_KEY), census (CENSUS_API_KEY),
 *   acled (ACLED_API_KEY + ACLED_EMAIL), unhcr (UNHCR_API_KEY),
 *   estat-jp (ESTAT_JP_APP_ID), kosis (KOSIS_API_KEY)
 * No key required:
 *   ons-uk (api.beta.ons.gov.uk), ibge (servicodados.ibge.gov.br agregados)
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

const ds = (id: string, provider: string, title: string, abstract: string, url: string, issuer: string, raw?: any): any => ({
  id: `${provider}:${id}`,
  provider,
  type: 'dataset',
  title,
  abstract,
  year: null,
  doi: null,
  url,
  pdfUrl: null,
  oaStatus: 'oa',
  authors: [],
  institutions: [issuer],
  topics: ['statistics'],
  jelCodes: [],
  citationCount: null,
  issuer,
  issuerType: 'statistics',
  language: 'en',
  raw,
});

// ─────────────────────────────────────────────────────────────
// UN COMTRADE — bilateral trade flows (key; preview endpoint w/o key)
// ─────────────────────────────────────────────────────────────
const COMTRADE_REPORTERS: Record<string, number> = {
  france: 251, 'united states': 842, usa: 842, us: 842, america: 842,
  china: 156, germany: 276, 'united kingdom': 826, uk: 826, britain: 826,
  japan: 392, india: 699, brazil: 76, canada: 124, italy: 381, spain: 724,
  korea: 410, 'south korea': 410, mexico: 484, netherlands: 528,
  turkey: 792, 'switzerland': 757, russia: 643, ukraine: 804,
};

export async function searchComtrade(query: string, limit = 8): Promise<any[]> {
  const q = query.toLowerCase();
  const reporters = Object.entries(COMTRADE_REPORTERS)
    .filter(([name]) => q.includes(name))
    .map(([, code]) => code);
  const unique = [...new Set(reporters)].slice(0, 4);
  if (unique.length === 0) unique.push(842, 156); // default US + China — most queried dyad

  const key = env.COMTRADE_API_KEY;
  if (!key) {
    // The public preview endpoint returns demo-scaled values — misleading.
    // Return descriptors only (no numbers) when unkeyed.
    return unique.map(code => ds(
      `${code}`, 'comtrade',
      `UN Comtrade — reporter ${code}`,
      `UN Comtrade database: bilateral merchandise trade flows for reporter ${code}. Set COMTRADE_API_KEY for live trade values.`,
      `https://comtradeplus.un.org/TradeFlow?reporter=${code}`,
      'UN Comtrade',
    ));
  }
  const base = `https://comtradeapi.un.org/data/v1/get/C/A/HS`;
  const suffix = `&subscription-key=${key}`;

  const results: any[] = [];
  for (const rep of unique) {
    for (const flow of ['X', 'M'] as const) {
      try {
        // Aggregate trade (TOTAL commodity) with the world (partner 0)
        const url = `${base}?period=2023&reporterCode=${rep}&flowCode=${flow}&partnerCode=0&cmdCode=TOTAL${suffix}`;
        const data: any = await fetchFromProvider('comtrade', url, { timeout: 15000, retries: 1 });
        const rows: any[] = data?.data || [];
        if (rows.length === 0) continue;
        const r = rows[0];
        const val = Number(r.primaryValue || r.fobvalue || 0);
        results.push(ds(
          `${rep}-${flow}`, 'comtrade',
          `UN Comtrade — ${r.reporterDesc || rep} ${flow === 'X' ? 'exports' : 'imports'} (all commodities, world)`,
          `UN Comtrade annual ${flow === 'X' ? 'exports' : 'imports'} of all commodities for ${r.reporterDesc || rep} in ${r.period}: US$ ${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}. Source: United Nations Comtrade database.`,
          `https://comtradeplus.un.org/TradeFlow?freq=A&reporter=${rep}&period=2023&flow=${flow}`,
          'UN Comtrade', { reporter: rep, flow, period: r.period, value: val },
        ));
      } catch { /* skip */ }
      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }
  console.log(`[COMTRADE] ${results.length} trade datasets`);
  return results;
}

// ─────────────────────────────────────────────────────────────
// BLS — US Bureau of Labor Statistics (key optional; v2 API)
// ─────────────────────────────────────────────────────────────
const BLS_SERIES: Record<string, { name: string; keywords: string[] }> = {
  'LNS14000000':            { name: 'US unemployment rate', keywords: ['unemployment', 'jobs', 'labor'] },
  'CUUR0000SA0':            { name: 'US CPI inflation', keywords: ['inflation', 'cpi', 'prices'] },
  'CES0000000001':          { name: 'US nonfarm payrolls', keywords: ['jobs', 'payroll', 'employment'] },
  'LNS11300000':            { name: 'US labor force participation', keywords: ['participation', 'labor force'] },
  'JTS000000000000000JOL':  { name: 'US job openings (JOLTS)', keywords: ['job openings', 'vacancies', 'jolts'] },
  'WPSFD4':                 { name: 'US PPI final demand', keywords: ['producer prices', 'ppi', 'wholesale'] },
  'CIU2010000000000A':      { name: 'US employment cost index', keywords: ['wages', 'compensation', 'earnings'] },
};

export async function searchBLS(query: string, limit = 6): Promise<any[]> {
  const q = query.toLowerCase();
  const matched = Object.entries(BLS_SERIES)
    .filter(([, m]) => m.keywords.some(k => q.includes(k)))
    .map(([id]) => id);
  if (matched.length === 0) return [];

  try {
    const body: any = {
      seriesid: matched,
      startyear: '2023',
      endyear: String(new Date().getFullYear()),
      catalog: false,
      calculations: false,
      annualaverage: false,
    };
    if (env.BLS_API_KEY) body.registrationkey = env.BLS_API_KEY;

    const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();

    const results = (data?.Results?.series || []).map((s: any) => {
      const meta = BLS_SERIES[s.seriesID];
      const latest = (s.data || []).filter((d: any) => d.period.startsWith('M'))[0];
      return ds(
        s.seriesID, 'us-bls',
        `BLS — ${meta?.name || s.seriesID}`,
        `BLS time series ${s.seriesID} (${meta?.name || 'indicator'}). Latest observation: ${latest?.value} (${latest?.periodName} ${latest?.year}). US Bureau of Labor Statistics.`,
        `https://data.bls.gov/timeseries/${s.seriesID}`,
        'US Bureau of Labor Statistics', { series: s.seriesID, latest },
      );
    });
    console.log(`[BLS] ${results.length} series with live values`);
    return results;
  } catch (e: any) {
    console.error(`[BLS] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// US CENSUS — ACS profile data (key optional, 500 calls/day keyless)
// ─────────────────────────────────────────────────────────────
export async function searchCensus(query: string, limit = 6): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/census|population|income|poverty|demograph|housing|us\b|america|united states/.test(q)) return [];
  if (!env.CENSUS_API_KEY) {
    console.log('[CENSUS] skipped — CENSUS_API_KEY not set (free at api.census.gov)');
    return [];
  }

  try {
    const key = `&key=${env.CENSUS_API_KEY}`;
    const url = `https://api.census.gov/data/2023/acs/acs1/profile?get=NAME,DP05_0001E,DP03_0062E,DP03_0119PE,DP04_0089E&for=us:*${key}`;
    const data: any = await fetchFromProvider('us-census', url, { timeout: 12000, retries: 1 });
    const rows: any[] = Array.isArray(data) ? data.slice(1) : [];
    if (rows.length === 0) return [];

    const [name, pop, medIncome, povertyPct, medRent] = rows[0];
    const result = ds(
      'acs-1y-us', 'us-census',
      `US Census ACS — national profile`,
      `American Community Survey 1-year estimates: population ${Number(pop).toLocaleString('en-US')}; median household income $${Number(medIncome).toLocaleString('en-US')}; poverty rate ${povertyPct}%; median gross rent $${Number(medRent).toLocaleString('en-US')}.`,
      'https://data.census.gov/',
      'US Census Bureau', { pop, medIncome, povertyPct, medRent },
    );
    console.log(`[CENSUS] national profile fetched`);
    return [result];
  } catch (e: any) {
    console.error(`[CENSUS] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ACLED — political violence events (key + email required)
// ─────────────────────────────────────────────────────────────
export async function searchACLED(query: string, limit = 8): Promise<any[]> {
  if (!env.ACLED_API_KEY || !env.ACLED_EMAIL) {
    console.log('[ACLED] skipped — ACLED_API_KEY/ACLED_EMAIL not set (free academic registration at acleddata.com)');
    return [];
  }
  try {
    const url = `https://api.acleddata.com/acled/read?key=${env.ACLED_API_KEY}&email=${env.ACLED_EMAIL}&year=${new Date().getFullYear()}&fields=country%7Cevent_type%7Cfatalities&limit=3000`;
    const data: any = await fetchFromProvider('acled', url, { timeout: 25000, retries: 1 });
    const events: any[] = data?.data || [];
    if (events.length === 0) return [];

    const q = query.toLowerCase();
    const byCountry = new Map<string, { deaths: number; events: number; types: Set<string> }>();
    for (const e of events) {
      const c = e.country;
      if (!c) continue;
      const cur = byCountry.get(c) || { deaths: 0, events: 0, types: new Set() };
      cur.deaths += Number(e.fatalities || 0);
      cur.events += 1;
      if (e.event_type) cur.types.add(e.event_type);
      byCountry.set(c, cur);
    }
    const ranked = [...byCountry.entries()]
      .filter(([c]) => q.split(/\W+/).some(t => t.length > 3 && c.toLowerCase().includes(t)))
      .concat([...byCountry.entries()])
      .slice(0, limit);

    const results = [...new Map(ranked.map(r => [r[0], r[1]])).entries()].map(([country, s]) => ds(
      country.toLowerCase().replace(/\s+/g, '-'), 'acled',
      `ACLED conflict events — ${country}`,
      `ACLED data for ${country} (current year): ${s.events.toLocaleString('en-US')} political violence events, ${s.deaths.toLocaleString('en-US')} reported fatalities. Event types: ${[...s.types].slice(0, 4).join(', ')}.`,
      'https://acleddata.com/data-export-tool/',
      'ACLED', { country, ...s, types: [...s.types] },
    ));
    console.log(`[ACLED] ${results.length} country aggregates`);
    return results;
  } catch (e: any) {
    console.error(`[ACLED] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// UNHCR — refugee/IDP statistics (key required)
// ─────────────────────────────────────────────────────────────
export async function searchUNHCR(query: string, limit = 8): Promise<any[]> {
  if (!env.UNHCR_API_KEY) {
    console.log('[UNHCR] skipped — UNHCR_API_KEY not set (free at api.unhcr.org)');
    return [];
  }
  try {
    const url = `https://api.unhcr.org/population/v1/population/?limit=50&year=2023&coa_all=true&columns=refugees,asylum_seekers,idps`;
    const data: any = await fetchFromProvider('unhcr', url, {
      timeout: 15000, retries: 1,
      headers: { 'x-api-key': env.UNHCR_API_KEY },
    });
    const rows: any[] = data?.items || data?.data || [];
    if (rows.length === 0) return [];

    const q = query.toLowerCase();
    const ranked = rows
      .map((r: any) => ({
        coa: r.coa_name || r.coa,
        refugees: Number(r.refugees || 0),
        asylum: Number(r.asylum_seekers || 0),
        idps: Number(r.idps || 0),
      }))
      .sort((a, b) => (b.refugees + b.idps) - (a.refugees + a.idps))
      .slice(0, limit);

    const results = ranked.map(r => ds(
      String(r.coa).toLowerCase().replace(/\s+/g, '-'), 'unhcr',
      `UNHCR displacement data — ${r.coa}`,
      `UNHCR statistics for ${r.coa}: ${r.refugees.toLocaleString('en-US')} refugees hosted, ${r.asylum.toLocaleString('en-US')} asylum seekers, ${r.idps.toLocaleString('en-US')} internally displaced persons (latest year).`,
      'https://www.unhcr.org/refugee-statistics/',
      'UNHCR', r,
    ));
    console.log(`[UNHCR] ${results.length} country datasets`);
    return results;
  } catch (e: any) {
    console.error(`[UNHCR] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// E-STAT JAPAN — official statistics catalog (appId required, free)
// ─────────────────────────────────────────────────────────────
export async function searchEStatJP(query: string, limit = 8): Promise<any[]> {
  if (!env.ESTAT_JP_APP_ID) {
    console.log('[E-STAT-JP] skipped — ESTAT_JP_APP_ID not set (free at e-stat.go.jp)');
    return [];
  }
  try {
    const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList?appId=${env.ESTAT_JP_APP_ID}&searchWord=${encodeURIComponent(query)}&limit=${limit}`;
    const data: any = await fetchFromProvider('estat-jp', url, { timeout: 15000, retries: 1 });
    const tables: any[] = data?.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF || [];
    const results = (Array.isArray(tables) ? tables : [tables]).map((t: any) => ds(
      String(t['@id']), 'estat-jp',
      `e-Stat Japan — ${t.TITLE?._ || t.TITLE || t['@id']}`,
      `Japanese official statistics table "${t.TITLE?._ || t.TITLE}" (survey: ${t.SURVEY_DATE || 'n/a'}). Published by ${t.GOV_ORG?._ || 'Statistics Bureau of Japan'} via e-Stat.`,
      `https://www.e-stat.go.jp/stat-search/files?stat_infid=${t['@id']}`,
      'e-Stat Japan', t,
    ));
    console.log(`[E-STAT-JP] ${results.length} tables`);
    return results;
  } catch (e: any) {
    console.error(`[E-STAT-JP] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// KOSIS — Korean statistics (key required, free)
// ─────────────────────────────────────────────────────────────
export async function searchKOSIS(query: string, limit = 8): Promise<any[]> {
  if (!env.KOSIS_API_KEY) {
    console.log('[KOSIS] skipped — KOSIS_API_KEY not set (free at kosis.kr)');
    return [];
  }
  try {
    const url = `https://kosis.kr/openapi/statisticsList.do?method=getList&apiKey=${env.KOSIS_API_KEY}&vwCd=MT_ZTITLE&format=json&sort=A&parentListId=A&jsonVD=Y&searchWrd=${encodeURIComponent(query)}`;
    const data: any = await fetchFromProvider('kosis', url, { timeout: 15000, retries: 1 });
    const items: any[] = Array.isArray(data) ? data : data?.result || [];
    const results = items.slice(0, limit).map((t: any) => ds(
      String(t.ORG_ID || t.TBL_ID || Math.random()), 'kosis',
      `KOSIS — ${t.TBL_NM || t.STAT_NM || 'dataset'}`,
      `Korean national statistics dataset "${t.TBL_NM || t.STAT_NM}" via KOSIS open API.`,
      'https://kosis.kr/eng/',
      'Statistics Korea (KOSIS)', t,
    ));
    console.log(`[KOSIS] ${results.length} datasets`);
    return results;
  } catch (e: any) {
    console.error(`[KOSIS] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// DATA COMMONS — Google's unified stats graph (WB+UN+Eurostat+Census
// harmonized). Free key at apikeys.datacommons.org.
// ─────────────────────────────────────────────────────────────
const DC_VARIABLES: Record<string, { name: string; keywords: string[] }> = {
  'Count_Person':             { name: 'Population', keywords: ['population', 'demograph'] },
  'Amount_EconomicActivity_GrossDomesticProduct_Nominal': { name: 'GDP (nominal)', keywords: ['gdp', 'economy', 'growth'] },
  'GrowthRate_Amount_EconomicActivity_GrossDomesticProduct': { name: 'GDP growth rate', keywords: ['growth', 'recession', 'gdp'] },
  'UnemploymentRate_Person':  { name: 'Unemployment rate', keywords: ['unemployment', 'labor', 'jobs', 'employment'] },
  'Median_Income_Person':     { name: 'Median income', keywords: ['income', 'wages', 'inequality'] },
  'LifeExpectancy_Person':    { name: 'Life expectancy', keywords: ['health', 'mortality', 'life expectancy'] },
  'Count_Death':              { name: 'Total deaths', keywords: ['mortality', 'deaths', 'health'] },
  'Amount_Emissions_CarbonDioxide': { name: 'CO2 emissions', keywords: ['co2', 'emissions', 'climate', 'carbon'] },
  'Count_Person_BelowPovertyLevelInThePast12Months': { name: 'Population below poverty', keywords: ['poverty', 'inequality', 'welfare'] },
};

const DC_COUNTRIES: Record<string, string> = {
  france: 'country/FRA', 'united states': 'country/USA', usa: 'country/USA',
  china: 'country/CHN', germany: 'country/DEU', 'united kingdom': 'country/GBR',
  uk: 'country/GBR', japan: 'country/JPN', india: 'country/IND', italy: 'country/ITA',
  brazil: 'country/BRA', canada: 'country/CAN', russia: 'country/RUS',
  korea: 'country/KOR', spain: 'country/ESP', mexico: 'country/MEX',
  turkey: 'country/TUR', ukraine: 'country/UKR', indonesia: 'country/IDN',
};

export async function searchDataCommons(query: string, limit = 6): Promise<any[]> {
  if (!env.DATACOMMONS_API_KEY) {
    console.log('[DATACOMMONS] skipped — DATACOMMONS_API_KEY not set (free at apikeys.datacommons.org)');
    return [];
  }
  const q = query.toLowerCase();
  const vars = Object.entries(DC_VARIABLES)
    .filter(([, m]) => m.keywords.some(k => q.includes(k)))
    .slice(0, 3);
  if (vars.length === 0) return [];

  const entities = Object.entries(DC_COUNTRIES)
    .filter(([name]) => q.includes(name))
    .map(([, dcid]) => dcid);
  if (entities.length === 0) entities.push('country/USA', 'country/FRA', 'country/CHN', 'world');

  const results: any[] = [];
  for (const [varId, meta] of vars) {
    try {
      const url = `https://api.datacommons.org/v2/observation?key=${env.DATACOMMONS_API_KEY}&date=latest&select=date&select=entity&select=value&select=variable&select=facet&variable.dcids=${varId}&${entities.map(e => `entity.dcids=${e}`).join('&')}`;
      const data: any = await fetchFromProvider('datacommons', url, { timeout: 15000, retries: 1 });
      // v2 response: byVariable[varId].orderedFacets[facetId].observations[]
      const obs: any[] = data?.byVariable?.[varId]?.orderedFacets?.[0]?.observations
        ?? Object.values(data?.byVariable?.[varId]?.orderedFacets ?? {})[0] as any;
      const list: any[] = Array.isArray(obs) ? obs : [];
      if (list.length === 0) continue;
      const lines = list.slice(0, 10).map((o: any) =>
        `${o.dcid?.replace('country/', '') || o.entity}: ${Number(o.value).toLocaleString('en-US', { maximumFractionDigits: 1 })} (${o.date})`);
      results.push(ds(
        varId, 'datacommons',
        `Data Commons — ${meta.name}`,
        `Data Commons harmonized statistics "${meta.name}" — latest values: ${lines.join('; ')}. Sources harmonized from World Bank, UN, Eurostat, national offices.`,
        `https://datacommons.org/browser/${varId}`,
        'Data Commons', { variable: varId, values: list.slice(0, 10) },
      ));
      if (results.length >= limit) break;
    } catch { /* skip variable */ }
  }
  console.log(`[DATACOMMONS] ${results.length} indicator datasets`);
  return results;
}

// ─────────────────────────────────────────────────────────────
// ONS UK — dataset search (no key)
// ─────────────────────────────────────────────────────────────
export async function searchONS(query: string, limit = 8): Promise<any[]> {
  try {
    const url = `https://api.beta.ons.gov.uk/v1/datasets?q=${encodeURIComponent(query)}&limit=${limit}`;
    const data: any = await fetchFromProvider('ons-uk', url, { timeout: 15000, retries: 2 });
    const items: any[] = data?.items || [];
    const results = items.map((d: any) => ds(
      d.id, 'ons-uk',
      `ONS — ${d.title}`,
      `UK Office for National Statistics dataset "${d.title}" (${d.release_frequency || 'periodic'}). ${d.description || 'Official UK statistics.'}`.slice(0, 1200),
      d.links?.self?.href || `https://www.ons.gov.uk/datasets/${d.id}`,
      'Office for National Statistics', d,
    ));
    console.log(`[ONS-UK] ${results.length} datasets`);
    return results;
  } catch (e: any) {
    console.error(`[ONS-UK] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// IBGE Brazil — aggregates catalog (no key). Catalog is in Portuguese —
// map common EN keywords to PT stems for matching.
// ─────────────────────────────────────────────────────────────
const IBGE_EN_TO_PT: Record<string, string[]> = {
  agriculture: ['agro', 'lavoura', 'pecuaria', 'producao agricola'],
  population: ['populacao', 'demograf', 'censo'],
  inflation: ['ipca', 'precos', 'inflacao'],
  gdp: ['pib'],
  economy: ['pib', 'contas nacionais'],
  employment: ['trabalho', 'emprego', 'pnad'],
  labor: ['trabalho', 'emprego', 'pnad'],
  industry: ['industria', 'industrial', 'pim'],
  trade: ['comercio', 'pmc'],
  poverty: ['pobreza', 'renda'],
  income: ['renda', 'rendimento'],
};

export async function searchIBGE(query: string, limit = 8): Promise<any[]> {
  try {
    const url = `https://servicodados.ibge.gov.br/api/v3/agregados`;
    const data: any = await fetchFromProvider('ibge', url, { timeout: 20000, retries: 1 });
    const groups: any[] = Array.isArray(data) ? data : [];
    const q = query.toLowerCase();
    const rawTerms = q.split(/[^a-zà-ÿ]+/).filter(t => t.length > 3);
    const terms = new Set(rawTerms);
    for (const t of rawTerms) for (const pt of IBGE_EN_TO_PT[t] || []) terms.add(pt);

    const results: any[] = [];
    for (const g of groups) {
      for (const agg of g.agregados || []) {
        const name = `${g.nome || ''} ${agg.nome || ''}`.toLowerCase();
        if (terms.size > 0 && ![...terms].some(t => name.includes(t))) continue;
        results.push(ds(
          String(agg.id), 'ibge',
          `IBGE — ${agg.nome}`,
          `Brazilian statistics aggregate "${agg.nome}" (IBGE SIDRA table ${agg.id}, subject: ${g.nome}). Queryable via SIDRA API.`,
          `https://sidra.ibge.gov.br/tabela/${agg.id}`,
          'IBGE', agg,
        ));
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }
    console.log(`[IBGE] ${results.length} aggregates matched`);
    return results;
  } catch (e: any) {
    console.error(`[IBGE] failed: ${e?.message}`);
    return [];
  }
}
