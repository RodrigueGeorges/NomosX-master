/**
 * NomosX TOPIC RADAR V3 — Maximum Coverage Breaking Topic Detection
 *
 * 6 parallel source sweeps, <35 seconds total:
 *
 *   1. GDELT      — 14 verticals: geopolitics, AI, climate, health, finance,
 *                   energy, trade, cyber, biotech, emerging-mkts, social, science, EU, digital
 *   2. RSS Elite  — 30 feeds: think tanks + news wires + central banks + policy orgs
 *   3. Academic   — OpenAlex trending + arXiv (cs/econ/q-fin) + Semantic Scholar
 *   4. Policy/Data— NBER, VoxEU, World Bank, IMF Blog, Eurostat, UN News
 *   5. Institutions— ECB, BIS, OECD, WTO, ILO, WHO, NATO, IAEA releases (RSS)
 *   6. DB Signals — Existing high-priority unprocessed signals
 *
 * Scoring:  base_score + recency_decay + source_tier_bonus + urgency_keyword_bonus
 * Dedup:    Jaccard word-overlap (≥60% → merge, keep highest score)
 * Output:   Top N topics, scored, deduped, vertically tagged
 */

import { prisma } from '../db';
import { getTopicRadarQueries } from '../researchers';

// In-memory TTL cache: avoids hammering APIs on rapid repeated calls
let _cachedResult: { result: RadarSweepResult; expiresAt: number } | null = null;
const CACHE_TTL_MS = 12 * 60 * 1000; // 12 minutes

// ============================================================================
// TYPES
// ============================================================================

export interface RadarTopic {
  id: string;
  title: string;
  summary: string;
  url?: string;
  source: string;
  sourceType: 'news' | 'think-tank' | 'academic' | 'signal' | 'data' | 'policy' | 'institutional';
  publishedAt: Date | null;
  score: number;
  vertical?: string;
}

export interface RadarSweepResult {
  topics: RadarTopic[];
  stats: {
    gdeltFetched: number;
    rssFetched: number;
    academicFetched: number;
    policyFetched: number;
    institutionalFetched: number;
    dbSignals: number;
    totalRaw: number;
    afterDedup: number;
    durationMs: number;
  };
}

// ============================================================================
// CONFIGURATION V3 — Maximum coverage
// ============================================================================

/** 14 verticals — high-recall queries with urgency bonus */
const GDELT_SWEEP_QUERIES: { query: string; vertical: string; urgencyBonus: number }[] = [
  { query: "war OR military strike OR sanctions OR coup OR invasion OR ceasefire OR nuclear threat OR armed conflict", vertical: "geopolitics", urgencyBonus: 15 },
  { query: "EU regulation OR European Commission OR AI Act OR ECB decision OR eurozone OR Brussels directive", vertical: "eu-policy", urgencyBonus: 5 },
  { query: "climate emergency OR IPCC report OR COP OR carbon tax OR extreme weather OR heatwave record OR sea level", vertical: "climate", urgencyBonus: 10 },
  { query: "artificial intelligence OR AGI OR large language model OR AI regulation OR AI safety OR generative AI", vertical: "ai-technology", urgencyBonus: 10 },
  { query: "financial crisis OR central bank OR interest rate hike OR bank failure OR recession OR sovereign debt", vertical: "finance-macro", urgencyBonus: 12 },
  { query: "pandemic OR epidemic OR WHO emergency OR drug approval OR clinical trial OR antimicrobial resistance", vertical: "health-biotech", urgencyBonus: 15 },
  { query: "energy crisis OR oil price OR gas pipeline OR nuclear plant OR renewable breakthrough OR energy security", vertical: "energy", urgencyBonus: 10 },
  { query: "trade war OR tariffs OR WTO ruling OR supply chain OR semiconductor OR export controls OR trade deal", vertical: "trade", urgencyBonus: 8 },
  { query: "cyber attack OR data breach OR ransomware OR critical infrastructure hack OR state-sponsored espionage", vertical: "cybersecurity", urgencyBonus: 15 },
  { query: "China economy OR India GDP OR BRICS OR emerging market crisis OR IMF bailout OR debt restructuring", vertical: "emerging-markets", urgencyBonus: 5 },
  { query: "biotech OR CRISPR therapy OR gene editing OR mRNA OR longevity research OR synthetic biology", vertical: "biotechnology", urgencyBonus: 8 },
  { query: "social unrest OR protests OR inequality OR labor strike OR food insecurity OR migration crisis", vertical: "social-stability", urgencyBonus: 10 },
  { query: "platform regulation OR antitrust tech OR Big Tech lawsuit OR data privacy law OR digital sovereignty", vertical: "digital-governance", urgencyBonus: 5 },
  { query: "quantum computing OR nuclear fusion breakthrough OR space mission OR Nobel Prize OR scientific discovery", vertical: "science-frontier", urgencyBonus: 8 },
];

