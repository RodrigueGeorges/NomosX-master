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

import fs from 'node:fs';
import path from 'node:path';
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
// Verified against the live v2 API (2026-11): these variable dcids return
// observations; the nominal/real GDP dcids return empty byEntity.
const DC_VARIABLES: Record<string, { name: string; keywords: string[] }> = {
  'Count_Person':             { name: 'Population', keywords: ['population', 'demograph'] },
  'UnemploymentRate_Person':  { name: 'Unemployment rate', keywords: ['unemployment', 'labor', 'jobs', 'employment'] },
  'Median_Income_Person':     { name: 'Median income', keywords: ['income', 'wages', 'inequality'] },
  'LifeExpectancy_Person':    { name: 'Life expectancy', keywords: ['health', 'mortality', 'life expectancy'] },
  'Count_Death':              { name: 'Total deaths', keywords: ['mortality', 'deaths', 'health'] },
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
      // No date filter — returns full series; we take latest per entity.
      // `date=latest` silently returns empty byEntity; secret is required.
      const secret = env.DATACOMMONS_API_SECRET ? `&secret=${env.DATACOMMONS_API_SECRET}` : '';
      const url = `https://api.datacommons.org/v2/observation?key=${env.DATACOMMONS_API_KEY}${secret}&select=date&select=entity&select=value&select=variable&select=facet&variable.dcids=${varId}&${entities.map(e => `entity.dcids=${e}`).join('&')}`;
      const data: any = await fetchFromProvider('datacommons', url, { timeout: 15000, retries: 1 });
      // v2 response: byVariable[varId].byEntity[entityId].orderedFacets[facetId].observations[]
      // Each observation: { date, value } — entity comes from the byEntity key.
      const byEntity: Record<string, any> = data?.byVariable?.[varId]?.byEntity || {};
      const obs: any[] = [];
      for (const entityId of Object.keys(byEntity)) {
        const ent: any = byEntity[entityId];
        const facets = ent?.orderedFacets;
        const flist: any[] = Array.isArray(facets) ? facets : Object.values(facets || {});
        for (const f of flist) {
          for (const o of f?.observations || []) obs.push({ ...o, entity: o.entity || entityId });
        }
      }
      if (obs.length === 0) continue;
      // Latest observation per entity
      const byEntLatest = new Map<string, any>();
      for (const o of obs) {
        const e = String(o.entity || '');
        const cur = byEntLatest.get(e);
        if (!cur || String(o.date) > String(cur.date)) byEntLatest.set(e, o);
      }
      const latest = [...byEntLatest.values()].slice(0, 10);
      const lines = latest.slice(0, 10).map((o: any) =>
        `${String(o.entity || '').replace('country/', '') || 'world'} ${o.date}: ${Number(o.value).toLocaleString('en-US', { maximumFractionDigits: 1 })}`);
      results.push(ds(
        varId, 'datacommons',
        `Data Commons — ${meta.name}`,
        `Data Commons harmonized statistics "${meta.name}" — latest values: ${lines.join('; ')}. Sources harmonized from World Bank, UN, Eurostat, national offices.`,
        `https://datacommons.org/browser/${varId}`,
        'Data Commons', { variable: varId, values: latest },
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

// ─────────────────────────────────────────────────────────────
// EIA — US Energy Information Administration (EIA_API_KEY, free)
// v2 API: grid demand/generation, crude spot, natural gas spot.
// https://www.eia.gov/opendata/
// ─────────────────────────────────────────────────────────────
const EIA_SERIES_NAMES: Record<string, string> = {
  RBRTE: 'Brent crude', RWTC: 'WTI crude', RNGWHHD: 'Henry Hub natural gas',
};
const EIA_RESPONDENTS: Record<string, string> = {
  US48: 'US Lower 48', CISO: 'California ISO', ERCO: 'ERCOT (Texas)',
  MISO: 'MISO', NYIS: 'NYISO', PJM: 'PJM Interconnection',
  SPP: 'SPP', SWPP: 'SPP (Southwest)', NWPP: 'Northwest Power Pool',
  NEVP: 'Nevada Power', AZPS: 'Arizona Public Service', BPA: 'Bonneville Power',
  GLHB: 'Great Lakes Hydro', GVL: 'Gainesville Regional', SOCO: 'Southern Co',
  TAL: 'Tennessee Valley', TVP: 'Tennessee Valley', FPC: 'Florida Power & Light',
};

async function eiaFetch(route: string, params: string): Promise<any> {
  const key = env.EIA_API_KEY;
  if (!key) return { response: { data: [] } };
  const url = `https://api.eia.gov/v2/${route}/data/?api_key=${key}&${params}`;
  return fetchFromProvider('eia', url, { timeout: 20000, retries: 1 });
}

export async function searchEIA(query: string, limit = 4): Promise<any[]> {
  if (!env.EIA_API_KEY) {
    console.log('[EIA] skipped — EIA_API_KEY not set (free at api.eia.gov)');
    return [];
  }
  const q = query.toLowerCase();
  const wantsElec = /electric|grid|power demand|generation|blackout|load/.test(q);
  const wantsOil = /oil|crude|brent|wti|petroleum|gasoline|diesel/.test(q);
  const wantsGas = /gas|lng|henry hub|nat.?gas/.test(q);
  const generic = !wantsElec && !wantsOil && !wantsGas;
  const results: any[] = [];

  const push = (id: string, title: string, abstract: string, raw: any) =>
    results.push(ds(id, 'eia', title, abstract,
      `https://www.eia.gov/opendata/browser/${id}`, 'US Energy Information Administration', raw));

  try {
    if (wantsElec || generic) {
      const demand = await eiaFetch('electricity/rto/region-data',
        'frequency=hourly&data[0]=value&facets[respondent][]=US48&facets[type][]=D' +
        '&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=24');
      const rows: any[] = demand?.response?.data || [];
      if (rows.length) {
        const latest = rows[0];
        const avg = rows.reduce((s, r) => s + Number(r.value || 0), 0) / rows.length;
        push('us48-demand', `EIA — ${latest['respondent-name'] || 'US'} electricity demand (hourly)`,
          `Grid demand ${latest['type-name'] || 'demand'} latest hour ${latest.period}: ${Math.round(Number(latest.value)).toLocaleString()} ${latest['value-units'] || 'MWh'}; trailing-24h avg ${Math.round(avg).toLocaleString()}. Source: EIA RTO/region hourly.`,
          rows);
      }
      const gen = await eiaFetch('electricity/rto/region-data',
        'frequency=hourly&data[0]=value&facets[respondent][]=US48&facets[type][]=NG' +
        '&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=24');
      const grows: any[] = gen?.response?.data || [];
      if (grows.length) {
        const g = grows[0];
        push('us48-generation', `EIA — ${g['respondent-name'] || 'US'} net generation (hourly)`,
          `Net generation latest hour ${g.period}: ${Math.round(Number(g.value)).toLocaleString()} ${g['value-units'] || 'MWh'}. Per-fuel detail available via additional facets.`,
          grows);
      }
    }

    if (wantsOil || generic) {
      const oil = await eiaFetch('petroleum/pri/spt',
        'frequency=daily&data[0]=value&facets[series][]=RBRTE&facets[series][]=RWTC' +
        '&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=30');
      const orows: any[] = oil?.response?.data || [];
      const bySeries: Record<string, any[]> = {};
      for (const r of orows) (bySeries[r.series] ||= []).push(r);
      for (const [code, rs] of Object.entries(bySeries)) {
        const latest = rs[0];
        const prev = rs.find(r => r.period !== latest.period);
        const delta = prev ? ((Number(latest.value) - Number(prev.value)) / Number(prev.value) * 100).toFixed(1) : '?';
        push(`oil-${code.toLowerCase()}`, `EIA — ${EIA_SERIES_NAMES[code] || code} spot price (daily)`,
          `${EIA_SERIES_NAMES[code] || code}: $${Number(latest.value).toFixed(2)}/bbl on ${latest.period} (${delta}% vs prior session). Source: EIA spot prices.`,
          rs.slice(0, 14));
      }
    }

    if (wantsGas || generic) {
      const gas = await eiaFetch('natural-gas/pri/fut',
        'frequency=daily&data[0]=value&facets[series][]=RNGWHHD' +
        '&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=30');
      const grows2: any[] = gas?.response?.data || [];
      if (grows2.length) {
        const latest = grows2[0];
        const avg30 = grows2.reduce((s, r) => s + Number(r.value || 0), 0) / grows2.length;
        push('henry-hub', `EIA — ${latest['series-description'] || 'Henry Hub'} (daily)`,
          `${latest['series-description'] || 'Henry Hub natural gas'}: $${Number(latest.value).toFixed(2)}/MMBtu on ${latest.period}; 30-day avg $${avg30.toFixed(2)}. Source: EIA natural gas spot/futures.`,
          grows2);
      }
    }

    console.log(`[EIA] ${results.length} datasets (${wantsElec ? 'elec ' : ''}${wantsOil ? 'oil ' : ''}${wantsGas ? 'gas' : ''}${generic ? 'generic' : ''})`);
    return results.slice(0, limit);
  } catch (e: any) {
    console.error(`[EIA] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// V-DEM — Varieties of Democracy (github.com/vdeminstitute)
// Local extract from the official CSV (scripts/fetch-vdem.ts);
// CC BY-SA 4.0. No key — degrades to [] if extract missing.
// ─────────────────────────────────────────────────────────────
let vdemCache: any = null;
function loadVdem(): any {
  if (vdemCache !== null) return vdemCache;
  try {
    const p = path.join(process.cwd(), 'data', 'vdem-extract.json');
    vdemCache = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
  return vdemCache;
}

const VDEM_STOP = new Set(['the', 'and', 'for', 'with', 'from', 'index', 'score', 'data', 'dataset', 'vdem', 'varieties', 'democracy', 'latest', 'current', 'global', 'world', 'country', 'countries']);

export async function searchVdem(query: string, limit = 5): Promise<any[]> {
  const data = loadVdem();
  if (!data?.rows?.length) {
    console.log('[VDEM] skipped — data/vdem-extract.json missing (run scripts/fetch-vdem.ts)');
    return [];
  }
  const q = query.toLowerCase();
  const tokens = q.split(/[^a-zà-ÿ0-9]+/).filter(t => t.length > 2 && !VDEM_STOP.has(t));

  // Topic priors: map query themes to the V-Dem variables that measure them.
  const TOPIC_BONUS: Array<[RegExp, string[]]> = [
    [/corrupt/, ['v2x_corr', 'e_ti_cpi', 'e_wbgi_cce']],
    [/coup/, ['e_coups']],
    [/civil libert|freedom of|freedoms/, ['v2x_civlib', 'v2x_freexp', 'v2x_frassoc_thick']],
    [/gender|women/, ['v2x_gender']],
    [/rule of law|judicial/, ['v2x_rule', 'e_wbgi_rqe']],
    [/governance|government effectiveness|regulat/, ['e_wbgi_gee', 'e_wbgi_rle', 'e_wbgi_vae', 'e_wbgi_pve']],
    [/elect|suffrage|voting/, ['v2x_elecreg', 'v2x_suffr']],
    [/regime|authoritarian|autocra|populis/, ['v2x_regime', 'v2x_api', 'v2x_mpi', 'e_polity2']],
    [/democra|election|political freedom|backsliding/, ['v2x_polyarchy', 'v2x_libdem', 'v2x_partipdem', 'v2x_delibdem', 'v2x_egaldem']],
  ];
  const varScores: Array<{ code: string; label: string; score: number }> = [];
  for (const [code, label] of Object.entries(data.variables as Record<string, string>)) {
    const hay = `${code} ${label}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += t.length > 4 ? 3 : 1;
    }
    for (const [re, codes] of TOPIC_BONUS) {
      if (re.test(q) && codes.includes(code)) score += 3;
    }
    if (score > 0) varScores.push({ code, label, score });
  }
  varScores.sort((a, b) => b.score - a.score);
  const picked = varScores.slice(0, 5);
  if (!picked.length) return [];

  const cols: string[] = data.columns;
  const vidx = new Map(picked.map((p, i) => [p.code, cols.indexOf(p.code)]));

  // Country filter: query tokens matching country names.
  const wanted = new Set(
    data.rows
      .filter((r: any[]) => r[2] === Math.max(...data.rows.map((x: any[]) => x[2])) && tokens.some(t => String(r[0]).toLowerCase().includes(t)))
      .map((r: any[]) => r[1] as string),
  );

  const results: any[] = [];
  for (const p of picked) {
    const ci = vidx.get(p.code)!;
    // Latest year that actually has data for this variable (sparse vars
    // like e_coups are null in most recent years).
    let latestYearV = -1;
    for (const r of data.rows) {
      if (r[ci] != null && Number.isFinite(r[ci]) && r[2] > latestYearV) latestYearV = r[2];
    }
    if (latestYearV < 0) continue;
    let pool = data.rows.filter((r: any[]) => r[2] === latestYearV && r[ci] != null);
    if (wanted.size) {
      const wp = pool.filter((r: any[]) => wanted.has(r[1]));
      if (wp.length) pool = wp;
    }
    const vals: Array<{ name: string; v: number }> = pool
      .map((r: any[]) => ({ name: r[0] as string, v: r[ci] as number | null }))
      .filter((x: any): x is { name: string; v: number } => x.v != null && Number.isFinite(x.v))
      .sort((a: { name: string; v: number }, b: { name: string; v: number }) => b.v - a.v);
    if (!vals.length) continue;
    const mean = vals.reduce((s: number, x) => s + x.v, 0) / vals.length;
    const top = vals.slice(0, 4).map((x: any) => `${x.name} ${x.v.toFixed(2)}`).join(', ');
    const bottom = vals.slice(-3).map((x: any) => `${x.name} ${x.v.toFixed(2)}`).join(', ');
    const scope = wanted.size ? `for ${[...wanted].length} matched ${wanted.size > 1 ? 'countries' : 'country'}` : `across ${vals.length} countries`;
    results.push(ds(
      p.code, 'vdem',
      `V-Dem — ${p.label}`,
      `Varieties of Democracy ${p.label} (${latestYearV}, ${scope}): mean ${mean.toFixed(2)}. Highest: ${top}. Lowest: ${bottom}. Source: V-Dem Country-Year dataset (CC BY-SA 4.0).`,
      'https://www.v-dem.net/data/the-v-dem-dataset/',
      'Varieties of Democracy (V-Dem) Institute',
      { variable: p.code, year: latestYearV, values: vals.slice(0, 25) },
    ));
    if (results.length >= limit) break;
  }
  console.log(`[VDEM] ${results.length} indicator datasets (${picked.length} vars matched)`);
  return results;
}

// ─────────────────────────────────────────────────────────────
// OPENAQ — global air quality monitoring (OPENAQ_API_KEY, free tier)
// https://docs.openaq.org — v3 API, X-API-Key header.
// ─────────────────────────────────────────────────────────────
const OPENAQ_PARAMS: Record<string, { id: number; label: string; who?: string }> = {
  pm25: { id: 2, label: 'PM2.5', who: 'WHO 24h guideline 15 µg/m³' },
  pm10: { id: 1, label: 'PM10' },
  no2: { id: 5, label: 'NO2' },
  o3: { id: 3, label: 'Ozone O3' },
};
let openaqCountries: any[] | null = null;

async function openaqFetch(pathname: string): Promise<any> {
  const key = env.OPENAQ_API_KEY;
  if (!key) return null;
  return fetchFromProvider('openaq', `https://api.openaq.org/v3${pathname}`, {
    headers: { 'X-API-Key': key }, timeout: 20000, retries: 1,
  });
}

export async function searchOpenAQ(query: string, limit = 4): Promise<any[]> {
  if (!env.OPENAQ_API_KEY) {
    console.log('[OPENAQ] skipped — OPENAQ_API_KEY not set (free at docs.openaq.org)');
    return [];
  }
  const q = query.toLowerCase();
  const wantsAir = /air quality|pollution|pm2\.5|pm10|smog|aqi|particulate|openaq|no2|nitrogen|ozone|wildfire smoke|dust|emission/.test(q);
  if (!wantsAir && !/openaq/.test(q)) return [];

  // Pollutant selection.
  let paramKey = 'pm25';
  if (/pm10/.test(q)) paramKey = 'pm10';
  else if (/no2|nitrogen/.test(q)) paramKey = 'no2';
  else if (/ozone|\bo3\b/.test(q)) paramKey = 'o3';
  const param = OPENAQ_PARAMS[paramKey];

  try {
    // Country match from the cached countries list.
    if (!openaqCountries) {
      const cj: any = await openaqFetch('/countries?limit=300');
      openaqCountries = cj?.results || [];
    }
    const tokens = q.split(/[^a-zà-ÿ]+/).filter(t => t.length > 3);
    const country = (openaqCountries || []).find((c: any) =>
      tokens.some(t => String(c.name).toLowerCase().includes(t)) ||
      tokens.includes(String(c.code).toLowerCase()));

    if (!country) {
      // Global coverage snapshot.
      const lj: any = await openaqFetch(`/locations?parameters_id=${param.id}&limit=1`);
      const found = lj?.meta?.found;
      if (found == null) return [];
      return [ds(
        `global-${paramKey}`, 'openaq',
        `OpenAQ — global ${param.label} monitoring network`,
        `OpenAQ aggregates ${found} air-quality monitoring locations reporting ${param.label} (${param.label} ${OPENAQ_PARAMS[paramKey].who ? `— ${OPENAQ_PARAMS[paramKey].who}. ` : ''}Source: OpenAQ v3, real-time station network).`,
        'https://explore.openaq.org', 'OpenAQ', lj.meta,
      )];
    }

    // Freshest monitoring locations in that country.
    const lj: any = await openaqFetch(
      `/locations?countries_id=${country.id}&parameters_id=${param.id}&limit=12`);
    const locs: any[] = (lj?.results || [])
      .filter((l: any) => l.isMonitor !== false)
      .sort((a: any, b: any) => String(b.datetimeLast || '').localeCompare(String(a.datetimeLast || '')))
      .slice(0, 5);
    if (!locs.length) return [];

    const readings: any[] = [];
    for (const loc of locs) {
      const sensor = (loc.sensors || []).find((s: any) => s.parameter?.id === param.id);
      if (!sensor) continue;
      const mj: any = await openaqFetch(`/locations/${loc.id}/latest`);
      const rec = (mj?.results || []).find((r: any) => r.sensorsId === sensor.id && r.value != null);
      if (rec) {
        readings.push({
          station: loc.name, value: rec.value,
          when: rec.datetime?.utc, units: 'µg/m³',
        });
      }
    }
    if (!readings.length) return [];
    // Freshness check — OpenAQ stations vary wildly in reporting recency.
    const now = Date.now();
    const freshest = Math.max(...readings.map(r => Date.parse(r.when || 0) || 0));
    const ageDays = freshest ? Math.floor((now - freshest) / 86400000) : null;
    const staleNote = ageDays != null && ageDays > 45
      ? ` NOTE: freshest station reading is ${ageDays} days old — treat as stale.`
      : '';
    const vals = readings.map(r => r.value);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const worst = readings.reduce((a, b) => (b.value > a.value ? b : a));
    const whoTxt = param.who ? ` ${param.who}.` : '';
    const stationTxt = readings.slice(0, 4).map(r => `${r.station}: ${r.value} µg/m³`).join('; ');

    return [ds(
      `${paramKey}-${country.code.toLowerCase()}`, 'openaq',
      `OpenAQ — ${param.label} air quality in ${country.name}`,
      `${param.label} monitoring in ${country.name}: ${readings.length} stations reporting, avg ${avg.toFixed(1)} µg/m³, highest ${worst.station} at ${worst.value} µg/m³ (${worst.when?.slice(0, 10)}).${whoTxt}${staleNote} Stations: ${stationTxt}. Source: OpenAQ v3 monitoring network.`,
      `https://explore.openaq.org/?countries=${country.code}`,
      'OpenAQ', { country: country.name, readings },
    )];
  } catch (e: any) {
    console.error(`[OPENAQ] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// WIKIDATA — entity knowledge graph (keyless wbsearchentities)
// ─────────────────────────────────────────────────────────────
export async function searchWikidata(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}` +
      `&language=en&format=json&limit=${Math.min(limit, 10)}&type=item`;
    const data: any = await fetchFromProvider('wikidata', url, { timeout: 20000, retries: 1 });
    const entities: any[] = data?.search || [];
    return entities.slice(0, limit).map((e: any) => ({
      ...ds(
        String(e.id), 'wikidata',
        `Wikidata — ${e.label || e.id}`,
        `${e.description || 'Wikidata entity'} (${e.id}). ${e.concepturi || ''}`.trim(),
        `https://www.wikidata.org/wiki/${e.id}`,
        'Wikidata community', e,
      ),
      type: 'reference',
    }));
  } catch (e: any) {
    console.error(`[WIKIDATA] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// GBIF — Global Biodiversity Information Facility (keyless)
// ─────────────────────────────────────────────────────────────
export async function searchGBIF(query: string, limit = 5): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(q)}`;
    const m: any = await fetchFromProvider('gbif', url, { timeout: 20000, retries: 1 });
    if (!m?.usageKey) return [];
    const occ: any = await fetchFromProvider('gbif',
      `https://api.gbif.org/v1/occurrence/search?taxon_key=${m.usageKey}&limit=0`,
      { timeout: 20000, retries: 1 });
    const count = occ?.count ?? null;
    return [ds(
      String(m.usageKey), 'gbif',
      `GBIF — ${m.scientificName || q} (${m.rank || 'species'})`,
      `GBIF backbone match: ${m.scientificName} (${m.rank}), ${count != null ? `${count.toLocaleString()} occurrence records` : 'occurrence data available'} in the Global Biodiversity Information Facility. Source: GBIF.org API.`,
      `https://www.gbif.org/species/${m.usageKey}`,
      'GBIF', { match: m, occurrenceCount: count },
    )];
  } catch (e: any) {
    console.error(`[GBIF] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// OPENSTREETMAP Taginfo — global tag usage counts (keyless, fast)
// https://taginfo.openstreetmap.org/api/4 — counts how many
// features carry a tag worldwide (infrastructure footprint stats).
// ─────────────────────────────────────────────────────────────
const OSM_TAGS: Record<string, { key: string; value: string; label: string }> = {
  datacenter: { key: 'building', value: 'data_center', label: 'data centers' },
  solar: { key: 'generator:source', value: 'solar', label: 'solar power installations' },
  wind: { key: 'generator:source', value: 'wind', label: 'wind power installations' },
  hydro: { key: 'generator:source', value: 'hydro', label: 'hydro power installations' },
  port: { key: 'landuse', value: 'harbour', label: 'harbours/ports' },
  refinery: { key: 'industrial', value: 'refinery', label: 'oil refineries' },
  quarry: { key: 'landuse', value: 'quarry', label: 'quarries/mines' },
  dam: { key: 'waterway', value: 'dam', label: 'dams' },
  airport: { key: 'aeroway', value: 'aerodrome', label: 'airports' },
  powerplant: { key: 'power', value: 'plant', label: 'power plants' },
  substation: { key: 'power', value: 'substation', label: 'grid substations' },
  charging: { key: 'amenity', value: 'charging_station', label: 'EV charging stations' },
};

export async function searchOSM(query: string, limit = 4): Promise<any[]> {
  try {
    const q = query.toLowerCase();
    const picked = Object.keys(OSM_TAGS).filter(k =>
      q.includes(k.replace(/_/g, ' ')) || q.includes(k));
    const themes = picked.length ? picked : ['datacenter'];
    const results: any[] = [];
    for (const key of themes.slice(0, limit)) {
      const t = OSM_TAGS[key];
      const data: any = await fetchFromProvider('osm-taginfo',
        `https://taginfo.openstreetmap.org/api/4/tag/stats?key=${encodeURIComponent(t.key)}` +
        `&value=${encodeURIComponent(t.value)}`,
        { timeout: 15000, retries: 1, headers: { 'User-Agent': 'NomosX-research/1.0' } });
      const count = (data?.data || []).find((d: any) => d.type === 'all')?.count
        ?? (data?.data || [])[0]?.count;
      if (count == null) continue;
      results.push(ds(
        `osm-${key}`, 'osm-taginfo',
        `OpenStreetMap — ${count.toLocaleString()} ${t.label} mapped`,
        `OpenStreetMap tag usage: ${count.toLocaleString()} features tagged ${t.key}=${t.value} worldwide (${t.label}). Volunteered geographic data — coverage varies by region. Source: taginfo.openstreetmap.org.`,
        `https://taginfo.openstreetmap.org/keys/${encodeURIComponent(t.key)}/values?filter=${encodeURIComponent(t.value)}`,
        'OpenStreetMap community', { count, key: t.key, value: t.value },
      ));
    }
    console.log(`[OSM-TAGINFO] ${results.length} tag counts`);
    return results;
  } catch (e: any) {
    console.error(`[OSM-TAGINFO] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// OPENSANCTIONS — sanctions/PEP watchlist search (OPENSANCTIONS_API_KEY)
// Credit-metered API; graceful [] without key. Free keys for
// public-interest research: opensanctions.org/docs/commercial/exemption
// ─────────────────────────────────────────────────────────────
export async function searchOpenSanctions(query: string, limit = 6): Promise<any[]> {
  if (!env.OPENSANCTIONS_API_KEY) {
    console.log('[OPENSANCTIONS] skipped — OPENSANCTIONS_API_KEY not set');
    return [];
  }
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.opensanctions.org/search/default?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}`;
    const data: any = await fetchFromProvider('opensanctions', url, {
      headers: { Authorization: `ApiKey ${env.OPENSANCTIONS_API_KEY}` },
      timeout: 20000, retries: 1,
    });
    const results = data?.results || [];
    return results.slice(0, limit).map((e: any, i: number) => {
      const caption = e.caption || e.schema || 'Entity';
      const datasets = (e.datasets || []).slice(0, 4).join(', ');
      const props = e.properties || {};
      const countries = (props.country || props.countries || []).slice?.(0, 3).join(', ') || '';
      const topics = (e.topics || e.risk_topics || []).slice?.(0, 4).join(', ') || '';
      const programs = (props.program || props.programs || []).slice?.(0, 3).join(', ') || '';
      const bits = [
        props.birthDate ? `born ${[].concat(props.birthDate)[0]}` : null,
        countries ? `countries: ${countries}` : null,
        topics ? `topics: ${topics}` : null,
        programs ? `programs: ${programs}` : null,
        datasets ? `lists: ${datasets}` : null,
      ].filter(Boolean).join(' | ');
      return {
        ...ds(
          String(e.id || `os-${i}`), 'opensanctions',
          `OpenSanctions — ${caption}`,
          `${e.schema || 'entity'} on OpenSanctions watchlists. ${bits}. Source: OpenSanctions consolidated sanctions/PEP database.`,
          `https://www.opensanctions.org/entities/${e.id}/`,
          'OpenSanctions (AML/CTF data cooperative)', e,
        ),
        type: 'dataset',
      };
    });
  } catch (e: any) {
    console.error(`[OPENSANCTIONS] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// UK LEGISLATION — legislation.gov.uk (keyless Atom search + XML)
// UK Acts, SIs, retained EU law — official revised versions.
// ─────────────────────────────────────────────────────────────
export async function searchUKLegislation(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://www.legislation.gov.uk/all?title=${encodeURIComponent(q)}` +
      `&limit=${Math.min(limit, 10)}&view=atom`;
    const res = await fetch(url, {
      headers: { Accept: 'application/atom+xml', 'User-Agent': 'NomosX-research/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    const xml: string = await res.text();
    if (typeof xml !== 'string' || !xml.includes('<entry')) return [];
    const entries = xml.split('<entry>').slice(1);
    const results: any[] = [];
    const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    for (const e of entries.slice(0, limit)) {
      const block = e.split('</entry>')[0];
      const titleM = block.match(/<title>([\s\S]*?)<\/title>/);
      const linkM = block.match(/<link[^>]+href="([^"]+)"/);
      const updM = block.match(/<updated>([\s\S]*?)<\/updated>/);
      const sumM = block.match(/<summary>([\s\S]*?)<\/summary>/);
      const title = strip(titleM?.[1] || 'UK legislation');
      const href = linkM?.[1] || '';
      const year = updM?.[1] ? Number(String(updM[1]).slice(0, 4)) : null;
      results.push({
        ...ds(
          href || title, 'uk-legislation',
          `UK Legislation — ${title}`,
          `${strip(sumM?.[1] || '') || 'Official UK legislation record'}${updM?.[1] ? ` (updated ${updM[1].slice(0, 10)})` : ''}. Source: legislation.gov.uk — authoritative revised text.`,
          href.startsWith('http') ? href : `https://www.legislation.gov.uk${href}`,
          'The National Archives (UK)', block,
        ),
        year,
      });
    }
    console.log(`[UK-LEG] ${results.length} instruments`);
    return results;
  } catch (e: any) {
    console.error(`[UK-LEG] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// OPENSANCTIONS /match — entity screening with match scores.
// Credit-metered: call deliberately (diligence gates, scripts),
// NOT wired into scout. 1 op ≈ 1 credit.
// ─────────────────────────────────────────────────────────────
export interface OSMatchResult {
  id: string; caption: string; schema: string;
  score: number; match: boolean; datasets: string[];
  properties: Record<string, any>;
}
export async function matchOpenSanctions(
  name: string,
  opts: { schema?: 'Person' | 'Company' | string; country?: string; limit?: number } = {},
): Promise<OSMatchResult[]> {
  const key = env.OPENSANCTIONS_API_KEY;
  if (!key) {
    console.log('[OPENSANCTIONS-MATCH] skipped — OPENSANCTIONS_API_KEY not set');
    return [];
  }
  const schema = opts.schema || (/^(mr|mrs|ms|dr)\b|^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name) && name.split(' ').length <= 3 ? 'Person' : 'Company');
  const body = {
    queries: {
      q: {
        schema,
        properties: {
          name: [name],
          ...(opts.country ? { country: [opts.country] } : {}),
        },
      },
    },
    limit: opts.limit ?? 5,
  };
  const res = await fetch('https://api.opensanctions.org/match/default', {
    method: 'POST',
    headers: {
      Authorization: `ApiKey ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    console.error(`[OPENSANCTIONS-MATCH] HTTP ${res.status}`);
    return [];
  }
  const data: any = await res.json();
  const results: any[] = data?.responses?.q?.results || [];
  return results.map((r: any) => ({
    id: r.id,
    caption: r.caption,
    schema: r.schema,
    score: r.score,
    match: !!r.match,
    datasets: r.datasets || [],
    properties: r.properties || {},
  }));
}

// ─────────────────────────────────────────────────────────────
// OPENFDA — FDA open data (drugs, devices, food, cosmetics; keyless)
// ─────────────────────────────────────────────────────────────
const FDA_ENDPOINTS: Record<string, { path: string; label: string }> = {
  drug: { path: 'drug/event.json', label: 'drug adverse events (FAERS)' },
  label: { path: 'drug/label.json', label: 'drug labels' },
  device: { path: 'device/event.json', label: 'device adverse events' },
  food: { path: 'food/enforcement.json', label: 'food enforcement reports' },
  recall: { path: 'drug/enforcement.json', label: 'drug enforcement/recalls' },
};
export async function searchOpenFDA(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    let key = 'drug';
    if (/label|prescription|package insert/.test(ql)) key = 'label';
    else if (/device|pacemaker|implant|medical device/.test(ql)) key = 'device';
    else if (/food|contaminat|recall|outbreak/.test(ql)) key = /recall/.test(ql) ? 'recall' : 'food';
    const ep = FDA_ENDPOINTS[key];
    const url = `https://api.fda.gov/${ep.path}?search=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}`;
    const data: any = await fetchFromProvider('openfda', url, { timeout: 20000, retries: 1 });
    const results = data?.results || [];
    return results.slice(0, limit).map((r: any, i: number) => {
      const title = r.product_description || r.brand_name || r.device_name || r.reason_for_recall || r.openfda?.generic_name?.[0] || 'FDA record';
      const date = r.receipt_date || r.report_date || r.effective_time || r.fda_report_date || '';
      const firm = r.applicant || r.manufacturer_name || r.recalling_firm || r.company_name || '';
      return {
        ...ds(String(r._id || `fda-${i}`), 'openfda',
          `openFDA — ${String(title).slice(0, 160)}`,
          `${ep.label}${date ? ` (${date})` : ''}${firm ? ` — ${firm}` : ''}. Source: FDA openFDA ${ep.path}.`,
          `https://open.fda.gov/apis/${ep.path.split('/')[0]}/${ep.path.split('/')[1]}/`,
          'US Food & Drug Administration', r),
        year: date ? Number(String(date).slice(0, 4)) || null : null,
      };
    });
  } catch (e: any) {
    console.error(`[OPENFDA] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// DEFILLAMA — DeFi/crypto analytics (keyless free tier)
// ─────────────────────────────────────────────────────────────
export async function searchDeFiLlama(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // /protocols is ~5MB — fetchFromProvider caps bytes, use direct fetch
    const res = await fetch('https://api.llama.fi/protocols',
      { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const protos: any[] = await res.json();
    const terms = q.split(/[^a-z0-9]+/).filter(t => t.length > 2);
    const hits = protos
      .map((p: any) => {
        const name = String(p.name || '').toLowerCase();
        const sym = String(p.symbol || '').toLowerCase();
        const cat = String(p.category || '').toLowerCase();
        const score = terms.reduce((s, t) => s + (name.includes(t) ? 2 : 0) + (sym === t ? 3 : 0) + (cat.includes(t) ? 1 : 0), 0);
        return { p, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return hits.map(({ p }, i) => ({
      ...ds(String(p.id || p.slug || i), 'defillama',
        `DeFiLlama — ${p.name}`,
        `${p.name} (${p.symbol || 'n/a'}) — ${p.category || 'DeFi'}, chains: ${(p.chains || []).slice(0, 5).join(', ')}. TVL: $${(Number(p.tvl) / 1e9).toFixed(2)}B, 1d ${p.change_1d?.toFixed(2) ?? '?'}%, 7d ${p.change_7d?.toFixed(2) ?? '?'}%. Source: DefiLlama API.`,
        `https://defillama.com/protocol/${p.slug || p.id}`,
        'DefiLlama', p),
    }));
  } catch (e: any) {
    console.error(`[DEFILLAMA] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// CISA KEV — Known Exploited Vulnerabilities (keyless JSON feed)
// ─────────────────────────────────────────────────────────────
let kevCache: any[] | null = null;
export async function searchCISAKEV(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    if (!kevCache) {
      const data: any = await fetchFromProvider('cisa-kev',
        'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
        { timeout: 30000, retries: 1 });
      kevCache = data?.vulnerabilities || [];
    }
    const ql = q.toLowerCase();
    const hits = (kevCache || []).filter((v: any) =>
      String(v.cveID).toLowerCase().includes(ql) ||
      String(v.vendorProject).toLowerCase().includes(ql) ||
      String(v.product).toLowerCase().includes(ql) ||
      String(v.vulnerabilityName).toLowerCase().includes(ql));
    return hits.slice(0, limit).map((v: any) => ({
      ...ds(String(v.cveID), 'cisa-kev',
        `CISA KEV — ${v.cveID}: ${v.vulnerabilityName}`,
        `Known exploited vulnerability: ${v.vendorProject} ${v.product} — ${v.vulnerabilityName}. Added ${v.dateAdded}, due ${v.dueDate}. Required action: ${String(v.requiredAction || '').slice(0, 200)}. Source: CISA KEV catalog.`,
        `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${encodeURIComponent(v.cveID)}`,
        'CISA', v),
      year: v.dateAdded ? Number(String(v.dateAdded).slice(0, 4)) : null,
    }));
  } catch (e: any) {
    console.error(`[CISA-KEV] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// FIRST EPSS — exploit prediction scores (keyless)
// ─────────────────────────────────────────────────────────────
export async function searchEPSS(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const isCve = /^CVE-\d{4}-\d+/i.test(q);
    const url = isCve
      ? `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(q)}&pretty=false`
      : `https://api.first.org/data/v1/epss?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}`;
    const data: any = await fetchFromProvider('first-epss', url, { timeout: 20000, retries: 1 });
    const rows: any[] = data?.data || [];
    return rows.slice(0, limit).map((r: any) => ({
      ...ds(String(r.cve), 'first-epss',
        `EPSS — ${r.cve}: ${(Number(r.epss) * 100).toFixed(1)}% exploitation probability`,
        `FIRST EPSS score for ${r.cve}: ${(Number(r.epss) * 100).toFixed(2)}% probability of exploitation in the next 30 days (percentile ${(Number(r.percentile) * 100).toFixed(0)}). Source: FIRST.org EPSS.`,
        `https://www.first.org/epss/${r.cve}`,
        'Forum of Incident Response and Security Teams', r),
    }));
  } catch (e: any) {
    console.error(`[EPSS] failed: ${e?.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// OSV — Open Source Vulnerabilities (keyless, Google)
// ─────────────────────────────────────────────────────────────
const OSV_ECOSYSTEMS: Record<string, string> = {
  npm: 'npm', pypi: 'PyPI', python: 'PyPI', pip: 'PyPI',
  go: 'Go', golang: 'Go', rust: 'crates.io', cargo: 'crates.io',
  maven: 'Maven', java: 'Maven', nuget: '.NET',
  rubygems: 'RubyGems', gem: 'RubyGems', composer: 'Packagist', php: 'Packagist',
};
export async function searchOSV(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    const eco = Object.entries(OSV_ECOSYSTEMS).find(([k]) => ql.includes(k))?.[1];
    const pkg = q.replace(/[^a-zA-Z0-9@/_.-]/g, ' ').trim().split(/\s+/)[0];
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: pkg, ecosystem: eco || 'npm' },
        version: undefined,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const vulns: any[] = data?.vulns || [];
    return vulns.slice(0, limit).map((v: any) => ({
      ...ds(String(v.id), 'osv',
        `OSV — ${v.id}: ${v.summary || 'vulnerability'}`,
        `${v.summary || v.id} affecting ${eco || 'npm'} package "${pkg}". Aliases: ${(v.aliases || []).slice(0, 4).join(', ') || 'none'}. Published: ${v.published || '?'}. Source: OSV.dev.`,
        `https://osv.dev/vulnerability/${v.id}`,
        'Open Source Vulnerabilities (Google)', v),
      year: v.published ? Number(String(v.published).slice(0, 4)) : null,
    }));
  } catch (e: any) {
    console.error(`[OSV] failed: ${e?.message}`);
    return [];
  }
}

// JPL SBDB — asteroid/comet data (keyless)
export async function searchSBDB(query: string, limit = 5): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(q)}`;
    const data: any = await fetchFromProvider('jpl-sbdb', url, { timeout: 20000, retries: 1 });
    const obj = data?.object;
    if (!obj) return [];
    const orbit = data.orbit || {};
    const phys = data.phys_par || {};
    return [{
      ...ds(String(obj.spk || obj.fullname), 'jpl-sbdb',
        `JPL SBDB — ${obj.fullname}`,
        `${obj.fullname} — NEO: ${obj.neo ? 'yes' : 'no'}, PHA: ${obj.pha ? 'yes' : 'no'}, class: ${obj.orbit_class?.name || '?'}. MOID: ${orbit.moid || '?'} AU, data arc: ${orbit.data_arc ? (orbit.data_arc / 365.25).toFixed(1) + ' yrs' : '?'}, n_obs: ${orbit.n_obs_used || '?'}.${phys.diameter ? ` Diameter ~${phys.diameter.toFixed(2)} km.` : ''} Source: JPL SBDB.`,
        `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html`,
        'NASA/JPL CNEOS', data),
    }];
  } catch (e: any) {
    console.error(`[SBDB] failed: ${e?.message}`);
    return [];
  }
}

// SAFCAST — crowdsourced radiation monitoring (keyless, CC0)
export async function searchSafecast(query: string, limit = 5): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.safecast.org/measurements.json?limit=${Math.min(limit, 10)}`;
    const data: any = await fetchFromProvider('safecast', url, { timeout: 20000, retries: 1 });
    const rows: any[] = Array.isArray(data) ? data : (data?.results || data?.data || []);
    return rows.slice(0, limit).map((r: any, i: number) => ({
      ...ds(String(r.id || `sf-${i}`), 'safecast',
        `Safecast — radiation ${r.value != null ? `${Number(r.value).toFixed(2)} µSv/h` : ''} @ ${r.address || `${r.latitude},${r.longitude}`}`,
        `Safecast citizen-science radiation measurement${r.captured_at ? ` (${r.captured_at})` : ''}${r.device_id ? `, device ${r.device_id}` : ''}${r.location_name ? `, ${r.location_name}` : ''}. CC0 global dataset — 200M+ measurements. Source: Safecast API.`,
        'https://safecast.org/', 'Safecast', r),
    }));
  } catch (e: any) {
    console.error(`[SAFECAST] failed: ${e?.message}`);
    return [];
  }
}

// LAUNCHLIBRARY — upcoming space launches (keyless, rate-limited)
export async function searchLaunches(query: string, limit = 8): Promise<any[]> {
  try {
    const q = query.trim().toLowerCase();
    const data: any = await fetchFromProvider('launchlibrary',
      'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=30&mode=detailed',
      { timeout: 20000, retries: 0 });
    const launches: any[] = data?.results || [];
    const terms = q ? q.split(/[^a-z0-9]+/).filter(t => t.length > 2) : [];
    const filtered = terms.length
      ? launches.filter((l: any) => {
          const hay = `${l.name} ${l.mission?.name || ''} ${l.mission?.description || ''} ${l.pad?.location?.name || ''} ${l.rocket?.configuration?.name || ''}`.toLowerCase();
          return terms.some(t => hay.includes(t));
        })
      : launches;
    return filtered.slice(0, limit).map((l: any) => ({
      ...ds(String(l.id || l.net), 'launchlibrary',
        `Launch Library 2 — ${l.name}`,
        `${l.name} — ${l.rocket?.configuration?.name || 'rocket n/a'} from ${l.pad?.location?.name || '?'}, ${l.pad?.name || ''}. NET: ${l.net || '?'} UTC. Mission: ${(l.mission?.description || l.mission?.name || '').slice(0, 150)}. Source: Launch Library 2.`,
        l.url || 'https://thespacedevs.com/llapi', 'Launch Library 2', l),
      year: l.net ? Number(String(l.net).slice(0, 4)) : null,
    }));
  } catch (e: any) {
    console.error(`[LAUNCHES] failed: ${e?.message}`);
    return [];
  }
}

// INATURALIST — crowd-sourced species observations (keyless)
export async function searchINaturalist(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.inaturalist.org/v1/observations?q=${encodeURIComponent(q)}` +
      `&per_page=${Math.min(limit, 10)}&quality_grade=research&photos=true`;
    const data: any = await fetchFromProvider('inaturalist', url, { timeout: 20000, retries: 1 });
    const obs: any[] = data?.results || [];
    return obs.slice(0, limit).map((o: any) => {
      const sp = o.taxon || {};
      return {
        ...ds(String(o.id), 'inaturalist',
          `iNaturalist — ${sp.preferred_common_name || sp.name || 'observation'} (${sp.name || '?'})`,
          `${sp.preferred_common_name || sp.name}: observed ${o.observed_on || o.time_observed || '?'}, location ${o.place_guess || `${o.geojson?.coordinates?.reverse?.().join(',') || '?'}`}, by ${o.user?.login || '?'}. ${o.description ? String(o.description).slice(0, 150) : ''} Source: iNaturalist API.`,
          `https://www.inaturalist.org/observations/${o.id}`,
          'iNaturalist community', o),
      };
    });
  } catch (e: any) {
    console.error(`[INATURALIST] failed: ${e?.message}`);
    return [];
  }
}

