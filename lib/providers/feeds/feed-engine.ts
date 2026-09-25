/**
 * Mega Feed Engine — shared RSS/Google News feed search for 500+ source registries.
 *
 * Design constraints:
 * - NEVER fires all feeds: selects top-N feeds by domain/keyword match per query.
 * - direct feeds: fetched and filtered locally by query terms.
 * - GN feeds (site: pattern): query terms injected server-side by Google News.
 * - Per-feed hard timeout (Promise.race) so one dead feed can't stall the wave.
 * - Bounded concurrency to avoid socket/rate-limit storms.
 */

import Parser from 'rss-parser';

const parser = new Parser({ timeout: 9000 } as any);

export interface FeedSource {
  url: string;
  provider: string;    // stable provider id, e.g. 'boe', 'le-monde'
  issuer: string;      // display name
  type: string;        // 'report' | 'analysis' | 'article' | 'news' | 'data'
  domains: string[];   // domain tags for routing, e.g. ['economics','eu']
  region?: string;     // 'eu' | 'us' | 'asia' | 'africa' | 'latam' | 'mena' | 'global'
  lang?: string;       // 'en' | 'fr' | 'de' | 'es' | ...
  direct?: boolean;    // true = real RSS; false/absent = Google News site: search
  keywords?: string[]; // extra routing terms (org aliases)
}

export const GN = (site: string, label: string) =>
  `https://news.google.com/rss/search?q=site:${site}+OR+${encodeURIComponent(label)}&hl=en&gl=US&ceid=US:en`;

const FEED_TIMEOUT_MS = 9000;
const CONCURRENCY = 14;

// Host-level circuit breaker: Google News aggressively rate-limits per IP
// (503 bursts). After GN_BREAKER_THRESHOLD consecutive failures we skip all
// remaining GN feeds in the wave instead of burning timeout on each.
const GN_BREAKER_THRESHOLD = 3;
let gnConsecutiveFails = 0;
let gnCircuitOpenUntil = 0; // epoch ms

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('feed-timeout')), ms)),
  ]);
}

/** Score how relevant a feed is for a query (0 = skip). */
function scoreFeed(feed: FeedSource, queryLower: string, terms: string[], domainHint?: string): number {
  let score = 0;
  const hay = `${feed.provider} ${feed.issuer} ${feed.domains.join(' ')} ${feed.keywords?.join(' ') ?? ''}`.toLowerCase();
  for (const t of terms) {
    if (t.length > 3 && hay.includes(t)) score += 2;
  }
  if (domainHint && feed.domains.some(d => d.toLowerCase().includes(domainHint.toLowerCase()))) score += 4;
  // Boost news feeds for time-sensitive / newsy queries
  if (feed.type === 'news' && /\b(latest|news|today|current|crisis|war|election|breaking)\b/.test(queryLower)) score += 2;
  if (feed.type === 'analysis' && /\b(analy|impact|effect|future|scenario|trend|policy|regulat)\b/.test(queryLower)) score += 1;
  return score;
}

/**
 * Search a feed set for a query. Picks at most `maxFeeds` feeds by relevance
 * score; every feed with score > 0 is eligible, top-scored first.
 */
export async function searchFeedSet(
  query: string,
  feeds: FeedSource[],
  opts: { limit?: number; maxFeeds?: number; domainHint?: string } = {},
): Promise<any[]> {
  const limit = opts.limit ?? 25;
  const maxFeeds = opts.maxFeeds ?? 22;
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 3);

  const scored = feeds
    .map(f => ({ f, s: scoreFeed(f, queryLower, queryTerms, opts.domainHint) }))
    .sort((a, b) => b.s - a.s);

  // Keep all positive-scoring feeds up to maxFeeds; if none scored, take a
  // deterministic slice so the registry still contributes coverage.
  let selected = scored.filter(x => x.s > 0).slice(0, maxFeeds).map(x => x.f);
  if (selected.length === 0) {
    selected = scored.filter(x => x.f.type !== 'news').slice(0, Math.ceil(maxFeeds / 3)).map(x => x.f);
    if (selected.length === 0) selected = scored.slice(0, Math.ceil(maxFeeds / 4)).map(x => x.f);
  }

  // If the Google News circuit is open (IP rate-limited), only direct feeds
  // can possibly return — prefer them over higher-scored GN feeds.
  if (Date.now() < gnCircuitOpenUntil) {
    const directs = scored.filter(x => x.f.direct).map(x => x.f);
    const directsIn = selected.filter(f => f.direct);
    const missing = Math.min(maxFeeds, Math.max(maxFeeds, directs.length)) - directsIn.length;
    if (missing > 0) {
      const extra = directs.filter(f => !directsIn.includes(f)).slice(0, missing);
      selected = [...directsIn, ...extra];
    }
  }

  const perFeed = Math.max(2, Math.ceil(limit / selected.length) + 1);
  const out: any[] = [];

  // Bounded concurrency
  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    const batch = selected.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async feed => {
        try {
          let url = feed.url;
          if (!feed.direct) {
            if (Date.now() < gnCircuitOpenUntil) return []; // GN circuit open
            if (queryTerms.length > 0) {
              const q = encodeURIComponent(queryTerms.slice(0, 4).join(' '));
              url = feed.url.replace(/&hl=en/, `+${q}&hl=en`);
            }
          }
          const parsed = await withTimeout(parser.parseURL(url), FEED_TIMEOUT_MS);
          if (!feed.direct) gnConsecutiveFails = 0;
          return (parsed.items || [])
            .filter((item: any) => {
              if (!feed.direct) return true;
              const title = String(item.title || '').toLowerCase();
              const content = String(item.contentSnippet || item.content || '').toLowerCase();
              return queryTerms.some(t => title.includes(t) || content.includes(t));
            })
            .slice(0, perFeed)
            .map((item: any) => {
              let title = String(item.title || 'Untitled');
              let sourceName = feed.issuer;
              if (!feed.direct && title.includes(' - ')) {
                const parts = title.split(' - ');
                title = parts.slice(0, -1).join(' - ');
                sourceName = parts[parts.length - 1];
              }
              return {
                id: `${feed.provider}:feed:${Buffer.from(String(item.link || item.guid || '')).toString('base64').slice(0, 24)}`,
                provider: feed.provider,
                type: feed.type,
                title,
                abstract: item.contentSnippet || item.content || '',
                year: item.pubDate ? new Date(item.pubDate).getFullYear() : new Date().getFullYear(),
                doi: null,
                url: item.link || null,
                pdfUrl: null,
                oaStatus: 'oa',
                authors: [{ name: sourceName }],
                institutions: [{ name: feed.issuer }],
                topics: feed.domains,
                jelCodes: [],
                citationCount: null,
                raw: { source: feed.direct ? 'rss' : 'google-news', feed: feed.provider, domain: feed.domains[0] },
              };
            });
        } catch {
          if (!feed.direct) {
            gnConsecutiveFails++;
            if (gnConsecutiveFails === GN_BREAKER_THRESHOLD) {
              gnCircuitOpenUntil = Date.now() + 10 * 60_000; // 10 min cooldown
              console.warn(`[FEED-ENGINE] Google News circuit open (≥${GN_BREAKER_THRESHOLD} fails) — skipping GN feeds for 10min`);
            }
          }
          return [];
        }
      }),
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') out.push(...r.value);
    }
  }

  return out.slice(0, limit);
}