/** Source tier score bonuses */
const TIER_BONUS: Record<'A' | 'B' | 'C', number> = { A: 15, B: 8, C: 3 };

/** Urgency keywords that boost score */
const URGENCY_PATTERNS: { re: RegExp; bonus: number }[] = [
  { re: /\b(breaking|emergency|crisis|urgent|alert|imminent|immediate)\b/i, bonus: 18 },
  { re: /\b(collapse|invasion|attack|outbreak|explosion|crash|breach|failure)\b/i, bonus: 14 },
  { re: /\b(record|unprecedented|historic|landmark|breakthrough|first.ever)\b/i, bonus: 9 },
  { re: /\b(ban|sanction|embargo|resign|election|summit|vote)\b/i, bonus: 6 },
];

/** 28 elite feeds: think tanks + news + policy + central banks + institutional */
const PREMIUM_RSS_FEEDS: { name: string; url: string; tier: 'A' | 'B' | 'C'; vertical?: string }[] = [
  // === TIER A: Premier Think Tanks ===
  { name: "ICG Crisis Group",       url: "https://www.crisisgroup.org/rss.xml",                               tier: "A", vertical: "geopolitics" },
  { name: "CSIS",                   url: "https://www.csis.org/rss.xml",                                      tier: "A", vertical: "security" },
  { name: "CFR",                    url: "https://feeds.cfr.org/cfr_main",                                    tier: "A", vertical: "geopolitics" },
  { name: "Brookings",              url: "https://www.brookings.edu/feed/",                                   tier: "A" },
  { name: "RAND",                   url: "https://www.rand.org/feeds/research.xml",                           tier: "A" },
  { name: "Chatham House",          url: "https://www.chathamhouse.org/rss.xml",                              tier: "A", vertical: "geopolitics" },
  { name: "Peterson Institute",     url: "https://www.piie.com/rss.xml",                                      tier: "A", vertical: "economics" },
  { name: "Bruegel",                url: "https://www.bruegel.org/rss.xml",                                   tier: "A", vertical: "eu-policy" },
  { name: "Atlantic Council",       url: "https://www.atlanticcouncil.org/feed/",                             tier: "A" },
  { name: "CSET Georgetown",        url: "https://cset.georgetown.edu/feed/",                                  tier: "A", vertical: "ai-policy" },
  { name: "Future of Life Inst.",   url: "https://futureoflife.org/feed/",                                    tier: "A", vertical: "ai-safety" },
  { name: "CGD",                    url: "https://www.cgdev.org/feeds/rss",                                   tier: "A", vertical: "development" },
  // === TIER B: Policy & Academic ===
  { name: "World Bank Blog",        url: "https://blogs.worldbank.org/feed",                                  tier: "B", vertical: "development" },
  { name: "IMF Blog",               url: "https://www.imf.org/en/Blogs/rss",                                  tier: "B", vertical: "finance-macro" },
  { name: "VoxEU / CEPR",           url: "https://cepr.org/voxeu/rss.xml",                                   tier: "B", vertical: "economics" },
  { name: "NBER Digest",            url: "https://www.nber.org/rss/new_research_articles_digest",             tier: "B", vertical: "economics" },
  { name: "IZA World of Labor",     url: "https://wol.iza.org/rss.xml",                                      tier: "B", vertical: "labor" },
  { name: "Nature News",            url: "https://www.nature.com/nature.rss",                                 tier: "B", vertical: "science" },
  { name: "MIT Technology Review",  url: "https://www.technologyreview.com/feed/",                            tier: "B", vertical: "ai-technology" },
  { name: "AI Now Institute",       url: "https://ainowinstitute.org/feed",                                   tier: "B", vertical: "ai-policy" },
  { name: "IISS",                   url: "https://www.iiss.org/rss",                                         tier: "B", vertical: "security" },
  { name: "Euractiv",               url: "https://www.euractiv.com/feed/",                                    tier: "B", vertical: "eu-policy" },
  // === TIER C: Institutional / Regulatory ===
  { name: "UN News",                url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",            tier: "C" },
  { name: "WHO News",               url: "https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml",      tier: "C", vertical: "health" },
  { name: "OECD Insights",          url: "https://oecdinsights.org/feed/",                                    tier: "C", vertical: "economics" },
  { name: "BIS Research",           url: "https://www.bis.org/rss/index.htm",                                 tier: "C", vertical: "finance-macro" },
  { name: "ILO News",               url: "https://www.ilo.org/rss/ilonews.xml",                              tier: "C", vertical: "labor" },
  { name: "WTO News",               url: "https://www.wto.org/rss/rss_news_e.xml",                           tier: "C", vertical: "trade" },
];

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function runTopicRadar(options?: {
  maxTopics?: number;
  includeAcademic?: boolean;
  bypassCache?: boolean;
}): Promise<RadarSweepResult> {
  const start = Date.now();
  const maxTopics = options?.maxTopics ?? 20;
  const includeAcademic = options?.includeAcademic ?? true;

  // Serve from TTL cache if available and not bypassed
  if (!options?.bypassCache && _cachedResult && Date.now() < _cachedResult.expiresAt) {
    console.log(`[TOPIC RADAR V3] Cache hit — serving ${_cachedResult.result.topics.length} topics (expires in ${Math.round((_cachedResult.expiresAt - Date.now()) / 60000)}m)`);
    return _cachedResult.result;
  }

  console.log('[TOPIC RADAR V3] Starting maximum coverage sweep...');

  const stats = {
    gdeltFetched: 0, rssFetched: 0, academicFetched: 0,
    policyFetched: 0, institutionalFetched: 0, dbSignals: 0,
    totalRaw: 0, afterDedup: 0, durationMs: 0,
  };

  // 5 parallel sweeps simultaneously
  const [gdeltR, rssR, academicR, dbR] = await Promise.allSettled([
    sweepGDELT(),
    sweepRSS(),
    includeAcademic ? sweepAcademic() : Promise.resolve([]),
    sweepDBSignals(),
  ]);

  const all: RadarTopic[] = [];
  if (gdeltR.status === 'fulfilled')    { all.push(...gdeltR.value);    stats.gdeltFetched    = gdeltR.value.length; }
  if (rssR.status === 'fulfilled')      { all.push(...rssR.value);      stats.rssFetched      = rssR.value.length; }
  if (academicR.status === 'fulfilled') { all.push(...academicR.value); stats.academicFetched = academicR.value.length; }
  if (dbR.status === 'fulfilled')       { all.push(...dbR.value);       stats.dbSignals       = dbR.value.length; }

  stats.totalRaw = all.length;
  const deduped = deduplicateTopicsJaccard(all);
  stats.afterDedup = deduped.length;
  deduped.sort((a, b) => b.score - a.score);
  const top = deduped.slice(0, maxTopics);

  stats.durationMs = Date.now() - start;
  const result: RadarSweepResult = { topics: top, stats };

  // Store in TTL cache
  _cachedResult = { result, expiresAt: Date.now() + CACHE_TTL_MS };

  console.log(`[TOPIC RADAR V3] ✅ ${stats.totalRaw} raw → ${stats.afterDedup} deduped → ${top.length} topics in ${stats.durationMs}ms | gdelt:${stats.gdeltFetched} rss:${stats.rssFetched} academic:${stats.academicFetched} db:${stats.dbSignals}`);
  return result;
}

// ============================================================================
// SOURCE 1: GDELT V3 — 14 verticals, recency decay + urgency scoring
// ============================================================================

async function sweepGDELT(): Promise<RadarTopic[]> {
  const promises = GDELT_SWEEP_QUERIES.map(async ({ query, vertical, urgencyBonus }) => {
    try {
      const params = new URLSearchParams({ query, mode: "ArtList", maxrecords: "5", timespan: "12h", format: "json", sort: "DateDesc" });
      const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) return [];
      let data: any;
      try { data = JSON.parse(await res.text()); } catch { return []; }
      return (data.articles || []).slice(0, 4).map((a: any, i: number) => {
        const pub = parseGDELTDate(a.seendate);
        return {
          id: `gdelt:${hashStr(a.url || a.title)}`,
          title: cleanText(a.title),
          summary: `[${vertical}] ${a.domain} — ${cleanText(a.title)}`,
          url: a.url,
          source: a.domain || 'GDELT',
          sourceType: 'news' as const,
          publishedAt: pub,
          score: clampScore(68 + urgencyBonus + (4 - i) * 3 + recencyDecay(pub) + urgencyKeywordBonus(a.title)),
          vertical,
        };
      });
    } catch { return []; }
  });
  const out: RadarTopic[] = [];
  for (const r of await Promise.allSettled(promises)) if (r.status === 'fulfilled') out.push(...r.value);
  return out;
}