// OBIS — ocean biodiversity occurrences (keyless)
export async function searchOBIS(query: string, limit = 5): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.obis.org/v3/occurrence?scientificname=${encodeURIComponent(q)}&size=0`;
    const data: any = await fetchFromProvider('obis', url, { timeout: 20000, retries: 1 });
    const total = data?.total;
    if (total == null) return [];
    const url2 = `https://api.obis.org/v3/occurrence?scientificname=${encodeURIComponent(q)}&size=3`;
    const data2: any = await fetchFromProvider('obis', url2, { timeout: 20000, retries: 1 });
    const sample = (data2?.results || []).map((r: any) =>
      `${r.scientificName || '?'} @ ${r.decimalLatitude?.toFixed?.(1)},${r.decimalLongitude?.toFixed?.(1)} ${r.eventDate || ''}`).join('; ');
    return [ds(
      String(q), 'obis',
      `OBIS — ${q}: ${Number(total).toLocaleString()} marine occurrence records`,
      `OBIS occurrence search for "${q}": ${Number(total).toLocaleString()} records in the Ocean Biodiversity Information System. Sample: ${sample || 'n/a'}. Source: OBIS API (IOC-UNESCO).`,
      `https://obis.org/taxon/${encodeURIComponent(q)}`,
      'OBIS (IOC-UNESCO)', { total, sample: data2?.results },
    )];
  } catch (e: any) {
    console.error(`[OBIS] failed: ${e?.message}`);
    return [];
  }
}

