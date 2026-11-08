/**
 * API Connectivity Test — verifies every API key in .env.local is operational.
 * Run: node --import tsx scripts/test-api-connectivity.ts
 */

// Load .env.local BEFORE importing anything that depends on env
import { config } from 'dotenv';
config({ path: '.env.local' });

// Now safe to import env-dependent modules
const { env } = require('../lib/env');

type TestResult = { name: string; status: 'ok' | 'fail' | 'skip'; detail: string };

async function testDeepSeek(): Promise<TestResult> {
  if (!env.DEEPSEEK_API_KEY) return { name: 'DeepSeek', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { name: 'DeepSeek', status: 'fail', detail: `HTTP ${res.status}: ${await res.text().catch(() => '?')}` };
    const data = await res.json();
    return { name: 'DeepSeek', status: 'ok', detail: `model=${data.model}, reply="${data.choices?.[0]?.message?.content?.slice(0, 20)}"` };
  } catch (e: any) {
    return { name: 'DeepSeek', status: 'fail', detail: e.message };
  }
}

async function testGLM(): Promise<TestResult> {
  if (!env.GLM_API_KEY) return { name: 'GLM-5.2 (z.ai)', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`${env.GLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GLM_API_KEY}` },
      body: JSON.stringify({ model: 'glm-5.2', messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { name: 'GLM-5.2 (z.ai)', status: 'fail', detail: `HTTP ${res.status}: ${await res.text().catch(() => '?')}` };
    const data = await res.json();
    return { name: 'GLM-5.2 (z.ai)', status: 'ok', detail: `model=${data.model}, reply="${data.choices?.[0]?.message?.content?.slice(0, 20)}"` };
  } catch (e: any) {
    return { name: 'GLM-5.2 (z.ai)', status: 'fail', detail: e.message };
  }
}

async function testOpenAI(): Promise<TestResult> {
  if (!env.OPENAI_API_KEY) return { name: 'OpenAI', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { name: 'OpenAI', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'OpenAI', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'OpenAI', status: 'fail', detail: e.message };
  }
}

async function testOpenAlex(): Promise<TestResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${env.OPENALEX_API}?search=carbon+tax&per-page=1`, {
        headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 503 && attempt < 2) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
      if (!res.ok) return { name: 'OpenAlex', status: 'fail', detail: `HTTP ${res.status}` };
      const data = await res.json();
      return { name: 'OpenAlex', status: 'ok', detail: `${data.meta?.count ?? '?'} results` };
    } catch (e: any) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
      return { name: 'OpenAlex', status: 'fail', detail: e.message };
    }
  }
  return { name: 'OpenAlex', status: 'fail', detail: 'All retries exhausted' };
}

async function testCrossref(): Promise<TestResult> {
  try {
    const res = await fetch(`${env.CROSSREF_API}?query=carbon+tax&rows=1`, {
      headers: { 'User-Agent': `NomosX/1.0 (mailto:${env.UNPAYWALL_EMAIL || 'test@test.com'})` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { name: 'Crossref', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'Crossref', status: 'ok', detail: `${data.message?.['total-results'] ?? '?'} results` };
  } catch (e: any) {
    return { name: 'Crossref', status: 'fail', detail: e.message };
  }
}

async function testSemanticScholar(): Promise<TestResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${env.SEMANTICSCHOLAR_API}?query=carbon+tax&limit=1&fields=paperId,title`, {
        headers: { 'User-Agent': 'NomosX/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429 && attempt < 2) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue; }
      if (!res.ok) return { name: 'Semantic Scholar', status: 'fail', detail: `HTTP ${res.status}` };
      const data = await res.json();
      return { name: 'Semantic Scholar', status: 'ok', detail: `${data.total ?? '?'} results` };
    } catch (e: any) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue; }
      return { name: 'Semantic Scholar', status: 'fail', detail: e.message };
    }
  }
  return { name: 'Semantic Scholar', status: 'fail', detail: 'All retries exhausted' };
}

// ── Free academic providers (no API key needed) ──

async function testArxiv(): Promise<TestResult> {
  try {
    const res = await fetch('http://export.arxiv.org/api/query?search_query=all:carbon+tax&max_results=1', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'arXiv', status: 'fail', detail: `HTTP ${res.status}` };
    const text = await res.text();
    const count = (text.match(/<entry>/g) || []).length;
    return { name: 'arXiv', status: 'ok', detail: `${count} result(s)` };
  } catch (e: any) {
    return { name: 'arXiv', status: 'fail', detail: e.message };
  }
}