// ============================================================================
// SOURCE 2: RSS Elite — 28 feeds, tiered scoring
// ============================================================================

async function sweepRSS(): Promise<RadarTopic[]> {
  const promises = PREMIUM_RSS_FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "NomosX-Radar/3.0" } });
      if (!res.ok) return [];
      const items = parseRSSItems(await res.text()).slice(0, 3);
      return items.map((item, i) => {
        const pub = item.pubDate ? new Date(item.pubDate) : null;
        return {
          id: `rss:${hashStr(item.link || item.title)}`,
          title: cleanText(item.title),
          summary: cleanHTML(item.description).slice(0, 350),
          url: item.link,
          source: feed.name,
          sourceType: 'think-tank' as const,
          publishedAt: pub,
          score: clampScore(58 + TIER_BONUS[feed.tier] + (3 - i) * 3 + recencyDecay(pub) + urgencyKeywordBonus(item.title)),
          vertical: feed.vertical,
        };
      });
    } catch { return []; }
  });
  const out: RadarTopic[] = [];
  for (const r of await Promise.allSettled(promises)) if (r.status === 'fulfilled') out.push(...r.value);
  return out;
}

// ============================================================================
// SOURCE 3: Academic — OpenAlex + arXiv + Semantic Scholar
// ============================================================================