// WORMS — World Register of Marine Species (keyless)
export async function searchWoRMS(query: string, limit = 5): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://www.marinespecies.org/rest/AphiaRecordsByName/${encodeURIComponent(q)}?like=false&marine_only=false`;
    const records: any[] = await fetchFromProvider('worms', url, { timeout: 20000, retries: 1 });
    const rec: any = Array.isArray(records) ? records.find((r: any) => r.status === 'accepted') || records[0] : null;
    if (!rec?.AphiaID) return [];
    const name = rec?.scientificname || q;
    return [ds(
      String(rec.AphiaID), 'worms',
      `WoRMS — ${name}`,
      `World Register of Marine Species record: ${name} (${rec?.authority || '?'}), status ${rec?.status || '?'}, rank ${rec?.rank || '?'}, kingdom ${rec?.kingdom || '?'}. Source: WoRMS REST API.`,
      `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${rec.AphiaID}`,
      'WoRMS (Flanders Marine Institute / UNESCO)', rec,
    )];
  } catch (e: any) {
    console.error(`[WORMS] failed: ${e?.message}`);
    return [];
  }
}

// SMITHSONIAN — Open Access collections API (keyless)
export async function searchSmithsonian(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(q)}&rows=${Math.min(limit, 10)}&api_key=DEMO_KEY`;
    const data: any = await fetchFromProvider('smithsonian', url, { timeout: 20000, retries: 1 });
    const rows: any[] = data?.response?.rows || data?.rows || [];
    return rows.slice(0, limit).map((r: any) => ({
      ...ds(String(r.id || r.objectID || Math.random()), 'smithsonian',
        `Smithsonian — ${String(r.title || r.objectName || 'collection item').slice(0, 140)}`,
        `${[r.objectName, r.dataSource, r.unitCode].filter(Boolean).join(' | ')}. ${r.objectURL || ''}. Open Access Smithsonian collection (CC0 where noted). Source: Smithsonian Open Access API.`,
        r.objectURL || 'https://www.si.edu/openaccess',
        'Smithsonian Institution', r),
      year: r.date || r.yearMade ? Number(String(r.date || r.yearMade).slice(0, 4)) || null : null,
    }));
  } catch (e: any) {
    console.error(`[SMITHSONIAN] failed: ${e?.message}`);
    return [];
  }
}

// PROPUBLICA CONGRESS — US Congress members & bills (keyless)
export async function searchCongress(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.propublica.org/congress/v1/members.json?query=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}`;
    const data: any = await fetchFromProvider('propublica-congress', url,
      { timeout: 20000, retries: 1, headers: { 'User-Agent': 'NomosX-research/1.0' } });
    const members: any[] = data?.results || [];
    return members.slice(0, limit).map((m: any, i: number) => ({
      ...ds(String(m.id || `cong-${i}`), 'propublica-congress',
        `Congress — ${m.first_name || ''} ${m.last_name || ''} (${m.state || ''})`,
        `${[m.first_name, m.last_name].filter(Boolean).join(' ')} — ${m.state}${m.party ? ` ${m.party}` : ''}, ${m.title || 'Member of Congress'}. ${m.url || ''}. Source: ProPublica Congress API.`,
        m.url || 'https://projects.propublica.org/congress/api/', 'ProPublica', m),
    }));
  } catch (e: any) {
    console.error(`[CONGRESS] failed: ${e?.message}`);
    return [];
  }
}