async function testHAL(): Promise<TestResult> {
  try {
    const res = await fetch('https://api.archives-ouvertes.fr/search/?q=carbon+tax&rows=1&wt=json', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'HAL (France)', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'HAL (France)', status: 'ok', detail: `${data.response?.numFound ?? '?'} results` };
  } catch (e: any) {
    return { name: 'HAL (France)', status: 'fail', detail: e.message };
  }
}

async function testPubMed(): Promise<TestResult> {
  try {
    const res = await fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=carbon+tax&retmax=1&retmode=json', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'PubMed', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'PubMed', status: 'ok', detail: `${data.esearchresult?.count ?? '?'} results` };
  } catch (e: any) {
    return { name: 'PubMed', status: 'fail', detail: e.message };
  }
}

async function testEuropePMC(): Promise<TestResult> {
  try {
    const res = await fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=carbon+tax&format=json&pageSize=1', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'EuropePMC', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'EuropePMC', status: 'ok', detail: `${data.hitCount ?? '?'} results` };
  } catch (e: any) {
    return { name: 'EuropePMC', status: 'fail', detail: e.message };
  }
}

async function testDOAJ(): Promise<TestResult> {
  try {
    const res = await fetch('https://doaj.org/api/search/articles/carbon%20tax?pageSize=1', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'DOAJ', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'DOAJ', status: 'ok', detail: `${data.total ?? '?'} results` };
  } catch (e: any) {
    return { name: 'DOAJ', status: 'fail', detail: e.message };
  }
}