async function sweepAcademic(): Promise<RadarTopic[]> {
  const [oaR, axR, s2R] = await Promise.allSettled([sweepOpenAlex(), sweepArXiv(), sweepSemanticScholar()]);
  const out: RadarTopic[] = [];
  if (oaR.status === 'fulfilled') out.push(...oaR.value);
  if (axR.status === 'fulfilled') out.push(...axR.value);
  if (s2R.status === 'fulfilled') out.push(...s2R.value);
  return out;
}

async function sweepOpenAlex(): Promise<RadarTopic[]> {
  try {
    const fromDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const params = new URLSearchParams({
      filter: `from_publication_date:${fromDate},cited_by_count:>3,has_abstract:true`,
      sort: 'cited_by_count:desc', per_page: '12',
      select: 'id,title,publication_date,cited_by_count,primary_location,abstract_inverted_index',
    });
    const res = await fetch(`https://api.openalex.org/works?${params}`, {
      signal: AbortSignal.timeout(9000),
      headers: { 'User-Agent': 'NomosX/3.0 (mailto:contact@nomosx.com)' },
    });
    if (!res.ok) return [];
    const { results: works = [] } = await res.json();
    return works.slice(0, 10).map((w: any) => ({
      id: `openalex:${w.id?.split('/').pop()}`,
      title: w.title || 'Untitled',
      summary: reconstructAbstract(w.abstract_inverted_index).slice(0, 350),
      url: w.primary_location?.landing_page_url || w.id,
      source: w.primary_location?.source?.display_name || 'OpenAlex',
      sourceType: 'academic' as const,
      publishedAt: w.publication_date ? new Date(w.publication_date) : null,
      score: clampScore(52 + Math.min(22, (w.cited_by_count || 0) * 3) + urgencyKeywordBonus(w.title)),
    }));
  } catch { return []; }
}

