/**
 * STATS-KEYS Providers — national/international statistics APIs.
 *
 * Free but key-gated (degrade to [] gracefully when env missing):
 *   census (CENSUS_API_KEY),
 *   estat-jp (ESTAT_JP_APP_ID), kosis (KOSIS_API_KEY), datacommons (DATACOMMONS_API_KEY)
 *   bls (key optional — keyless tier ~25 req/day), comtrade (key optional — public preview endpoint)
 * No key required:
 *   ons-uk (api.beta.ons.gov.uk), ibge (servicodados.ibge.gov.br agregados)
 */

import { fetchFromProvider, httpPost } from '../http-client';
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
  // Public preview endpoint works without a key and returns real values
  // (record-count limited, fine for TOTAL/annual aggregates).
  const base = key
    ? `https://comtradeapi.un.org/data/v1/get/C/A/HS?subscription-key=${key}&`
    : `https://comtradeapi.un.org/public/v1/preview/C/A/HS?`;

  const results: any[] = [];
  for (const rep of unique) {
    for (const flow of ['X', 'M'] as const) {
      try {
        // Aggregate trade (TOTAL commodity) with the world (partner 0)
        const url = `${base}?period=2023&reporterCode=${rep}&flowCode=${flow}&partnerCode=0&cmdCode=TOTAL`;
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
// ACLED — political violence events (OAuth password grant, myACLED account)
// Token endpoint: POST /oauth/token → Bearer token valid 24h (cached).
// ─────────────────────────────────────────────────────────────
let acledToken: { token: string; expiresAt: number } | null = null;

async function getAcledToken(): Promise<string> {
  if (acledToken && acledToken.expiresAt > Date.now()) return acledToken.token;
  const body = new URLSearchParams({
    username: env.ACLED_EMAIL!,
    password: env.ACLED_PASSWORD!,
    grant_type: 'password',
    client_id: 'acled',
    scope: 'authenticated',
  }).toString();
  const data: any = await httpPost('https://acleddata.com/oauth/token', body, {
    timeout: 15000, retries: 1, rateLimiterKey: 'acled',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const token = data?.access_token;
  if (!token) throw new Error('ACLED OAuth: no access_token in response');
  acledToken = { token, expiresAt: Date.now() + 23 * 3600 * 1000 };
  return token;
}

export async function searchACLED(query: string, limit = 8): Promise<any[]> {
  if (!env.ACLED_EMAIL || !env.ACLED_PASSWORD) {
    console.log('[ACLED] skipped — ACLED_EMAIL/ACLED_PASSWORD not set (free myACLED account at acleddata.com)');
    return [];
  }
  try {
    const token = await getAcledToken();
    const url = `https://acleddata.com/api/acled/read?_format=json&year=${new Date().getFullYear()}&fields=country%7Cevent_type%7Cfatalities&limit=5000`;
    const data: any = await fetchFromProvider('acled', url, {
      timeout: 25000, retries: 1,
      headers: { Authorization: `Bearer ${token}` },
    });
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
  try {
    const url = `https://api.unhcr.org/population/v1/population/?limit=200&yearFrom=2024&yearTo=2024&coa_all=true&columns=refugees,asylum_seekers,idps&cf_type=ISO`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (env.UNHCR_API_KEY) headers['x-api-key'] = env.UNHCR_API_KEY;
    const data: any = await fetchFromProvider('unhcr', url, {
      timeout: 15000, retries: 1,
      headers,
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
      .filter(r => r.coa && r.coa !== '-')
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
// HDX — UN OCHA Humanitarian Data Exchange (CKAN API, no key)
// Humanitarian datasets: displacement, food security (IPC), needs,
// logistics, protection — updated continuously by UN agencies.
// ─────────────────────────────────────────────────────────────
export async function searchHDX(query: string, limit = 8): Promise<any[]> {
  try {
    const q = query.toLowerCase();
    const terms = q.split(/[^a-zà-ÿ0-9]+/).filter(t => t.length > 3).slice(0, 4);
    const searchQ = terms.length > 0 ? terms.join(' OR ') : query;
    const url = `https://data.humdata.org/api/3/action/package_search?q=${encodeURIComponent(searchQ)}&rows=${Math.min(limit * 2, 20)}&sort=metadata_modified desc`;
    const data: any = await fetchFromProvider('hdx', url, { timeout: 20000, retries: 1 });
    const items: any[] = data?.result?.results || [];
    if (items.length === 0) return [];

    const results = items.slice(0, limit).map((p: any) => {
      const org = p.organization?.title || '';
      const notes = String(p.notes || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      const resUrls = (p.resources || []).slice(0, 2).map((r: any) => r.url).filter(Boolean);
      const datasetUrl = `https://data.humdata.org/dataset/${p.name}`;
      return ds(
        p.name, 'hdx',
        `HDX — ${p.title}`,
        `Humanitarian dataset "${p.title}"${org ? ` by ${org}` : ''} on UN OCHA Humanitarian Data Exchange. ${notes || 'Official humanitarian statistics.'}`,
        datasetUrl,
        org || 'UN OCHA HDX',
        { name: p.name, org, modified: p.metadata_modified, resources: resUrls },
      );
    });
    console.log(`[HDX] ${results.length} humanitarian datasets`);
    return results;
  } catch (e: any) {
    console.error(`[HDX] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// OCHA FTS — Financial Tracking Service (HPC public API, no key)
// Humanitarian funding flows: contributions vs requirements per plan.
// ─────────────────────────────────────────────────────────────
export async function searchFTS(query: string, limit = 8): Promise<any[]> {
  try {
    const thisYear = new Date().getFullYear();
    // Current year is sparse early in the year — fall back to last full year
    let year = thisYear;
    let data: any = await fetchFromProvider('ocha-fts',
      `https://api.hpc.tools/v1/public/fts/flow?year=${year}&groupby=plan&limit=50`,
      { timeout: 25000, retries: 1 });
    let report = data?.data?.report1?.fundingTotals;
    const planCount = (r: any) => ((r?.objects || [])[0]?.singleFundingObjects || []).length;
    if (planCount(report) < 3) {
      year = thisYear - 1;
      data = await fetchFromProvider('ocha-fts',
        `https://api.hpc.tools/v1/public/fts/flow?year=${year}&groupby=plan&limit=50`,
        { timeout: 25000, retries: 1 });
      report = data?.data?.report1?.fundingTotals;
    }
    if (!report) return [];

    const q = query.toLowerCase();
    const terms = q.split(/[^a-zà-ÿ0-9]+/).filter(t => t.length > 3);
    // Structure: fundingTotals.objects[0].singleFundingObjects[] = per-plan funding
    const top = (report.objects || [])[0];
    const plans: any[] = (top?.singleFundingObjects || top?.objects || report.objects || [])
      .filter((o: any) => Number(o.totalFunding || o.singleFundingTotal || 0) > 0);
    const matched = terms.length
      ? plans.filter((o: any) => terms.some(t => String(o.name || '').toLowerCase().includes(t)))
      : [];
    const ranked = (matched.length ? matched : plans)
      .sort((a: any, b: any) => Number(b.totalFunding || 0) - Number(a.totalFunding || 0))
      .slice(0, limit);

    const totalUsd = Number(report.total || 0);
    const results = ranked.map((o: any) => {
      const name = String(o.name || 'Unnamed plan');
      const usd = Number(o.totalFunding || o.singleFundingTotal || 0);
      return ds(
        `fts-${o.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 'ocha-fts',
        `OCHA FTS — ${name}`,
        `UN OCHA Financial Tracking Service: $${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })} contributed to "${name}" in ${year} (global humanitarian funding tracked: $${totalUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}). Source: FTS/HPC public API.`,
        'https://fts.unocha.org/',
        'UN OCHA FTS', { plan: name, year, fundingUsd: usd },
      );
    });
    console.log(`[OCHA-FTS] ${results.length} funded plans (${year})`);
    return results;
  } catch (e: any) {
    console.error(`[OCHA-FTS] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// RELIEFWEB — OCHA humanitarian reports & analyses (v2 API)
// Requires approved appname (free request at apidoc.reliefweb.int).
// ─────────────────────────────────────────────────────────────
export async function searchReliefWeb(query: string, limit = 8): Promise<any[]> {
  if (!env.RELIEFWEB_APPNAME) {
    console.log('[RELIEFWEB] skipped — RELIEFWEB_APPNAME not set (free approved appname at apidoc.reliefweb.int)');
    return [];
  }
  try {
    const url = `https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(env.RELIEFWEB_APPNAME)}&limit=${limit}&sort[]=date:desc`;
    const payload = JSON.stringify({
      query: { value: query },
      fields: { include: ['title', 'date', 'url_alias', 'source', 'body'] },
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const items: any[] = data?.data || [];
    if (items.length === 0) return [];

    const results = items.map((r: any) => {
      const f = r.fields || {};
      const source = Array.isArray(f.source) ? f.source[0]?.name : f.source?.name;
      const body = String(f.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
      const date = f.date?.created || f.date?.original || '';
      return ds(
        String(r.id?.toString() || f.url_alias || Math.random()), 'reliefweb',
        `ReliefWeb — ${f.title || 'report'}`,
        `Humanitarian report${source ? ` by ${source}` : ''}${date ? ` (${String(date).slice(0, 10)})` : ''}. ${body}`,
        `https://reliefweb.int/report/${f.url_alias || r.id}`,
        source || 'ReliefWeb', { id: r.id, date, source },
      );
    });
    console.log(`[RELIEFWEB] ${results.length} reports`);
    return results;
  } catch (e: any) {
    console.error(`[RELIEFWEB] failed: ${e?.message}`);
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
    // e-Stat searchWord is a single-term substring match — extract the
    // most specific keyword rather than the raw multi-word query.
    const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'how', 'why', 'are', 'was', 'were', 'has', 'have', 'had', 'not', 'but', 'all', 'any', 'can', 'its', 'our', 'their', 'data', 'rate', 'rates', 'statistics', 'statistic', 'official', 'japan', 'japanese', 'country', 'world', 'global', 'current', 'latest', 'trend', 'trends']);
    const words = query.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter(t => t.length > 3 && !STOP.has(t));
    // e-Stat is slow (8-35s observed) and Japanese-first — lang=E for English metadata.
    // Try up to 3 keyword candidates in order until tables come back.
    const candidates = [...new Set(words)].slice(0, 3);
    if (candidates.length === 0) candidates.push(query);
    let tables: any[] = [];
    for (const searchWord of candidates) {
      const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList?appId=${env.ESTAT_JP_APP_ID}&searchWord=${encodeURIComponent(searchWord)}&lang=E&limit=${limit * 3}`;
      const data: any = await fetchFromProvider('estat-jp', url, { timeout: 60000, retries: 0 });
      const t = data?.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF;
      if (Array.isArray(t) ? t.length > 0 : t) { tables = Array.isArray(t) ? t : [t]; break; }
    }
    if (tables.length === 0) { console.log('[E-STAT-JP] 0 tables'); return []; }
    const seen = new Set<string>();
    const unique = (Array.isArray(tables) ? tables : [tables])
      .filter((t: any) => {
        const id = String(t['@id']);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    const val = (x: any) => (typeof x === 'object' && x !== null ? (x.$ ?? x._ ?? '') : x) || '';
    const results = unique.slice(0, limit).map((t: any) => ds(
      String(t['@id']), 'estat-jp',
      `e-Stat Japan — ${val(t.STATISTICS_NAME) || val(t.TITLE) || t['@id']}`,
      `Japanese official statistics table "${val(t.STATISTICS_NAME) || val(t.TITLE)}" (survey: ${t.SURVEY_DATE || 'n/a'}). Published by ${val(t.GOV_ORG) || 'Statistics Bureau of Japan'} (${val(t.MAIN_CATEGORY)} / ${val(t.SUB_CATEGORY)}) via e-Stat.`,
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
// OPEN-METEO — climate projections & weather (no key, CC BY 4.0)
// CMIP6 downscaled to ~10km, ERA5 reanalysis from 1940.
// ─────────────────────────────────────────────────────────────
const CLIMATE_GEOS: Record<string, { slug: string; lat: number; lon: number }> = {
  france: { slug: 'paris', lat: 48.85, lon: 2.35 },
  'united states': { slug: 'washington', lat: 38.9, lon: -77.0 }, usa: { slug: 'washington', lat: 38.9, lon: -77.0 },
  china: { slug: 'beijing', lat: 39.9, lon: 116.4 },
  germany: { slug: 'berlin', lat: 52.52, lon: 13.4 },
  'united kingdom': { slug: 'london', lat: 51.5, lon: -0.12 }, uk: { slug: 'london', lat: 51.5, lon: -0.12 },
  japan: { slug: 'tokyo', lat: 35.68, lon: 139.69 },
  india: { slug: 'new-delhi', lat: 28.61, lon: 77.21 },
  brazil: { slug: 'brasilia', lat: -15.79, lon: -47.88 },
  canada: { slug: 'ottawa', lat: 45.42, lon: -75.7 },
  italy: { slug: 'rome', lat: 41.9, lon: 12.5 },
  spain: { slug: 'madrid', lat: 40.42, lon: -3.7 },
  korea: { slug: 'seoul', lat: 37.57, lon: 126.98 }, 'south korea': { slug: 'seoul', lat: 37.57, lon: 126.98 },
  mexico: { slug: 'mexico-city', lat: 19.43, lon: -99.13 },
  turkey: { slug: 'ankara', lat: 39.93, lon: 32.85 },
  ukraine: { slug: 'kyiv', lat: 50.45, lon: 30.52 },
  indonesia: { slug: 'jakarta', lat: -6.21, lon: 106.85 },
  nigeria: { slug: 'abuja', lat: 9.06, lon: 7.49 },
  egypt: { slug: 'cairo', lat: 30.04, lon: 31.24 },
  pakistan: { slug: 'islamabad', lat: 33.68, lon: 73.04 },
  bangladesh: { slug: 'dhaka', lat: 23.81, lon: 90.41 },
  vietnam: { slug: 'hanoi', lat: 21.03, lon: 105.85 },
  poland: { slug: 'warsaw', lat: 52.23, lon: 21.01 },
  netherlands: { slug: 'amsterdam', lat: 52.37, lon: 4.9 },
  australia: { slug: 'canberra', lat: -35.28, lon: 149.13 },
  saudi: { slug: 'riyadh', lat: 24.71, lon: 46.68 }, 'saudi arabia': { slug: 'riyadh', lat: 24.71, lon: 46.68 },
};

async function fetchJson(url: string, timeout = 20000): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function searchOpenMeteo(query: string, limit = 4): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/climate|warming|temperature|weather|drought|precipitation|heat|flood|monsoon|storm|hurricane|typhoon|cyclone|temperature anomaly|degré|climat/.test(q)) return [];
  const geo = Object.entries(CLIMATE_GEOS).find(([name]) => q.includes(name));
  if (!geo) return [];
  const [country, g] = geo;
  const countryName = country[0].toUpperCase() + country.slice(1);
  try {
    // Two windows: reference decade (2010s) vs end-of-century (2040s)
    const win = async (s: string, e: string) => fetchJson(
      `https://climate-api.open-meteo.com/v1/climate?latitude=${g.lat}&longitude=${g.lon}` +
      `&start_date=${s}&end_date=${e}&daily=temperature_2m_mean,precipitation_sum&timezone=GMT`);
    const [past, future] = await Promise.all([
      win('2010-01-01', '2019-12-31'), win('2040-01-01', '2049-12-31'),
    ]);
    const mean = (arr: (number | null)[] | undefined) => {
      const v = (arr || []).filter((x): x is number => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const tPast = mean(past?.daily?.temperature_2m_mean);
    const tFut = mean(future?.daily?.temperature_2m_mean);
    const pPast = mean(past?.daily?.precipitation_sum);
    const pFut = mean(future?.daily?.precipitation_sum);
    if (tPast == null || tFut == null) return [];
    const deltaT = tFut - tPast;
    const deltaP = pPast && pFut != null ? ((pFut - pPast) / pPast) * 100 : null;
    return [ds(
      `climate-${g.slug}`, 'open-meteo',
      `Open-Meteo climate projection — ${countryName} (${g.slug})`,
      `CMIP6-downscaled (~10km) climate projection for ${countryName}: mean daily temperature ${tPast.toFixed(1)}°C (2010s) → ${tFut.toFixed(1)}°C (2040s), Δ${deltaT >= 0 ? '+' : ''}${deltaT.toFixed(1)}°C${deltaP != null ? `; mean daily precipitation ${deltaP >= 0 ? '+' : ''}${deltaP.toFixed(0)}%` : ''}. Source: Open-Meteo Climate API (CC BY 4.0).`,
      `https://open-meteo.com/en/docs/climate-api`,
      'Open-Meteo / CMIP6',
      { country: countryName, tPast, tFut, deltaT, deltaP },
    )];
  } catch (e: any) {
    console.error(`[OPEN-METEO] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// EMBER via World Power Monitor — electricity data (no key, CC BY 4.0)
// Annual + monthly generation/demand/emissions by country & fuel.
// ─────────────────────────────────────────────────────────────
const EMBER_SLUGS: Record<string, string> = {
  'united states': 'united-states', usa: 'united-states', us: 'united-states', america: 'united-states',
  china: 'china', germany: 'germany', france: 'france', 'united kingdom': 'united-kingdom',
  uk: 'united-kingdom', japan: 'japan', india: 'india', brazil: 'brazil', canada: 'canada',
  italy: 'italy', spain: 'spain', korea: 'south-korea', 'south korea': 'south-korea',
  mexico: 'mexico', turkey: 'turkey', ukraine: 'ukraine', indonesia: 'indonesia',
  nigeria: 'nigeria', egypt: 'egypt', pakistan: 'pakistan', bangladesh: 'bangladesh',
  vietnam: 'vietnam', poland: 'poland', netherlands: 'netherlands', australia: 'australia',
  'saudi arabia': 'saudi-arabia', saudi: 'saudi-arabia', argentina: 'argentina',
  'south africa': 'south-africa', thailand: 'thailand', iran: 'iran',
  'united arab emirates': 'united-arab-emirates', uae: 'united-arab-emirates',
  sweden: 'sweden', norway: 'norway', denmark: 'denmark', finland: 'finland',
};

const EMBER_RENEWABLES = ['hydro', 'solar', 'wind', 'bioenergy', 'other_renewables'];

export async function searchEmber(query: string, limit = 4): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/electricity|energy|power|grid|renewable|solar|wind|emission|carbon intensity|generation|kwh|électricité|énergie/.test(q)) return [];
  const slug = Object.entries(EMBER_SLUGS).find(([name]) => q.includes(name))?.[1];
  if (!slug) return [];
  const countryName = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  try {
    const d: any = await fetchJson(`https://worldpowermonitor.com/api/v1/countries/${slug}.json`, 25000);
    const a = d?.annual;
    if (!a?.years?.length) return [];
    const idx = a.years.length - 1;
    const year = a.years[idx];
    const gen = a.total_generation_twh?.[idx];
    const demand = a.demand_twh?.[idx];
    const intensity = a.carbon_intensity_gco2_kwh?.[idx];
    const co2 = a.total_emissions_mtco2?.[idx];
    if (gen == null) return [];
    const shares = a.share_pct || {};
    const renShare = EMBER_RENEWABLES.reduce((s: number, f: string) => s + Number(shares[f]?.[idx] || 0), 0);
    const topFuel = Object.entries(shares)
      .map(([f, arr]: [string, any]) => [f, Number((arr as any[])?.[idx] || 0)] as const)
      .sort((x, y) => y[1] - x[1])[0];
    return [ds(
      `ember-${slug}`, 'ember',
      `Ember electricity data — ${countryName} (${year})`,
      `Ember annual electricity data for ${countryName} (${year}): generation ${Number(gen).toLocaleString('en-US', { maximumFractionDigits: 1 })} TWh, demand ${Number(demand || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} TWh${intensity != null ? `, carbon intensity ${Number(intensity).toFixed(0)} gCO₂/kWh` : ''}${co2 != null ? `, power-sector emissions ${Number(co2).toFixed(1)} MtCO₂` : ''}. Renewable share ≈${renShare.toFixed(0)}%${topFuel ? `; largest source: ${topFuel[0]} (${topFuel[1].toFixed(0)}%)` : ''}. Source: Ember via World Power Monitor (CC BY 4.0).`,
      `https://worldpowermonitor.com/countries/${slug}/`,
      'Ember',
      { country: countryName, year, generationTwh: gen, demandTwh: demand, intensity, co2, renewableShare: renShare },
    )];
  } catch (e: any) {
    console.error(`[EMBER] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// COINGECKO — crypto market data (no key, public tier)
// ─────────────────────────────────────────────────────────────
export async function searchCrypto(query: string, limit = 5): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/crypto|bitcoin|btc|ethereum|eth|blockchain|token|defi|web3|cryptocurrency|stablecoin|altcoin/.test(q)) return [];
  try {
    const d: any = await fetchJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h', 20000);
    const coins: any[] = Array.isArray(d) ? d : [];
    if (coins.length === 0) return [];
    const results = coins.slice(0, limit).map((c: any) => {
      const chg = c.price_change_percentage_24h;
      return ds(
        String(c.id), 'coingecko',
        `CoinGecko — ${c.name} (${c.symbol?.toUpperCase()})`,
        `${c.name} (${c.symbol?.toUpperCase()}): $${Number(c.current_price).toLocaleString('en-US', { maximumFractionDigits: c.current_price < 1 ? 4 : 2 })}, 24h ${chg >= 0 ? '+' : ''}${Number(chg).toFixed(2)}%, market cap $${(Number(c.market_cap) / 1e9).toFixed(1)}B, rank #${c.market_cap_rank}. Source: CoinGecko API.`,
        `https://www.coingecko.com/en/coins/${c.id}`,
        'CoinGecko', { id: c.id, price: c.current_price, change24h: chg, marketCap: c.market_cap },
      );
    });
    console.log(`[COINGECKO] ${results.length} coins`);
    return results;
  } catch (e: any) {
    console.error(`[COINGECKO] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ECB via Frankfurter — official euro reference exchange rates (no key)
// ─────────────────────────────────────────────────────────────
export async function searchFXRates(query: string, limit = 3): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/exchange rate|forex|currency|fx\b|dollar|euro|yen|sterling|frankfurter|taux de change|devise/.test(q)) return [];
  try {
    const d: any = await fetchJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,JPY,GBP,CHF,CNY,CAD,AUD,INR,BRL,KRW,MXN,TRY,ZAR,SEK,NOK,DKK,PLN,CZK,HUF,RON,BGN,HRK,RUB,TRY,AED,SAR,SGD,HKD,TWD,THB,MYR,IDR,PHP,VND,EGP,NZD,ILS,CLP,COP,PEN,ARS,UAH', 20000);
    const rates = d?.rates || {};
    const entries = Object.entries(rates) as [string, number][];
    if (entries.length === 0) return [];
    const top = entries.slice(0, limit).map(([cur, rate]) => {
      const usdPerUnit = 1 / rate;
      return `${cur}: 1 USD = ${rate.toFixed(4)} ${cur}`;
    });
    return [ds(
      `fx-${d.date || 'latest'}`, 'frankfurter',
      `ECB/Frankfurter FX rates — USD base (${d.date || 'latest'})`,
      `European Central Bank euro foreign exchange reference rates via Frankfurter (${d.date || 'latest'}), USD base: ${top.join('; ')} (+${entries.length - top.length} more currencies). Source: Frankfurter API / ECB.`,
      'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
      'ECB / Frankfurter', { date: d.date, rates: d.rates },
    )];
  } catch (e: any) {
    console.error(`[FRANKFURTER] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// CELESTRAK — satellite orbital elements TLE (no key)
// ─────────────────────────────────────────────────────────────
const SAT_GROUPS: Record<string, { name: string; keywords: string[] }> = {
  stations: { name: 'ISS & crewed stations', keywords: ['iss', 'space station', 'crewed', 'orbit'] },
  weather: { name: 'Weather satellites', keywords: ['weather satellite', 'meteorological', 'noaa', 'eps'] },
  resource: { name: 'Earth resource satellites', keywords: ['earth observation', 'remote sensing', 'landsat', 'sentinel'] },
  geo: { name: 'Geostationary satellites', keywords: ['geostationary', 'geo', 'communications'] },
  starlink: { name: 'Starlink constellation', keywords: ['starlink', 'spacex', 'megaconstellation'] },
  gnss: { name: 'GNSS satellites', keywords: ['gps', 'gnss', 'navigation', 'galileo', 'glonass'] },
};

export async function searchSatellites(query: string, limit = 4): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/satellite|orbit|space|rocket|spacex|starlink|gps|galileo|nasa|iss\b|launch|payload/.test(q)) return [];
  const groups = Object.entries(SAT_GROUPS)
    .filter(([, g]) => g.keywords.some(k => q.includes(k)))
    .map(([id]) => id);
  const selected = groups.length ? groups : ['stations', 'weather', 'resource'];
  const results: any[] = [];
  for (const grp of selected.slice(0, limit)) {
    try {
      const text = await (await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${grp}&FORMAT=tle`, { signal: AbortSignal.timeout(20000) })).text();
      const lines = text.split('\n').filter(l => l.trim());
      const satCount = Math.floor(lines.length / 3);
      if (satCount === 0) continue;
      const meta = SAT_GROUPS[grp];
      results.push(ds(
        `tle-${grp}`, 'celestrak',
        `CelesTrak TLE — ${meta.name} (${satCount} objects)`,
        `NORAD two-line element sets for ${meta.name}: ${satCount} tracked objects with current orbital elements (epoch, inclination, eccentricity, mean motion). Source: CelesTrak public orbital data.`,
        `https://celestrak.org/NORAD/elements/gp.php?GROUP=${grp}&FORMAT=tle`,
        'CelesTrak / NORAD', { group: grp, objects: satCount },
      ));
    } catch { /* skip group */ }
  }
  if (results.length) console.log(`[CELESTRAK] ${results.length} satellite groups`);
  return results;
}

// ─────────────────────────────────────────────────────────────
// NAGER.DATE — public holidays worldwide (no key)
// ─────────────────────────────────────────────────────────────
const HOLIDAY_COUNTRIES: Record<string, string> = {
  france: 'FR', 'united states': 'US', usa: 'US', us: 'US', america: 'US',
  germany: 'DE', 'united kingdom': 'GB', uk: 'GB', britain: 'GB',
  japan: 'JP', china: 'CN', india: 'IN', brazil: 'BR', canada: 'CA',
  italy: 'IT', spain: 'ES', korea: 'KR', 'south korea': 'KR', mexico: 'MX',
  turkey: 'TR', ukraine: 'UA', indonesia: 'ID', nigeria: 'NG', egypt: 'EG',
  poland: 'PL', netherlands: 'NL', australia: 'AU', russia: 'RU',
  'saudi arabia': 'SA', saudi: 'SA', argentina: 'AR', 'south africa': 'ZA',
};

export async function searchHolidays(query: string, limit = 3): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/holiday|public holiday|vacation|jour férié|bank holiday|festiv|calendar|calendrier/.test(q)) return [];
  const country = Object.entries(HOLIDAY_COUNTRIES).find(([name]) => q.includes(name));
  if (!country) return [];
  const year = new Date().getFullYear();
  try {
    const d: any = await fetchJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country[1]}`, 15000);
    const days: any[] = Array.isArray(d) ? d : [];
    if (days.length === 0) return [];
    const upcoming = days.filter((h: any) => new Date(h.date) >= new Date()).slice(0, limit);
    const results = (upcoming.length ? upcoming : days.slice(0, limit)).map((h: any) => ds(
      `${country[1]}-${h.date}`, 'nager-date',
      `Public holiday — ${h.name} (${country[0]})`,
      `${h.name} — public holiday in ${country[0]} on ${h.date}${h.types ? ` (${h.types.join(', ')})` : ''}. Source: Nager.Date public holiday API.`,
      `https://date.nager.at/`,
      'Nager.Date', { date: h.date, name: h.name, country: country[1] },
    ));
    console.log(`[NAGER] ${results.length} holidays ${country[0]}`);
    return results;
  } catch (e: any) {
    console.error(`[NAGER] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// USGS — real-time earthquake feed (no key, public domain)
// ─────────────────────────────────────────────────────────────
export async function searchUSGS(query: string, limit = 6): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/earthquake|seismic|tremor|disaster|crisis|hazard|risk|catastroph|séisme|tectonique|volcan/.test(q)) return [];
  try {
    const data: any = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson', 20000);
    const feats: any[] = data?.features || [];
    if (feats.length === 0) return [];
    const qTerms = q.split(/[^a-zà-ÿ0-9]+/).filter(t => t.length > 4);
    const scored = feats.map((f: any) => {
      const p = f.properties || {};
      const place = String(p.place || '').toLowerCase();
      const score = qTerms.reduce((s, t) => s + (place.includes(t) ? 2 : 0), 0);
      return { f, score };
    }).sort((a, b) => b.score - a.score || (b.f.properties?.mag || 0) - (a.f.properties?.mag || 0));
    const results = scored.slice(0, limit).map(({ f }: any) => {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates || [];
      const mag = p.mag != null ? `M${Number(p.mag).toFixed(1)}` : 'M?';
      return ds(
        String(p.code || p.ids || Math.random()), 'usgs',
        `USGS earthquake — ${mag} near ${p.place || 'unknown'}`,
        `USGS earthquake ${mag} at ${p.place || 'unknown location'} on ${p.time ? new Date(p.time).toISOString().slice(0, 10) : 'recent'}${coords.length >= 3 ? ` (depth ${Number(coords[2]).toFixed(0)} km)` : ''}. ${p.alert ? `Alert level: ${p.alert}.` : ''} Source: USGS earthquake feed.`,
        p.url || 'https://earthquake.usgs.gov/earthquakes/',
        'US Geological Survey', { mag: p.mag, place: p.place, time: p.time, coords },
      );
    });
    console.log(`[USGS] ${results.length} earthquakes`);
    return results;
  } catch (e: any) {
    console.error(`[USGS] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// NASA POWER — agroclimatology point data (no key)
// Daily temp, precipitation, solar radiation, wind — agriculture &
// renewable siting. Uses same country→capital map as Open-Meteo.
// ─────────────────────────────────────────────────────────────
export async function searchNASAPower(query: string, limit = 3): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/agricultur|crop|farming|solar radiation|agro|irrigation|yield|farm|agriculture|agricole|rendement/.test(q)) return [];
  const geo = Object.entries(CLIMATE_GEOS).find(([name]) => q.includes(name));
  if (!geo) return [];
  const [country, g] = geo;
  const countryName = country[0].toUpperCase() + country.slice(1);
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 29 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,WS10M&community=RE&longitude=${g.lon}&latitude=${g.lat}&start=${fmt(start)}&end=${fmt(end)}&format=JSON`;
    const d: any = await fetchJson(url, 25000);
    const params = d?.properties?.parameter || {};
    const avg = (obj: any) => {
      // NASA POWER uses -999.0 as missing-data sentinel — exclude it
      const v = Object.values(obj || {}).filter((x): x is number => typeof x === 'number' && x > -900);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const t2m = avg(params.T2M);
    const precip = avg(params.PRECTOTCORR);       // mm/day
    const solar = avg(params.ALLSKY_SFC_SW_DWN); // kW-hr/m²/day
    const wind = avg(params.WS10M);               // m/s
    if (t2m == null) return [];
    return [ds(
      `nasa-power-${g.slug}`, 'nasa-power',
      `NASA POWER agroclimatology — ${countryName} (${g.slug})`,
      `NASA POWER daily observations (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}) for ${countryName}: mean 2m temperature ${t2m.toFixed(1)}°C, precipitation ${precip?.toFixed(1) ?? 'n/a'} mm/day, solar radiation ${solar?.toFixed(2) ?? 'n/a'} kWh/m²/day, 10m wind ${wind?.toFixed(1) ?? 'n/a'} m/s. Source: NASA POWER API.`,
      `https://power.larc.nasa.gov/data-access-viewer/`,
      'NASA POWER', { country: countryName, t2m, precip, solar, wind },
    )];
  } catch (e: any) {
    console.error(`[NASA-POWER] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// GLEIF — Legal Entity Identifier registry (no key)
// Verified corporate identity data for companies & orgs.
// ─────────────────────────────────────────────────────────────
export async function searchGLEIF(query: string, limit = 5): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/company|corporation|firm|enterprise|startup|société|entreprise|unicorn|company|brand|corporate/.test(q)) return [];
  // Extract candidate org names: capitalized multi-word sequences or quoted terms
  const quoted = q.match(/"([^"]+)"|'([^']+)'/);
  let term = '';
  if (quoted) term = (quoted[1] || quoted[2] || '').trim();
  if (!term) {
    const STOP = new Set(['the', 'this', 'that', 'when', 'what', 'how', 'why', 'for', 'and', 'but', 'with', 'from', 'into', 'over', 'after', 'before', 'between', 'during', 'according', 'however', 'therefore', 'thus', 'also', 'moreover', 'furthermore', 'nevertheless', 'nonetheless', 'whereas', 'while', 'although', 'though', 'since', 'because', 'if', 'unless', 'until', 'whether', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'some', 'many', 'most', 'other', 'another', 'such', 'same', 'different', 'new', 'old', 'first', 'last', 'next', 'previous', 'following', 'under', 'again', 'once', 'here', 'there', 'now', 'then', 'today', 'tomorrow', 'yesterday', 'currently', 'recently', 'finally', 'initially', 'originally', 'subsequently', 'eventually', 'meanwhile', 'instead', 'rather', 'quite', 'very', 'really', 'just', 'only', 'even', 'still', 'yet', 'already', 'always', 'never', 'often', 'sometimes', 'usually', 'about', 'around', 'approximately', 'exactly', 'generally', 'typically', 'normally', 'specifically']);
    const caps = query.match(/\b[A-Z][a-zA-Z&.'-]+(?:\s+[A-Z][a-zA-Z&.'-]+){0,3}\b/g) || [];
    term = caps.find(c => c.length > 3 && !STOP.has(c.split(/\s+/)[0].toLowerCase())) || '';
  }
  if (!term || term.length < 3) return [];
  try {
    const url = `https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D=${encodeURIComponent(term)}&page%5Bsize%5D=${limit * 2}`;
    const d: any = await fetchJson(url, 20000);
    const items: any[] = d?.data || [];
    // Prefer records whose legal name actually contains the search term
    const termLow = term.toLowerCase();
    items.sort((a: any, b: any) => {
      const an = String(a?.attributes?.entity?.legalName?.name || '').toLowerCase();
      const bn = String(b?.attributes?.entity?.legalName?.name || '').toLowerCase();
      return Number(bn.includes(termLow)) - Number(an.includes(termLow));
    });
    const results = items.slice(0, limit).map((r: any) => {
      const a = r.attributes || {};
      const ent = a.entity || {};
      const reg = a.registration || {};
      const lei = a.lei || r.id;
      return ds(
        String(lei), 'gleif',
        `GLEIF LEI — ${ent.legalName?.name || term}`,
        `Legal Entity Identifier record for "${ent.legalName?.name || term}" (LEI ${lei}): jurisdiction ${ent.jurisdiction || 'n/a'}, legal form ${ent.legalForm?.id || 'n/a'}, status ${reg.status || 'n/a'}. Verified corporate identity in the GLEIF golden copy.`,
        `https://search.gleif.org/#/record/${lei}`,
        'GLEIF', { lei, name: ent.legalName?.name, jurisdiction: ent.jurisdiction, status: reg.status },
      );
    });
    console.log(`[GLEIF] ${results.length} LEI records for "${term}"`);
    return results;
  } catch (e: any) {
    console.error(`[GLEIF] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// UNSD SDG API — official SDG indicators (no key)
// ─────────────────────────────────────────────────────────────
export async function searchUNSDG(query: string, limit = 4): Promise<any[]> {
  const q = query.toLowerCase();
  if (!/sdg|sustainable development|poverty|hunger|health|education|gender|water|energy access|inequality|climate action|peace|justice|industry|partnership|développement durable|objectif/.test(q)) return [];
  try {
    const list: any[] = await fetchJson('https://unstats.un.org/sdgapi/v1/sdg/Indicator/List', 25000);
    const terms = q.split(/[^a-zà-ÿ0-9.]+/).filter(t => t.length > 3);
    const matched = (Array.isArray(list) ? list : [])
      .map((ind: any) => {
        const text = `${ind.code || ''} ${ind.description || ''} ${ind.seriesDescription || ''}`.toLowerCase();
        const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
        return { ind, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 4); // many indicators lack world-level rows — try a wider pool
    if (matched.length === 0) return [];

    const results: any[] = [];
    for (const { ind } of matched) {
      if (results.length >= limit) break;
      try {
        const code = ind.code || ind.indicatorCode;
        const desc = ind.description || ind.seriesDescription || code;
        const d: any = await fetchJson(
          `https://unstats.un.org/sdgapi/v1/sdg/Indicator/Data?indicator=${encodeURIComponent(code)}&areaCode=001&timePeriodStart=${new Date().getFullYear() - 6}&pageSize=100`, 25000);
        const rows: any[] = d?.data || [];
        if (rows.length === 0) continue;
        // Latest period, most aggregated row (fewest dimensions)
        const latestPeriod = Math.max(...rows.map((r: any) => Number(r.timePeriodStart || 0)));
        const latest = rows
          .filter((r: any) => Number(r.timePeriodStart) === latestPeriod && r.value != null)
          .sort((a: any, b: any) => Object.keys(a.dimensions || {}).length - Object.keys(b.dimensions || {}).length)[0];
        if (!latest) continue;
        const dims = latest.dimensions ? ` (${Object.entries(latest.dimensions).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '';
        results.push(ds(
          `sdg-${code}`, 'un-sdg',
          `UN SDG — ${code}: ${String(desc).slice(0, 80)}`,
          `UN SDG indicator ${code} — ${desc}. Latest world value: ${latest.value} (${latest.attributes?.Units || 'see series'}${dims}), period ${latestPeriod}, series ${latest.series || ''}. Source: UN Statistics Division SDG API.`,
          `https://unstats.un.org/sdgs/unsdgs/`,
          'UN Statistics Division', { indicator: code, value: latest.value, period: latestPeriod, series: latest.series, source: latest.source },
        ));
      } catch { /* skip indicator */ }
    }
    console.log(`[UN-SDG] ${results.length} indicators with world values`);
    return results;
  } catch (e: any) {
    console.error(`[UN-SDG] failed: ${e?.message}`);
    return [];
  }
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
