/**
 * Global International Organizations Provider (V3.1)
 *
 * Hybrid approach: Direct RSS feeds + Google News RSS fallback.
 *
 * Direct RSS (confirmed working):
 * - WHO (World Health Organization)
 *
 * Google News RSS (covers all others):
 * - WTO, WIPO, UNHCR, IOM, UNICEF, OCHA, IFRC, UNEP, ILO, ITU,
 *   ICAO, IMO, WMO, IFAD, UNIDO, UN-Habitat, UN Women, UN, UNDP, UNCTAD
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
  { url: 'https://www.who.int/rss-feeds/news-english.xml', provider: 'who', issuer: 'WHO (World Health Organization)', type: 'report', domain: 'health', direct: true },
];

// ─── Google News RSS for organizations without public RSS ───────────────────
const GN_FEEDS: FeedConfig[] = [
  // Trade & Intellectual Property
  { url: 'https://news.google.com/rss/search?q=site:wto.org+OR+WTO+World+Trade+Organization&hl=en&gl=US&ceid=US:en', provider: 'wto', issuer: 'WTO (World Trade Organization)', type: 'report', domain: 'trade', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:wipo.int+OR+WIPO+intellectual+property&hl=en&gl=US&ceid=US:en', provider: 'wipo', issuer: 'WIPO (World Intellectual Property)', type: 'report', domain: 'ip', direct: false },

  // Humanitarian & Migration
  { url: 'https://news.google.com/rss/search?q=site:unhcr.org+OR+UNHCR+refugees&hl=en&gl=US&ceid=US:en', provider: 'unhcr', issuer: 'UNHCR (UN Refugee Agency)', type: 'report', domain: 'humanitarian', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:iom.int+OR+IOM+migration&hl=en&gl=US&ceid=US:en', provider: 'iom', issuer: 'IOM (Migration)', type: 'report', domain: 'migration', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:unicef.org+OR+UNICEF+children&hl=en&gl=US&ceid=US:en', provider: 'unicef', issuer: 'UNICEF', type: 'report', domain: 'children', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:unocha.org+OR+OCHA+humanitarian&hl=en&gl=US&ceid=US:en', provider: 'ocha', issuer: 'OCHA (Humanitarian Affairs)', type: 'report', domain: 'humanitarian', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:ifrc.org+OR+Red+Cross+Red+Crescent+Federation&hl=en&gl=US&ceid=US:en', provider: 'ifrc', issuer: 'IFRC (Red Cross/Red Crescent)', type: 'report', domain: 'humanitarian', direct: false },

  // Arms Control & Disarmament
  { url: 'https://news.google.com/rss/search?q=site:un.org+disarmament+OR+UNODA&hl=en&gl=US&ceid=US:en', provider: 'unoda', issuer: 'UNODA (Disarmament)', type: 'report', domain: 'disarmament', direct: false },

  // Environment
  { url: 'https://news.google.com/rss/search?q=site:unep.org+OR+UNEP+environment+programme&hl=en&gl=US&ceid=US:en', provider: 'unep', issuer: 'UNEP (Environment)', type: 'report', domain: 'environment', direct: false },

  // Labour & Standards
  { url: 'https://news.google.com/rss/search?q=site:ilo.org+OR+ILO+labour+organization&hl=en&gl=US&ceid=US:en', provider: 'ilo', issuer: 'ILO (Labour Organization)', type: 'report', domain: 'labour', direct: false },

  // Telecom & Technology
  { url: 'https://news.google.com/rss/search?q=site:itu.int+OR+ITU+telecommunications&hl=en&gl=US&ceid=US:en', provider: 'itu', issuer: 'ITU (Telecommunications)', type: 'report', domain: 'technology', direct: false },

  // Transport
  { url: 'https://news.google.com/rss/search?q=site:icao.int+OR+ICAO+civil+aviation&hl=en&gl=US&ceid=US:en', provider: 'icao', issuer: 'ICAO (Civil Aviation)', type: 'report', domain: 'transport', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:imo.org+OR+IMO+maritime+organization&hl=en&gl=US&ceid=US:en', provider: 'imo', issuer: 'IMO (Maritime)', type: 'report', domain: 'transport', direct: false },

  // Meteorology & Climate
  { url: 'https://news.google.com/rss/search?q=site:wmo.int+OR+WMO+meteorology&hl=en&gl=US&ceid=US:en', provider: 'wmo', issuer: 'WMO (Meteorology)', type: 'report', domain: 'climate', direct: false },

  // Agriculture & Development
  { url: 'https://news.google.com/rss/search?q=site:ifad.org+OR+IFAD+agricultural+development&hl=en&gl=US&ceid=US:en', provider: 'ifad', issuer: 'IFAD (Agricultural Development)', type: 'report', domain: 'agriculture', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:unido.org+OR+UNIDO+industrial+development&hl=en&gl=US&ceid=US:en', provider: 'unido', issuer: 'UNIDO (Industrial Development)', type: 'report', domain: 'development', direct: false },

  // Urban & Gender
  { url: 'https://news.google.com/rss/search?q=site:unhabitat.org+OR+UN+Habitat+urban&hl=en&gl=US&ceid=US:en', provider: 'un-habitat', issuer: 'UN-Habitat (Urban)', type: 'report', domain: 'urban', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:unwomen.org+OR+UN+Women+gender&hl=en&gl=US&ceid=US:en', provider: 'un-women', issuer: 'UN Women', type: 'report', domain: 'gender', direct: false },

  // Multilateral
  { url: 'https://news.google.com/rss/search?q=site:un.org+OR+United+Nations&hl=en&gl=US&ceid=US:en', provider: 'un', issuer: 'United Nations', type: 'report', domain: 'multilateral', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:undp.org+OR+UNDP+development+programme&hl=en&gl=US&ceid=US:en', provider: 'undp', issuer: 'UNDP (Development Programme)', type: 'report', domain: 'development', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:unctad.org+OR+UNCTAD+trade+development&hl=en&gl=US&ceid=US:en', provider: 'unctad', issuer: 'UNCTAD (Trade & Development)', type: 'report', domain: 'trade', direct: false },

  // Economic
  { url: 'https://news.google.com/rss/search?q=site:oecd.org+OR+OECD&hl=en&gl=US&ceid=US:en', provider: 'oecd', issuer: 'OECD', type: 'report', domain: 'economics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:imf.org+OR+IMF+International+Monetary+Fund&hl=en&gl=US&ceid=US:en', provider: 'imf', issuer: 'IMF (International Monetary Fund)', type: 'report', domain: 'economics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:worldbank.org+OR+World+Bank&hl=en&gl=US&ceid=US:en', provider: 'worldbank', issuer: 'World Bank', type: 'report', domain: 'economics', direct: false },
];

const ALL_FEEDS = [...DIRECT_FEEDS, ...GN_FEEDS];

// Failed feeds are memoized for 10min — these aggregators are called once per
// scout query variation, and a dead endpoint would otherwise burn one request
// per variation for the whole node.
const feedFailures = new Map<string, number>();
const FEED_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Search all international organization feeds for a query.
 */
export async function searchGlobalOrgs(query: string, limit = 25): Promise<any[]> {
  assertExecutionActive();
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 3);

  console.log(`[GLOBAL-ORGS] Searching ${ALL_FEEDS.length} international org feeds for: "${query.slice(0, 60)}..."`);

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
        // Suppress warnings for Google News 503 (known IP blocking issue) and 403/404 (dead feeds)
        const msg = err.message?.slice(0, 60) || '';
        if (!msg.includes('503') && !msg.includes('403') && !msg.includes('404')) {
          console.warn(`[GLOBAL-ORGS] Feed ${feedConfig.provider} failed: ${msg}`);
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

  console.log(`[GLOBAL-ORGS] Got ${allResults.length} matching items from ${ALL_FEEDS.length} feeds`);
  return allResults;
}

export { ALL_FEEDS as ORG_FEEDS };