// NWS — US National Weather Service alerts/forecast (keyless)
export async function searchNWS(query: string, limit = 5): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.weather.gov/alerts?status=actual&limit=${Math.min(limit, 10)}`;
    const data: any = await fetchFromProvider('nws', url,
      { timeout: 20000, retries: 1, headers: { 'User-Agent': 'NomosX-research/1.0', Accept: 'application/geo+json' } });
    const feats: any[] = data?.features || [];
    const ql = q.toLowerCase();
    const terms = ql.split(/[^a-z]+/).filter(t => t.length > 3);
    const hits = feats.filter((f: any) => {
      const props = f.properties || {};
      const hay = `${props.event || ''} ${props.areaDesc || ''} ${props.senderName || ''}`.toLowerCase();
      return !terms.length || terms.some(t => hay.includes(t));
    }).slice(0, limit);
    return hits.map((f: any) => {
      const p = f.properties || {};
      return {
        ...ds(String(p.id || f.id), 'nws',
          `NWS — ${p.event || 'Weather alert'}: ${p.areaDesc || '?'}`,
          `${p.event || 'Alert'} (${p.severity || '?'}/${p.urgency || '?'}) for ${p.areaDesc || '?'}. ${String(p.headline || p.description || '').slice(0, 220)}. Expires: ${p.expires || p.ends || '?'}. Source: api.weather.gov.`,
          p.web || 'https://www.weather.gov/', 'NOAA National Weather Service', f),
      };
    });
  } catch (e: any) {
    console.error(`[NWS] failed: ${e?.message}`);
    return [];
  }
}

// USGS WATER — real-time streamflow (keyless, complements quakes)
const USGS_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
export async function searchUSGSWater(query: string, limit = 5): Promise<any[]> {
  try {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const st = Object.keys(USGS_STATES).find(k => q.includes(k)) ||
      Object.entries(USGS_STATES).find(([k, v]) => q.toLowerCase().includes(v.toLowerCase()))?.[0];
    if (!st) return [];
    const code = USGS_STATES[st];
    const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=${code}&parameterCd=00060&siteStatus=active`;
    const data: any = await fetchFromProvider('usgs-water', url, { timeout: 25000, retries: 1 });
    const ts = data?.value?.timeSeries || [];
    const picks = ts.slice(0, Math.min(limit, 6));
    return picks.map((s: any, i: number) => {
      const vals = s.values?.[0]?.value || [];
      const latest = vals[vals.length - 1] || {};
      return {
        ...ds(String(s.sourceInfo?.siteCode?.[0]?.value || `w-${i}`), 'usgs-water',
          `USGS Water — ${s.sourceInfo?.siteName || 'stream gauge'} (${code})`,
          `${s.sourceInfo?.siteName || '?'} — latest discharge ${latest.value ?? '?'} cfs @ ${latest.dateTime || '?'}. ${ts.length} active gauges queried in ${st}. Source: USGS NWIS instantaneous values.`,
          `https://waterdata.usgs.gov/monitoring-location/${s.sourceInfo?.siteCode?.[0]?.value}/`,
          'US Geological Survey', s),
      };
    });
  } catch (e: any) {
    console.error(`[USGS-WATER] failed: ${e?.message}`);
    return [];
  }
}

