/**
 * NomosX Independent Media Provider
 *
 * Searches independent, investigative, and heterodox media sources
 * that are NOT covered by mainstream news aggregators.
 *
 * Sources:
 * 1. RSS feeds from independent media (The Intercept, ProPublica, Mediapart, etc.)
 * 2. GDELT filtered to independent domains
 * 3. Web search (Tavily/Linkup) scoped to independent journalism
 *
 * This is the DISSIDENT lens backbone — voices outside the institutional mainstream.
 */

import { getRateLimiter } from '../http-client';

interface ScoutNewsResult {
  id: string;
  provider: string;
  type: string;
  title: string;
  abstract: string | null;
  url: string | null;
  pdfUrl: string;
  year: number;
  authors: string[];
  citationCount: number;
  oaStatus: string;
  documentType: string;
  publishedDate: string | null;
  doi: string | null;
  topics: string[];
  jelCodes: string[];
  institutions: { name: string }[];
  raw: any;
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function makeId(provider: string, raw: string): string {
  const slug = raw.replace(/[^a-z0-9]/gi, '-').slice(0, 60).toLowerCase();
  return `${provider}:${slug}`;
}

// ─── Independent Media RSS Feeds ─────────────────────────────────────────────

interface RSSFeed {
  name: string;
  url: string;
  domain: string;
  tier: 'A' | 'B' | 'C';
  language: 'en' | 'fr' | 'de' | 'es' | 'multi';
  category: 'investigative' | 'independent' | 'heterodox' | 'global-south' | 'expert-blog';
}

const INDEPENDENT_FEEDS: RSSFeed[] = [
  // Investigative journalism
  { name: 'The Intercept', url: 'https://theintercept.com/feed/', domain: 'theintercept.com', tier: 'A', language: 'en', category: 'investigative' },
  { name: 'ProPublica', url: 'https://feeds.propublica.org/propublica/main', domain: 'propublica.org', tier: 'A', language: 'en', category: 'investigative' },
  { name: 'ICIJ', url: 'https://www.icij.org/feed/', domain: 'icij.org', tier: 'A', language: 'en', category: 'investigative' },
  { name: 'OCCRP', url: 'https://www.occrp.org/en/rss.xml', domain: 'occrp.org', tier: 'A', language: 'en', category: 'investigative' },
  { name: 'Bellingcat', url: 'https://www.bellingcat.com/feed/', domain: 'bellingcat.com', tier: 'A', language: 'en', category: 'investigative' },

  // French independent media
  { name: 'Mediapart', url: 'https://www.mediapart.fr/articles/feed', domain: 'mediapart.fr', tier: 'A', language: 'fr', category: 'investigative' },
  { name: 'Les Crises', url: 'https://les-crises.fr/feed/', domain: 'les-crises.fr', tier: 'B', language: 'fr', category: 'independent' },
  { name: 'Le Grand Soir', url: 'https://www.legrandsoir.info/spip.php?page=backend', domain: 'legrandsoir.info', tier: 'B', language: 'fr', category: 'independent' },
  { name: 'Reporterre', url: 'https://reporterre.net/spip.php?page=backend', domain: 'reporterre.net', tier: 'B', language: 'fr', category: 'independent' },
  { name: 'Acrimed', url: 'https://acrimed.org/spip.php?page=backend', domain: 'acrimed.org', tier: 'B', language: 'fr', category: 'independent' },

  // Heterodox / dissident perspectives
  { name: 'Jacobin', url: 'https://jacobin.com/feeds/posts.atom', domain: 'jacobin.com', tier: 'B', language: 'en', category: 'heterodox' },
  { name: 'Current Affairs', url: 'https://www.currentaffairs.org/feed', domain: 'currentaffairs.org', tier: 'B', language: 'en', category: 'heterodox' },
  { name: 'Naked Capitalism', url: 'https://www.nakedcapitalism.com/feed', domain: 'nakedcapitalism.com', tier: 'B', language: 'en', category: 'heterodox' },
  { name: 'Bracing Views', url: 'https://bracingviews.com/feed/', domain: 'bracingviews.com', tier: 'C', language: 'en', category: 'heterodox' },

  // Expert blogs (independent scholars)
  { name: 'Marginal Revolution', url: 'https://marginalrevolution.com/feed', domain: 'marginalrevolution.com', tier: 'B', language: 'en', category: 'expert-blog' },
  { name: 'Overcoming Bias', url: 'https://www.overcomingbias.com/feed', domain: 'overcomingbias.com', tier: 'C', language: 'en', category: 'expert-blog' },
  { name: 'LessWrong', url: 'https://www.lesswrong.com/feed.xml', domain: 'lesswrong.com', tier: 'B', language: 'en', category: 'expert-blog' },
  { name: 'SSC/Astral Codex', url: 'https://astralcodexten.substack.com/feed', domain: 'astralcodexten.substack.com', tier: 'B', language: 'en', category: 'expert-blog' },

  // Global South / non-Western perspectives
  { name: 'Africa Is a Country', url: 'https://africaisacountry.com/feed', domain: 'africaisacountry.com', tier: 'B', language: 'en', category: 'global-south' },
  { name: 'Scroll.in', url: 'https://scroll.in/rss', domain: 'scroll.in', tier: 'B', language: 'en', category: 'global-south' },
  { name: 'The Wire (India)', url: 'https://thewire.in/feed', domain: 'thewire.in', tier: 'B', language: 'en', category: 'global-south' },
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', domain: 'scmp.com', tier: 'B', language: 'en', category: 'global-south' },
  { name: 'RT Arabic', url: 'https://arabic.rt.com/rss/', domain: 'arabic.rt.com', tier: 'C', language: 'multi', category: 'global-south' },
  { name: 'Telesur', url: 'https://www.telesurtv.net/rss/index.html', domain: 'telesurtv.net', tier: 'C', language: 'multi', category: 'global-south' },

  // Decolonial / post-colonial
  { name: 'Verso Books Blog', url: 'https://www.versobooks.com/blogs/rss', domain: 'versobooks.com', tier: 'B', language: 'en', category: 'heterodox' },
  { name: 'Roar Magazine', url: 'https://roarmag.org/feed/', domain: 'roarmag.org', tier: 'B', language: 'en', category: 'heterodox' },
  { name: 'Novara Media', url: 'https://novaramedia.com/feed/', domain: 'novaramedia.com', tier: 'B', language: 'en', category: 'heterodox' },
];

/**
 * Parse a simple RSS/Atom feed and return articles matching the query.
 * Uses a lightweight XML parser (no external dependency).
 */
async function fetchRSSFeed(feed: RSSFeed, query: string, limit: number): Promise<ScoutNewsResult[]> {
  try {
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    if (keywords.length === 0) return [];

    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'NomosX Research Bot (+https://nomosx.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
      },
    });
    if (!res.ok) {
      console.warn(`[SCOUT/${feed.name}] HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();

    // Lightweight RSS parsing — extract <item> or <entry> blocks
    const items: string[] = [];
    const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < limit * 3) {
      items.push(match[1]);
    }

    const results: ScoutNewsResult[] = [];
    for (const item of items) {
      const title = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || '';
      const link = item.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim()
        || item.match(/<link[^>]*href="([^"]+)"/i)?.[1]?.trim() || '';
      const description = item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.trim()
        || item.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i)?.[1]?.trim() || '';
      const pubDate = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim()
        || item.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1]?.trim()
        || item.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]?.trim() || '';

      if (!title) continue;

      // Keyword matching — at least one keyword must appear in title or description
      const combined = (title + ' ' + cleanText(description)).toLowerCase();
      const hasMatch = keywords.some(kw => combined.includes(kw));
      if (!hasMatch) continue;

      const year = pubDate ? new Date(pubDate).getFullYear() : new Date().getFullYear();
      const cleanDesc = cleanText(description).slice(0, 2000);

      results.push({
        id: makeId('independent-media', link || title),
        provider: 'independent-media',
        type: 'news',
        title: cleanText(title).slice(0, 500),
        abstract: cleanDesc || null,
        url: link || null,
        pdfUrl: '',
        year,
        authors: [feed.name],
        citationCount: 0,
        oaStatus: 'open',
        documentType: 'article',
        publishedDate: pubDate || null,
        doi: null,
        topics: [feed.category, feed.language],
        jelCodes: [],
        institutions: [{ name: feed.name }],
        raw: { source: feed.name, domain: feed.domain, tier: feed.tier, category: feed.category },
      });

      if (results.length >= limit) break;
    }

    return results;
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return [];
    console.warn(`[SCOUT/${feed.name}] Error: ${err.message?.slice(0, 100)}`);
    return [];
  }
}

/**
 * Search independent media sources for the given query.
 * Fetches RSS feeds in parallel from all independent sources.
 */
export async function searchIndependentMedia(query: string, limit = 30): Promise<ScoutNewsResult[]> {
  const perFeed = Math.max(3, Math.ceil(limit / INDEPENDENT_FEEDS.length) + 2);

  // Fetch all feeds in parallel
  const feedPromises = INDEPENDENT_FEEDS.map(feed =>
    fetchRSSFeed(feed, query, perFeed).catch(() => [] as ScoutNewsResult[])
  );

  const results = await Promise.allSettled(feedPromises);

  const allArticles: ScoutNewsResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      allArticles.push(...r.value);
    }
  }

  // Sort by relevance (keyword match count) then by date
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  allArticles.sort((a, b) => {
    const aText = (a.title + ' ' + (a.abstract || '')).toLowerCase();
    const bText = (b.title + ' ' + (b.abstract || '')).toLowerCase();
    const aMatches = keywords.filter(kw => aText.includes(kw)).length;
    const bMatches = keywords.filter(kw => bText.includes(kw)).length;
    if (bMatches !== aMatches) return bMatches - aMatches;
    return (b.year || 0) - (a.year || 0);
  });

  const limited = allArticles.slice(0, limit);
  if (limited.length > 0) {
    console.log(`[SCOUT/IndependentMedia] Found ${limited.length} articles from ${INDEPENDENT_FEEDS.length} feeds`);
  }
  return limited;
}

/**
 * Search GDELT filtered to independent media domains.
 * Uses GDELT's domain filter to restrict results to independent sources.
 */
export async function searchGDELTIndependent(query: string, limit = 20): Promise<ScoutNewsResult[]> {
  try {
    const cleanQuery = query.split(/\s+/).filter(w => w.length >= 3).join(' ').trim();
    if (!cleanQuery || cleanQuery.length < 5) return [];

    // GDELT domain filter — restrict to independent media domains
    const independentDomains = [
      'theintercept.com', 'propublica.org', 'icij.org', 'occrp.org', 'bellingcat.com',
      'mediapart.fr', 'jacobin.com', 'nakedcapitalism.com', 'roarmag.org',
      'novaramedia.com', 'africaisacountry.com', 'scroll.in', 'thewire.in',
    ];
    const domainFilter = independentDomains.join(' ');

    const encoded = encodeURIComponent(cleanQuery);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encoded}%20domain:${encodeURIComponent(domainFilter)}&mode=ArtList&maxrecords=${Math.min(limit, 250)}&format=json&sort=DateDesc&timespan=30d`;

    const limiter = getRateLimiter('gdelt-independent');
    if (limiter) await limiter.acquire();

    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'NomosX Research Bot (+https://nomosx.com)' },
    });
    if (!res.ok) {
      console.warn(`[SCOUT/GDELT-Independent] HTTP ${res.status}`);
      return [];
    }

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }

    const articles = data.articles || [];
    const results: ScoutNewsResult[] = articles.slice(0, limit).map((a: any) => ({
      id: makeId('gdelt-independent', a.url || a.title || ''),
      provider: 'gdelt-independent',
      type: 'news',
      title: cleanText(a.title || '').slice(0, 500),
      abstract: null,
      url: a.url || null,
      pdfUrl: '',
      year: a.seendate ? parseInt(String(a.seendate).slice(0, 4)) : new Date().getFullYear(),
      authors: [a.domain || ''],
      citationCount: 0,
      oaStatus: 'open',
      documentType: 'article',
      publishedDate: a.seendate || null,
      doi: null,
      topics: ['independent-media'],
      jelCodes: [],
      institutions: [{ name: a.domain || '' }],
      raw: a,
    }));

    return results;
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return [];
    console.warn(`[SCOUT/GDELT-Independent] Error: ${err.message?.slice(0, 100)}`);
    return [];
  }
}

/**
 * Get the list of independent media feeds (for logging/debugging).
 */
export function getIndependentFeeds(): RSSFeed[] {
  return INDEPENDENT_FEEDS;
}