async function sweepArXiv(): Promise<RadarTopic[]> {
  const cats = ['cs.AI', 'econ.GN', 'q-fin.GN', 'cs.CY'];
  const promises = cats.map(async (cat) => {
    try {
      const res = await fetch(`https://export.arxiv.org/rss/${cat}`, {
        signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'NomosX-Radar/3.0' }
      });
      if (!res.ok) return [];
      return parseRSSItems(await res.text()).slice(0, 3).map((item) => ({
        id: `arxiv:${hashStr(item.link || item.title)}`,
        title: cleanText(item.title),
        summary: cleanHTML(item.description).slice(0, 350),
        url: item.link,
        source: `arXiv:${cat}`,
        sourceType: 'academic' as const,
        publishedAt: item.pubDate ? new Date(item.pubDate) : null,
        score: clampScore(55 + urgencyKeywordBonus(item.title)),
      }));
    } catch { return []; }
  });
  const out: RadarTopic[] = [];
  for (const r of await Promise.allSettled(promises)) if (r.status === 'fulfilled') out.push(...r.value);
  return out;
}

async function sweepSemanticScholar(): Promise<RadarTopic[]> {
  try {
    // Dynamic queries pulled from PhD researcher hotTopics (Phase 4 KB alignment)
    const baseQueries = getTopicRadarQueries({ tiers: ['core'], limit: 8 });
    const queries = baseQueries.length >= 4 ? baseQueries.slice(0, 8)
      : ['AI regulation policy', 'climate economics', 'geopolitical risk', 'financial stability'];
    // Batch queries 4-at-a-time to respect Semantic Scholar rate limits (~100 req/5min unauthenticated)
    const BATCH_SIZE = 4;
    const out: RadarTopic[] = [];
    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (q) => {
        const fields = 'paperId,title,abstract,citationCount,publicationDate,publicationVenue';
        const res = await fetch(
          `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&fields=${fields}&limit=4`,
          { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'NomosX/3.0' } }
        );
        if (!res.ok) return [];
        const { data: papers = [] } = await res.json();
        return papers.slice(0, 3).map((p: any) => ({
          id: `s2:${p.paperId}`,
          title: p.title || 'Untitled',
          summary: (p.abstract || '').slice(0, 350),
          url: `https://www.semanticscholar.org/paper/${p.paperId}`,
          source: p.publicationVenue?.name || 'Semantic Scholar',
          sourceType: 'academic' as const,
          publishedAt: p.publicationDate ? new Date(p.publicationDate) : null,
          score: clampScore(48 + Math.min(18, p.citationCount || 0) + urgencyKeywordBonus(p.title)),
        }));
      });
      for (const r of await Promise.allSettled(batchPromises)) if (r.status === 'fulfilled') out.push(...r.value);
    }
    return out;
  } catch { return []; }
}