// NHTSA — US vehicle recalls (keyless)
export async function searchNHTSA(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const tokens = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const year = tokens.find(t => /^(19|20)\d{2}$/.test(t)) || '';
    const words = tokens.filter(t => !/^(19|20)\d{2}$/.test(t) && !/^(recall|recalls|nhtsa|vehicle|car|automotive|safety|defect)$/.test(t));
    if (!words.length || !year) return [];
    const make = words[0];
    const model = words.slice(1).join(' ') || words[0];
    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
    const data: any = await fetchFromProvider('nhtsa', url, { timeout: 20000, retries: 1 });
    const recalls: any[] = data?.results || [];
    if (!recalls.length) return [ds(`nhtsa-${make}`, 'nhtsa',
      `NHTSA — ${make}: no recalls indexed`,
      `NHTSA recalls API returned no records for make "${make}". Source: NHTSA recalls API.`,
      'https://www.nhtsa.gov/recalls', 'NHTSA', { make })];
    return recalls.slice(0, limit).map((r: any, i: number) => ({
      ...ds(String(r.NHTSACampaignNumber || `nhtsa-${i}`), 'nhtsa',
        `NHTSA recall ${r.NHTSACampaignNumber || ''} — ${r.Make || ''} ${r.Model || ''} ${r.ModelYear || ''}`,
        `Recall ${r.NHTSACampaignNumber}: ${r.Make} ${r.Model} ${r.ModelYear} (${r.Manufacturer || ''}). ${String(r.Summary || r.Consequence || '').slice(0, 250)}. Source: NHTSA recalls API.`,
        'https://www.nhtsa.gov/recalls', 'NHTSA', r),
      year: r.ModelYear ? Number(r.ModelYear) : null,
    }));
  } catch (e: any) {
    console.error(`[NHTSA] failed: ${e?.message}`);
    return [];
  }
}

