/**
 * Global Science & Technology Organizations Provider (V3.1)
 *
 * Hybrid approach: Direct RSS feeds + Google News RSS fallback.
 *
 * Direct RSS (confirmed working):
 * - NASA, ESA, OpenAI, DeepMind, Google Research, Microsoft Research
 *
 * Google News RSS (covers all others):
 * - CERN, NSF, DOE, DARPA, ERC, DFG, Wellcome, Gates,
 *   IEEE, ACM, Royal Society, JST
 */

import Parser from 'rss-parser';
import { httpGet } from '../../../http-client';
import { assertExecutionActive } from '../../../worker/execution-scope';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
  timeout: 15000,
});

interface FeedConfig {
  url: string;
  provider: string;
  issuer: string;
  type: string;
  domain: string;
  direct: boolean;
}

// ─── Direct RSS Feeds (confirmed working) ───────────────────────────────────
const DIRECT_FEEDS: FeedConfig[] = [
  // Big Science
  { url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', provider: 'nasa', issuer: 'NASA', type: 'report', domain: 'space', direct: true },
  { url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News', provider: 'esa', issuer: 'ESA (European Space Agency)', type: 'report', domain: 'space', direct: true },

  // AI Research Labs
  { url: 'https://openai.com/blog/rss.xml', provider: 'openai-research', issuer: 'OpenAI Research', type: 'article', domain: 'ai', direct: true },
  { url: 'https://deepmind.google/blog/rss.xml', provider: 'deepmind', issuer: 'DeepMind Research', type: 'article', domain: 'ai', direct: true },
  { url: 'https://research.google/blog/rss/', provider: 'google-research', issuer: 'Google Research', type: 'article', domain: 'ai', direct: true },
  { url: 'https://www.microsoft.com/en-us/research/feed/', provider: 'msr', issuer: 'Microsoft Research', type: 'article', domain: 'ai', direct: true },
];

// ─── Google News RSS for science orgs without public RSS ────────────────────
const GN_FEEDS: FeedConfig[] = [
  // Big Science
  { url: 'https://news.google.com/rss/search?q=site:home.cern+OR+CERN+particle+physics&hl=en&gl=US&ceid=US:en', provider: 'cern', issuer: 'CERN', type: 'report', domain: 'physics', direct: false },

  // Research Funding Agencies
  { url: 'https://news.google.com/rss/search?q=site:nsf.gov+OR+NSF+National+Science+Foundation&hl=en&gl=US&ceid=US:en', provider: 'nsf', issuer: 'NSF (National Science Foundation)', type: 'report', domain: 'science', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:energy.gov+OR+DOE+Department+Energy&hl=en&gl=US&ceid=US:en', provider: 'doe', issuer: 'US Department of Energy', type: 'report', domain: 'energy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:darpa.mil+OR+DARPA&hl=en&gl=US&ceid=US:en', provider: 'darpa', issuer: 'DARPA', type: 'report', domain: 'defense-tech', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:erc.europa.eu+OR+ERC+European+Research+Council&hl=en&gl=US&ceid=US:en', provider: 'erc', issuer: 'European Research Council', type: 'report', domain: 'science', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:dfg.de+OR+DFG+German+Research+Foundation&hl=en&gl=US&ceid=US:en', provider: 'dfg', issuer: 'DFG (German Research Foundation)', type: 'report', domain: 'science', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:wellcome.org+OR+Wellcome+Trust&hl=en&gl=US&ceid=US:en', provider: 'wellcome', issuer: 'Wellcome Trust', type: 'report', domain: 'health', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:gatesfoundation.org+OR+Gates+Foundation&hl=en&gl=US&ceid=US:en', provider: 'gates', issuer: 'Gates Foundation', type: 'report', domain: 'development', direct: false },

  // Standards Bodies
  { url: 'https://news.google.com/rss/search?q=site:ieee.org+OR+IEEE+engineering&hl=en&gl=US&ceid=US:en', provider: 'ieee', issuer: 'IEEE', type: 'standard', domain: 'engineering', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:acm.org+OR+ACM+computing&hl=en&gl=US&ceid=US:en', provider: 'acm', issuer: 'ACM', type: 'standard', domain: 'computing', direct: false },

  // Royal Society
  { url: 'https://news.google.com/rss/search?q=site:royalsociety.org+OR+Royal+Society&hl=en&gl=US&ceid=US:en', provider: 'royal-society', issuer: 'Royal Society (UK)', type: 'report', domain: 'science', direct: false },

  // Japan Science
  { url: 'https://news.google.com/rss/search?q=site:jst.go.jp+OR+JST+Japan+Science+Technology&hl=en&gl=US&ceid=US:en', provider: 'jst', issuer: 'JST (Japan Science & Technology)', type: 'report', domain: 'science', direct: false },

  // AI Labs (without RSS)
  { url: 'https://news.google.com/rss/search?q=site:ai.meta.com+OR+Meta+AI+research&hl=en&gl=US&ceid=US:en', provider: 'meta-ai', issuer: 'Meta AI Research', type: 'article', domain: 'ai', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:amazon.science+OR+Amazon+Science+research&hl=en&gl=US&ceid=US:en', provider: 'amazon-science', issuer: 'Amazon Science', type: 'article', domain: 'ai', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:anthropic.com+OR+Anthropic+AI+safety&hl=en&gl=US&ceid=US:en', provider: 'anthropic', issuer: 'Anthropic', type: 'article', domain: 'ai', direct: false },
];

const ALL_FEEDS = [...DIRECT_FEEDS, ...GN_FEEDS];

// Failed feeds are memoized for 10min — Google News RSS is called once per
// scout query, and a dead endpoint was observed burning ~30 × 15s timeouts
// inside a single run.
const feedFailures = new Map<string, number>();
const FEED_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Search all science & technology feeds for a query.
 */
export async function searchGlobalScience(query: string, limit = 20): Promise<any[]> {
  assertExecutionActive();
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 3);

  console.log(`[GLOBAL-SCIENCE] Searching ${ALL_FEEDS.length} science/tech feeds for: "${query.slice(0, 60)}..."`);

  const results = await Promise.allSettled(
    ALL_FEEDS.map(async (feedConfig) => {
      if ((feedFailures.get(feedConfig.provider) ?? 0) > Date.now()) return [];
      try {
        let url = feedConfig.url;
        if (!feedConfig.direct && queryTerms.length > 0) {
          const queryEncoded = encodeURIComponent(queryTerms.slice(0, 4).join(' '));
          url = feedConfig.url.replace(/&hl=en/, `+${queryEncoded}&hl=en`);
        }

        assertExecutionActive();
        const xml = await httpGet<string>(url, {
          responseType: 'text', timeout: 15000, retries: 0, cache: false,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NomosXBot/1.0)', Accept: 'application/rss+xml,application/xml,text/xml' },
        });
        assertExecutionActive();
        const feed = await parser.parseString(xml);
        feedFailures.delete(feedConfig.provider);
        const matching = feed.items
          .filter((item: any) => {
            if (!feedConfig.direct) return true;
            const title = String(item.title || '').toLowerCase();
            const content = (item.contentSnippet || item.content || '').toLowerCase();
            return queryTerms.some((term: string) => title.includes(term) || content.includes(term));
          })
          .slice(0, Math.ceil(limit / ALL_FEEDS.length) + 2)
          .map((item: any) => {
            let title = String(item.title || 'Untitled');
            let sourceName = feedConfig.issuer;
            if (!feedConfig.direct && title.includes(' - ')) {
              const parts = title.split(' - ');
              title = parts.slice(0, -1).join(' - ');
              sourceName = parts[parts.length - 1];
            }
            return {
              id: `${feedConfig.provider}:gn:${Buffer.from(item.link || item.guid || '').toString('base64').slice(0, 24)}`,
              provider: feedConfig.provider,
              type: feedConfig.type,
              title,
              abstract: item.contentSnippet || item.content || '',
              year: item.pubDate ? new Date(item.pubDate).getFullYear() : new Date().getFullYear(),
              doi: null,
              url: item.link || null,
              pdfUrl: null,
              oaStatus: 'oa',
              authors: [{ name: sourceName }],
              institutions: [{ name: feedConfig.issuer }],
              topics: [feedConfig.domain],
              jelCodes: [],
              citationCount: null,
              raw: { source: feedConfig.direct ? 'rss' : 'google-news', feed: feedConfig.provider, domain: feedConfig.domain },
            };
          });

        return matching;
      } catch (err: any) {
        assertExecutionActive();
        if (err?.code === 'HTTP_BUDGET_EXHAUSTED') return [];
        feedFailures.set(feedConfig.provider, Date.now() + FEED_FAILURE_COOLDOWN_MS);
        const msg = err.message?.slice(0, 60) || '';
        if (!msg.includes('503') && !msg.includes('403') && !msg.includes('404')) {
          console.warn(`[GLOBAL-SCIENCE] Feed ${feedConfig.provider} failed: ${msg}`);
        }
        return [];
      }
    })
  );

  // allSettled absorbs per-feed rejections — a scope abort thrown inside a
  // callback must still cancel the search, not collapse into an empty result.
  assertExecutionActive();

  const allResults = results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .slice(0, limit);

  console.log(`[GLOBAL-SCIENCE] Got ${allResults.length} matching items from ${ALL_FEEDS.length} feeds`);
  return allResults;
}

export { ALL_FEEDS as SCIENCE_FEEDS };