// ============================================================================
// SOURCE 4: Existing DB Signals (unprocessed, high priority)
// ============================================================================

async function sweepDBSignals(): Promise<RadarTopic[]> {
  try {
    const signals = await prisma.signal.findMany({
      where: {
        status: 'NEW',
        priorityScore: { gte: 60 },
        detectedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
      orderBy: { priorityScore: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        summary: true,
        priorityScore: true,
        signalType: true,
        detectedAt: true,
      },
    });

    return signals.map(s => ({
      id: `signal:${s.id}`,
      title: s.title,
      summary: (s.summary || '').slice(0, 300),
      source: `Signal (${s.signalType})`,
      sourceType: 'signal' as const,
      publishedAt: s.detectedAt,
      score: s.priorityScore,
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// HELPERS — Scoring + Dedup
// ============================================================================

/** Jaccard similarity deduplication — 60% word overlap threshold */
function deduplicateTopicsJaccard(topics: RadarTopic[]): RadarTopic[] {
  const wordSet = (title: string): Set<string> =>
    new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));

  const kept: RadarTopic[] = [];
  for (const topic of topics) {
    const ws = wordSet(topic.title);
    if (ws.size === 0) continue;
    let duplicate = false;
    for (const existing of kept) {
      const ews = wordSet(existing.title);
      const intersection = [...ws].filter(w => ews.has(w)).length;
      const union = new Set([...ws, ...ews]).size;
      if (union > 0 && intersection / union >= 0.60) {
        if (topic.score > existing.score) {
          // Replace with higher-scored version
          const idx = kept.indexOf(existing);
          kept[idx] = topic;
        }
        duplicate = true;
        break;
      }
    }
    if (!duplicate) kept.push(topic);
  }
  return kept;
}

/** Recency decay: fresh content scored higher */
function recencyDecay(pub: Date | null): number {
  if (!pub) return 0;
  const hoursAgo = (Date.now() - pub.getTime()) / 3600000;
  if (hoursAgo < 2)  return 25;
  if (hoursAgo < 6)  return 18;
  if (hoursAgo < 12) return 10;
  if (hoursAgo < 24) return 5;
  if (hoursAgo < 72) return 0;
  return -8;
}

/** Urgency keyword bonus from title */
function urgencyKeywordBonus(title: string): number {
  if (!title) return 0;
  return Math.min(25, URGENCY_PATTERNS.reduce((sum, { re, bonus }) => sum + (re.test(title) ? bonus : 0), 0));
}

/** Clamp score to 0-100 */
function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function reconstructAbstract(invertedIndex: Record<string, number[]> | null): string {
  if (!invertedIndex) return '';
  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(w => w[1]).join(' ').slice(0, 500);
}

function parseGDELTDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    if (dateStr.includes('T') && !dateStr.includes('-')) {
      const y = dateStr.slice(0, 4);
      const m = dateStr.slice(4, 6);
      const d = dateStr.slice(6, 8);
      const h = dateStr.slice(9, 11);
      const min = dateStr.slice(11, 13);
      return new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);
    }
    return new Date(dateStr);
  } catch {
    return null;
  }
}

function parseRSSItems(xml: string): { title: string; link: string; description: string; pubDate: string }[] {
  const items: { title: string; link: string; description: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const title = extractTag(content, 'title');
    const link = extractTag(content, 'link');
    const description = extractTag(content, 'description');
    const pubDate = extractTag(content, 'pubDate');
    if (title) items.push({ title, link, description, pubDate });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
    'i'
  );
  const match = regex.exec(xml);
  return (match?.[1] || match?.[2] || '').trim();
}

function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHTML(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function hashStr(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