// SWPC — NOAA space weather (keyless)
export async function searchSWPC(query: string, limit = 5): Promise<any[]> {
  try {
    const q = query.trim().toLowerCase();
    const wantKp = /kp|geomagnetic|storm|aurora|solar|space weather|radiation/.test(q);
    const wantAlert = /alert|warning|watch|flare/.test(q) || !wantKp;
    const out: any[] = [];
    if (wantAlert) {
      try {
        const data: any = await fetchFromProvider('swpc',
          'https://services.swpc.noaa.gov/products/alerts.json', { timeout: 15000, retries: 1 });
        (Array.isArray(data) ? data : []).slice(0, limit).forEach((a: any, i: number) => {
          out.push(ds(`swpc-a${i}`, 'swpc',
            `SWPC — ${a.message || 'space weather alert'}`.slice(0, 160),
            `NOAA SWPC product: ${String(a.message || '').slice(0, 300)}. Source: services.swpc.noaa.gov.`,
            'https://www.swpc.noaa.gov/products/alerts-watches-and-warnings', 'NOAA SWPC', a));
        });
      } catch {}
    }
    if (wantKp || !out.length) {
      try {
        const data: any = await fetchFromProvider('swpc',
          'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { timeout: 15000, retries: 1 });
        const rows: any[] = Array.isArray(data) ? data : [];
        const last = rows[rows.length - 1];
        if (last) out.push(ds('swpc-kp', 'swpc',
          `SWPC — planetary K-index ${last[1]} (${last[0]})`,
          `Latest planetary Kp index: ${last[1]} at ${last[0]} UTC (scale: 0 quiet -> 9 extreme geomagnetic storm). Recent tail: ${rows.slice(-5).map(r => `${r[0]}:Kp${r[1]}`).join(', ')}. Source: NOAA SWPC.`,
          'https://www.swpc.noaa.gov/products/planetary-k-index', 'NOAA SWPC', { last, tail: rows.slice(-10) }));
      } catch {}
    }
    return out.slice(0, limit);
  } catch (e: any) {
    console.error(`[SWPC] failed: ${e?.message}`);
    return [];
  }
}

// STACK EXCHANGE — developer Q&A search (keyless, 300 req/day)
export async function searchStackExchange(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance` +
      `&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=${Math.min(limit, 10)}` +
      `&filter=withbody`;
    const data: any = await fetchFromProvider('stackexchange', url, { timeout: 20000, retries: 1 });
    const items: any[] = data?.items || [];
    return items.slice(0, limit).map((it: any) => ({
      ...ds(String(it.question_id), 'stackexchange',
        `StackOverflow — ${it.title || 'question'}`,
        `${it.title || ''} — score ${it.score}, ${it.answer_count ?? 0} answers, asked ${it.creation_date ? new Date(it.creation_date * 1000).toISOString().slice(0, 10) : '?'}. ${String(it.body || '').replace(/<[^>]+>/g, ' ').slice(0, 200)}. Source: Stack Exchange API.`,
        it.link || 'https://stackoverflow.com', 'Stack Exchange', it),
      year: it.creation_date ? new Date(it.creation_date * 1000).getFullYear() : null,
    }));
  } catch (e: any) {
    console.error(`[STACKEXCHANGE] failed: ${e?.message}`);
    return [];
  }
}

// MUSICBRAINZ — music knowledge graph (keyless, needs UA)
export async function searchMusicBrainz(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    const type = /album|record|lp\b/.test(ql) ? 'release-group' : /song|track/.test(ql) ? 'recording' : 'artist';
    const url = `https://musicbrainz.org/ws/2/${type}/?query=${encodeURIComponent(q)}&fmt=json&limit=${Math.min(limit, 10)}`;
    const data: any = await fetchFromProvider('musicbrainz', url,
      { timeout: 15000, retries: 1, headers: { 'User-Agent': 'NomosX-research/1.0 (contact: local)' } });
    const key = type === 'artist' ? 'artists' : type === 'release-group' ? 'release-groups' : 'recordings';
    const items: any[] = data?.[key] || [];
    return items.slice(0, limit).map((m: any) => ({
      ...ds(String(m.id), 'musicbrainz',
        `MusicBrainz — ${m.name || m.title || 'entry'}`,
        `${m.name || m.title}: ${m['life-span']?.begin ? `active since ${m['life-span'].begin}` : ''}${m.area?.name ? `, ${m.area.name}` : ''}${m.score?.name ? `, ${m.score.name}` : ''}${m.count ? `, ${m.count} recordings` : ''}. Source: MusicBrainz API.`,
        `https://musicbrainz.org/${type}/${m.id}`, 'MusicBrainz (MetaBrainz)', m),
      year: m['life-span']?.begin ? Number(String(m['life-span'].begin).slice(0, 4)) : null,
    }));
  } catch (e: any) {
    console.error(`[MUSICBRAINZ] failed: ${e?.message}`);
    return [];
  }
}