async function testSSRN(): Promise<TestResult> {
  try {
    const res = await fetch(`https://api.ssrn.com/content/v1/bindings/search?terms=carbon+tax&start=0&count=1&type=Papers&sort=Relevance`, {
      headers: { Accept: 'application/json', 'User-Agent': 'NomosX Research Agent/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 403) return { name: 'SSRN', status: 'fail', detail: 'HTTP 403 — API requires auth (provider returns [])' };
    if (!res.ok) return { name: 'SSRN', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'SSRN', status: 'ok', detail: 'Reachable' };
  } catch (e: any) {
    return { name: 'SSRN', status: 'fail', detail: e.message };
  }
}

async function testRePEc(): Promise<TestResult> {
  try {
    const res = await fetch('https://api.repec.org/call.cgi?code=test&query=carbon+tax', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'RePEc', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'RePEc', status: 'ok', detail: 'Reachable' };
  } catch (e: any) {
    return { name: 'RePEc', status: 'fail', detail: e.message };
  }
}

async function testNBER(): Promise<TestResult> {
  // NBER uses OpenAlex with ROR filter — same API, different endpoint
  try {
    const res = await fetch(`https://api.openalex.org/works?search=carbon+tax&filter=institutions.ror:https://ror.org/006wxqw24&per_page=1&select=id,title`, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 503) return { name: 'NBER (via OpenAlex)', status: 'fail', detail: 'HTTP 503 — OpenAlex down (temporal)' };
    if (!res.ok) return { name: 'NBER (via OpenAlex)', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'NBER (via OpenAlex)', status: 'ok', detail: `${data.meta?.count ?? '?'} NBER papers` };
  } catch (e: any) {
    return { name: 'NBER (via OpenAlex)', status: 'fail', detail: e.message };
  }
}

async function testThesesFr(): Promise<TestResult> {
  try {
    const res = await fetch(`https://theses.fr/api/v1/theses/recherche/?q=carbon+tax&nombre=1`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'Theses.fr', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'Theses.fr', status: 'ok', detail: `${data.totalHits ?? '?'} theses` };
  } catch (e: any) {
    return { name: 'Theses.fr', status: 'fail', detail: e.message };
  }
}

// ── Institutional providers (free, no API key) ──

async function testIMF(): Promise<TestResult> {
  try {
    const res = await fetch('https://www.imf.org/en/Publications/Search?series=IMF+Working+Papers&sort=date', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'IMF', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'IMF', status: 'ok', detail: 'Reachable' };
  } catch (e: any) {
    return { name: 'IMF', status: 'fail', detail: e.message };
  }
}

async function testWorldBank(): Promise<TestResult> {
  try {
    const res = await fetch('https://api.worldbank.org/v2/country/all?format=json&per_page=1', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'World Bank', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'World Bank', status: 'ok', detail: `${data[0]?.total ?? '?'} results` };
  } catch (e: any) {
    return { name: 'World Bank', status: 'fail', detail: e.message };
  }
}

async function testOECD(): Promise<TestResult> {
  try {
    const res = await fetch('https://stats.oecd.org/SDMX-JSON/data/MEI_CLI/LOLITO.AUS.M/all?startTime=2024-01', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'OECD', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'OECD', status: 'ok', detail: 'Reachable' };
  } catch (e: any) {
    return { name: 'OECD', status: 'fail', detail: e.message };
  }
}

async function testECB(): Promise<TestResult> {
  try {
    const res = await fetch('https://data-api.ecb.europa.eu/service/data/EXR/A.USD.EUR.SP00.A?format=jsondata', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'ECB', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'ECB', status: 'ok', detail: 'Reachable' };
  } catch (e: any) {
    return { name: 'ECB', status: 'fail', detail: e.message };
  }
}

async function testEurostat(): Promise<TestResult> {
  // Eurostat stats API — use a small filtered query to avoid 413
  try {
    const res = await fetch('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?format=JSON&filter=ADJ=A&filter=COICOP=CP00&filter=FREQ=M&filter=GEO=EA&lastTimePeriod=1', {
      headers: { 'User-Agent': 'NomosX Research Bot', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 413) return { name: 'Eurostat', status: 'ok', detail: 'API alive (413 = query too broad, normal)' };
    if (!res.ok) return { name: 'Eurostat', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'Eurostat', status: 'ok', detail: 'Data API OK' };
  } catch (e: any) {
    return { name: 'Eurostat', status: 'fail', detail: e.message };
  }
}

async function testWHO(): Promise<TestResult> {
  try {
    const res = await fetch('https://ghoapi.azureedge.net/api/Indicator', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'WHO GHO', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'WHO GHO', status: 'ok', detail: 'Reachable' };
  } catch (e: any) {
    return { name: 'WHO GHO', status: 'fail', detail: e.message };
  }
}

async function testUN(): Promise<TestResult> {
  // UN uses OpenAlex with UN ROR filter — same as NBER pattern
  try {
    const res = await fetch(`https://api.openalex.org/works?search=carbon+tax&filter=authorships.institutions.ror:https://ror.org/0304whf06&per_page=1&select=id,title`, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 503) return { name: 'UN (via OpenAlex)', status: 'fail', detail: 'HTTP 503 — OpenAlex down (temporal)' };
    if (!res.ok) return { name: 'UN (via OpenAlex)', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'UN (via OpenAlex)', status: 'ok', detail: `${data.meta?.count ?? '?'} UN docs` };
  } catch (e: any) {
    return { name: 'UN (via OpenAlex)', status: 'fail', detail: e.message };
  }
}

async function testBASE(): Promise<TestResult> {
  try {
    const res = await fetch(`https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi?func=PerformSearch&query=carbon+tax&format=json&hits=1&type=all&sortby=relevance`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'BASE', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    const count = data?.response?.docs?.length ?? '?';
    return { name: 'BASE', status: 'ok', detail: `${count} result(s)` };
  } catch (e: any) {
    return { name: 'BASE', status: 'fail', detail: e.message };
  }
}

// ── News providers ──

async function testGDELT(): Promise<TestResult> {
  try {
    const params = new URLSearchParams({ query: 'artificial intelligence', mode: 'ArtList', maxrecords: '1', timespan: '1d', format: 'json', sort: 'DateDesc' });
    const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { name: 'GDELT News', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'GDELT News', status: 'ok', detail: `${data.articles?.length ?? 0} article(s)` };
  } catch (e: any) {
    return { name: 'GDELT News', status: 'fail', detail: e.message };
  }
}

async function testMediaStack(): Promise<TestResult> {
  if (!process.env.MEDIASTACK_KEY) return { name: 'MediaStack', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`https://api.mediastack.com/v1/news?access_key=${process.env.MEDIASTACK_KEY}&keywords=test&limit=1`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { name: 'MediaStack', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'MediaStack', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'MediaStack', status: 'fail', detail: e.message };
  }
}

async function testTheNewsAPI(): Promise<TestResult> {
  if (!process.env.THENEWSAPI_KEY) return { name: 'TheNewsAPI', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`https://api.thenewsapi.com/v1/news/all?api_token=${process.env.THENEWSAPI_KEY}&search=test&limit=1`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { name: 'TheNewsAPI', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'TheNewsAPI', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'TheNewsAPI', status: 'fail', detail: e.message };
  }
}

async function testGNews(): Promise<TestResult> {
  if (!process.env.GNEWS_KEY) return { name: 'GNews', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`https://gnews.io/api/v4/search?q=test&max=1&apikey=${process.env.GNEWS_KEY}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { name: 'GNews', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'GNews', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'GNews', status: 'fail', detail: e.message };
  }
}

async function testEventRegistry(): Promise<TestResult> {
  if (!process.env.EVENTREGISTRY_KEY) return { name: 'EventRegistry', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`https://eventregistry.org/api/v1/article?apiKey=${process.env.EVENTREGISTRY_KEY}&q=test&articlesCount=1`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { name: 'EventRegistry', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'EventRegistry', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'EventRegistry', status: 'fail', detail: e.message };
  }
}

// ── Topic Radar RSS feeds (sample 3 feeds) ──

async function testRSSFeeds(): Promise<TestResult> {
  const feeds = [
    { name: 'Brookings', url: 'https://www.brookings.edu/feed/' },
    { name: 'CSIS', url: 'https://www.csis.org/rss.xml' },
    { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  ];
  let okCount = 0;
  const errors: string[] = [];
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'NomosX-Radar/3.0' } });
      if (res.ok) okCount++;
      else errors.push(`${feed.name}:${res.status}`);
    } catch (e: any) {
      errors.push(`${feed.name}:${e.message.slice(0, 30)}`);
    }
  }
  if (okCount === feeds.length) return { name: 'RSS Feeds (3/3)', status: 'ok', detail: `${okCount}/${feeds.length} feeds OK` };
  if (okCount > 0) return { name: 'RSS Feeds', status: 'ok', detail: `${okCount}/${feeds.length} OK (${errors.join(', ')})` };
  return { name: 'RSS Feeds', status: 'fail', detail: errors.join(', ') };
}

async function testCORE(): Promise<TestResult> {
  if (!env.CORE_API_KEY) return { name: 'CORE', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`https://api.core.ac.uk/v3/search/works?q=carbon+tax&limit=1`, {
      headers: { Authorization: `Bearer ${env.CORE_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { name: 'CORE', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'CORE', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'CORE', status: 'fail', detail: e.message };
  }
}

async function testCohere(): Promise<TestResult> {
  if (!env.COHERE_API_KEY) return { name: 'Cohere (rerank)', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch('https://api.cohere.com/v1/check-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.COHERE_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { name: 'Cohere (rerank)', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'Cohere (rerank)', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'Cohere (rerank)', status: 'fail', detail: e.message };
  }
}

async function testUnpaywall(): Promise<TestResult> {
  if (!env.UNPAYWALL_EMAIL) return { name: 'Unpaywall', status: 'skip', detail: 'No email' };
  try {
    const res = await fetch(`https://api.unpaywall.org/v2/10.1038/nature12373?email=${env.UNPAYWALL_EMAIL}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { name: 'Unpaywall', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'Unpaywall', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'Unpaywall', status: 'fail', detail: e.message };
  }
}

async function testFRED(): Promise<TestResult> {
  if (!env.FRED_API_KEY) return { name: 'FRED', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`https://api.stlouisfed.org/fred/series?series_id=GDP&api_key=${env.FRED_API_KEY}&file_type=json`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { name: 'FRED', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'FRED', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'FRED', status: 'fail', detail: e.message };
  }
}

async function testNewsAPI(): Promise<TestResult> {
  if (!env.NEWSAPI_KEY) return { name: 'NewsAPI', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`https://newsapi.org/v2/everything?q=test&pageSize=1&apiKey=${env.NEWSAPI_KEY}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { name: 'NewsAPI', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'NewsAPI', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'NewsAPI', status: 'fail', detail: e.message };
  }
}

async function testLinkUp(): Promise<TestResult> {
  if (!env.LINKUP_API_KEY) return { name: 'LinkUp', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch('https://api.linkup.so/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LINKUP_API_KEY}` },
      body: JSON.stringify({ q: 'test', depth: 'standard', outputType: 'searchResults' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { name: 'LinkUp', status: 'fail', detail: `HTTP ${res.status}: ${await res.text().catch(() => '?')}` };
    return { name: 'LinkUp', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'LinkUp', status: 'fail', detail: e.message };
  }
}

async function testGoogleKG(): Promise<TestResult> {
  if (!env.GOOGLE_KNOWLEDGE_GRAPH_API_KEY) return { name: 'Google Knowledge Graph', status: 'skip', detail: 'No API key' };
  try {
    const res = await fetch(`https://kgsearch.googleapis.com/v1/entities:search?query=test&key=${env.GOOGLE_KNOWLEDGE_GRAPH_API_KEY}&limit=1`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { name: 'Google Knowledge Graph', status: 'fail', detail: `HTTP ${res.status}` };
    return { name: 'Google Knowledge Graph', status: 'ok', detail: 'Auth valid' };
  } catch (e: any) {
    return { name: 'Google Knowledge Graph', status: 'fail', detail: e.message };
  }
}

async function testUpstashRedis(): Promise<TestResult> {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return { name: 'Upstash Redis', status: 'skip', detail: 'No URL/token' };
  try {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/ping`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { name: 'Upstash Redis', status: 'fail', detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { name: 'Upstash Redis', status: 'ok', detail: `ping=${data.result}` };
  } catch (e: any) {
    return { name: 'Upstash Redis', status: 'fail', detail: e.message };
  }
}

async function testDatabase(): Promise<TestResult> {
  if (!env.DATABASE_URL) return { name: 'PostgreSQL (Prisma)', status: 'skip', detail: 'No DATABASE_URL' };
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    return { name: 'PostgreSQL (Prisma)', status: 'ok', detail: 'Connection OK' };
  } catch (e: any) {
    return { name: 'PostgreSQL (Prisma)', status: 'fail', detail: e.message };
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         NomosX — API Connectivity Test                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const tests: TestResult[] = [];
  const results = await Promise.allSettled([
    // LLMs
    testDeepSeek(),
    testGLM(),
    testOpenAI(),
    // Academic APIs (with key)
    testCORE(),
    testCohere(),
    testUnpaywall(),
    // Academic APIs (free, no key)
    testOpenAlex(),
    testCrossref(),
    testSemanticScholar(),
    testArxiv(),
    testHAL(),
    testPubMed(),
    testEuropePMC(),
    testDOAJ(),
    testSSRN(),
    testRePEc(),
    testNBER(),
    testThesesFr(),
    testBASE(),
    // Institutional (free)
    testIMF(),
    testWorldBank(),
    testOECD(),
    testECB(),
    testEurostat(),
    testWHO(),
    testUN(),
    // News providers
    testGDELT(),
    testNewsAPI(),
    testMediaStack(),
    testTheNewsAPI(),
    testGNews(),
    testEventRegistry(),
    testRSSFeeds(),
    // Data & infra
    testFRED(),
    testLinkUp(),
    testGoogleKG(),
    testUpstashRedis(),
    testDatabase(),
  ]);

  for (const r of results) {
    if (r.status === 'fulfilled') tests.push(r.value);
    else tests.push({ name: 'Unknown', status: 'fail', detail: String(r.reason) });
  }

  // Sort: ok first, then skip, then fail
  tests.sort((a, b) => {
    const order = { ok: 0, skip: 1, fail: 2 };
    return order[a.status] - order[b.status];
  });

  const icon = (s: string) => s === 'ok' ? '✅' : s === 'skip' ? '⏭️' : '❌';
  const maxName = Math.max(...tests.map(t => t.name.length));

  for (const t of tests) {
    console.log(`  ${icon(t.status)} ${t.name.padEnd(maxName)}  ${t.detail}`);
  }

  const ok = tests.filter(t => t.status === 'ok').length;
  const skip = tests.filter(t => t.status === 'skip').length;
  const fail = tests.filter(t => t.status === 'fail').length;

  console.log(`\n  ────────────────────────────────────────────`);
  console.log(`  Total: ${tests.length}  ✅ ${ok} OK  ⏭️ ${skip} SKIP  ❌ ${fail} FAIL\n`);

  if (fail > 0) process.exit(1);
}

main().catch(console.error);