// SOCRATA CATALOG — generic open-data catalog search (keyless, multi-domain)
const SOCRATA_DOMAINS = ['data.cdc.gov', 'data.ny.gov', 'data.cityofnewyork.us', 'data.seattle.gov', 'data.austintexas.gov', 'data.lacity.org'];
export async function searchSocrata(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://api.us.socrata.com/api/catalog/v1?domains=${SOCRATA_DOMAINS.join(',')}` +
      `&q=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}&only=datasets`;
    const data: any = await fetchFromProvider('socrata', url, { timeout: 20000, retries: 1 });
    const results: any[] = data?.results || [];
    return results.slice(0, limit).map((r: any) => {
      const res = r.resource || {};
      return {
        ...ds(String(res.id || res.permalink), 'socrata',
          `Socrata — ${res.name || 'open dataset'}`,
          `${res.name || ''} — ${res.description ? String(res.description).slice(0, 180) : ''} Domain: ${res.domain || '?'}, updated ${res.updatedAt ? String(res.updatedAt).slice(0, 10) : '?'}. Source: Socrata catalog API.`,
          res.permalink || `https://${res.domain || 'data.cdc.gov'}`, 'Socrata open data', r),
      };
    });
  } catch (e: any) {
    console.error(`[SOCRATA] failed: ${e?.message}`);
    return [];
  }
}

// RADIO BROWSER — global radio station directory (keyless)
export async function searchRadioBrowser(query: string, limit = 6): Promise<any[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const url = `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}&order=votes&reverse=true`;
    const data: any = await fetchFromProvider('radiobrowser', url, { timeout: 15000, retries: 1 });
    const stations: any[] = Array.isArray(data) ? data : [];
    return stations.slice(0, limit).map((s: any) => ({
      ...ds(String(s.stationuuid || s.url_resolved), 'radiobrowser',
        `Radio — ${s.name || 'station'} (${s.country || '?'})`,
        `${s.name}: ${[s.genre, s.tags].filter(Boolean).flat().slice(0, 4).join(', ') || 'radio'} — ${s.country || '?'}${s.state ? `, ${s.state}` : ''}, votes ${s.votes ?? 0}, bitrate ${s.bitrate ?? '?'}. Source: radio-browser.info API.`,
        s.homepage || s.url_resolved || 'https://www.radio-browser.info', 'radio-browser.info', s),
    }));
  } catch (e: any) {
    console.error(`[RADIOBROWSER] failed: ${e?.message}`);
    return [];
  }
}


// OUR WORLD IN DATA — curated grapher indicators (keyless CSV)
const OWID_INDICATORS: Record<string, string> = {
  'life expectancy': 'life-expectancy',
  'gdp per capita': 'gdp-per-capita-worldbank',
  'co2 per capita': 'co2-per-capita',
  'child mortality': 'child-mortality-rate',
  'electricity access': 'access-to-electricity',
  'internet users': 'share-of-individuals-using-the-internet',
  'homicide rate': 'homicide-rate-unodc',
  'vaccination': 'immunization-measles',
  'poverty': 'share-of-people-living-in-extreme-poverty',
  'literacy': 'youth-literacy-rate',
  'maternal mortality': 'maternal-mortality',
  'sanitation': 'people-without-access-to-sanitation',
  'refugees': 'refugee-population',
  'forest area': 'forest-area',
  'renewable energy': 'renewable-electricity',
  'primary energy': 'primary-energy-consumption',
  'temperature': 'global-temperature',
  'sea level': 'sea-level',
  'marine protected': 'marine-protected-area',
  'political': 'political-regime-type',
};

// ─────────────────────────────────────────────────────────────
// WIKIPEDIA SEARCH — MediaWiki full-text API (keyless).
// Encyclopedia-grade substitution for general-knowledge queries when
// paid search (Tavily/Exa) and metasearch (SearXNG) are degraded.
// ─────────────────────────────────────────────────────────────
export async function searchWikipedia(query: string, limit = 6): Promise<any[]> {
  const q = query.trim();
  if (q.length < 4) return [];
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${Math.min(limit, 10)}&format=json&formatversion=2`;
    const data: any = await fetchFromProvider('wikipedia-search', url, { timeout: 12000, retries: 1 });
    const hits: any[] = data?.query?.search || [];
    if (hits.length === 0) return [];
    return hits.slice(0, limit).map((h: any) => {
      const title = String(h.title || '');
      const snippet = String(h.snippet || '').replace(/<[^>]+>/g, '');
      return ds(
        `wiki:${h.pageid || Buffer.from(title).toString('base64').slice(0, 16)}`, 'wikipedia-search',
        `Wikipedia — ${title}`,
        `${snippet} — ${title} (${h.wordcount ?? '?'} words). Source: Wikipedia MediaWiki API.`,
        `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        'Wikipedia', { pageid: h.pageid, wordcount: h.wordcount },
      );
    });
  } catch (e: any) {
    console.error(`[WIKIPEDIA] failed: ${e?.message}`);
    return [];
  }
}
