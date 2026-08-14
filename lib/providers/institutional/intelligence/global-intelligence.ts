/**
 * Global Intelligence & Security Providers (V3.1)
 *
 * Hybrid approach: Direct RSS feeds + Google News RSS fallback
 * for organizations that don't have public RSS or block bots.
 *
 * Direct RSS (confirmed working):
 * - Bellingcat (OSINT investigations)
 *
 * Google News RSS (covers all others):
 * - MI5, GCHQ, CSIS Canada, ASIO, Europol, Interpol, Frontex
 * - IISS, SIPRI, ICC, ICJ, OPCW, CTBTO
 * - BND (via Bundestag), DGSE (via Assemblée/Sénat)
 */

import Parser from 'rss-parser';

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
  direct: boolean; // true = direct RSS, false = Google News RSS
}

// ─── Direct RSS Feeds (confirmed working) ───────────────────────────────────
const DIRECT_FEEDS: FeedConfig[] = [
  { url: 'https://www.bellingcat.com/feed/', provider: 'bellingcat', issuer: 'Bellingcat (OSINT)', type: 'investigation', direct: true },
];

// ─── Google News RSS for organizations without public RSS ───────────────────
const GN_FEEDS: FeedConfig[] = [
  // UK Intelligence
  { url: 'https://news.google.com/rss/search?q=site:mi5.gov.uk+OR+MI5+security+service&hl=en&gl=US&ceid=US:en', provider: 'mi5', issuer: 'MI5 (UK Security Service)', type: 'threat-assessment', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:gchq.gov.uk+OR+GCHQ&hl=en&gl=US&ceid=US:en', provider: 'gchq', issuer: 'GCHQ (UK)', type: 'report', direct: false },

  // EU Intelligence & Law Enforcement
  { url: 'https://news.google.com/rss/search?q=site:europol.europa.eu+OR+Europol&hl=en&gl=US&ceid=US:en', provider: 'europol', issuer: 'Europol', type: 'report', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:interpol.int+OR+Interpol&hl=en&gl=US&ceid=US:en', provider: 'interpol', issuer: 'Interpol', type: 'report', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:frontex.europa.eu+OR+Frontex&hl=en&gl=US&ceid=US:en', provider: 'frontex', issuer: 'Frontex (EU Border)', type: 'report', direct: false },

  // Canada & Australia
  { url: 'https://news.google.com/rss/search?q=site:csis-scrs.gc.ca+OR+CSIS+Canada+intelligence&hl=en&gl=US&ceid=US:en', provider: 'csis-canada', issuer: 'CSIS (Canada)', type: 'report', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:asio.gov.au+OR+ASIO+Australia+intelligence&hl=en&gl=US&ceid=US:en', provider: 'asio', issuer: 'ASIO (Australia)', type: 'report', direct: false },

  // Defense Intelligence Analysis
  { url: 'https://news.google.com/rss/search?q=site:iiss.org+OR+IISS+strategic+studies&hl=en&gl=US&ceid=US:en', provider: 'iiss', issuer: 'IISS (Strategic Studies)', type: 'report', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:sipri.org+OR+SIPRI+peace+research&hl=en&gl=US&ceid=US:en', provider: 'sipri', issuer: 'SIPRI (Peace Research)', type: 'report', direct: false },

  // German BND (via Bundestag oversight)
  { url: 'https://news.google.com/rss/search?q=site:bundestag.de+BND+OR+Nachrichtendienst&hl=en&gl=US&ceid=US:en', provider: 'bnd-oversight', issuer: 'BND Parliamentary Oversight (Bundestag)', type: 'oversight-report', direct: false },

  // French intelligence oversight
  { url: 'https://news.google.com/rss/search?q=site:assemblee-nationale.fr+renseignement+OR+DGSE+OR+ANSSI&hl=fr&gl=FR&ceid=FR:fr', provider: 'fr-intel-oversight', issuer: 'Assemblée Nationale (Commission Renseignement)', type: 'oversight-report', direct: false },

  // International Law & Justice
  { url: 'https://news.google.com/rss/search?q=site:icc-cpi.int+OR+ICC+Criminal+Court&hl=en&gl=US&ceid=US:en', provider: 'icc', issuer: 'ICC (Criminal Court)', type: 'report', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:icj-cij.org+OR+ICJ+International+Court+Justice&hl=en&gl=US&ceid=US:en', provider: 'icj', issuer: 'ICJ (International Court of Justice)', type: 'report', direct: false },

  // Arms Control
  { url: 'https://news.google.com/rss/search?q=site:opcw.org+OR+OPCW+chemical+weapons&hl=en&gl=US&ceid=US:en', provider: 'opcw', issuer: 'OPCW (Chemical Weapons)', type: 'report', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:ctbto.org+OR+CTBTO+nuclear+test+ban&hl=en&gl=US&ceid=US:en', provider: 'ctbto', issuer: 'CTBTO (Nuclear Test Ban)', type: 'report', direct: false },
];

const ALL_FEEDS = [...DIRECT_FEEDS, ...GN_FEEDS];

/**
 * Search all global intelligence feeds for a query.
 * For direct RSS: filters items by keyword match.
 * For Google News RSS: the query is already in the search URL for GN feeds,
 * but we also filter by keyword for direct feeds.
 */
export async function searchGlobalIntelligence(query: string, limit = 20): Promise<any[]> {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 3);

  console.log(`[GLOBAL-INTELLIGENCE] Searching ${ALL_FEEDS.length} intelligence feeds for: "${query.slice(0, 60)}..."`);

  const results = await Promise.allSettled(
    ALL_FEEDS.map(async (feedConfig) => {
      try {
        // For Google News feeds, inject the query into the search URL
        let url = feedConfig.url;
        if (!feedConfig.direct && queryTerms.length > 0) {
          // Add query terms to the Google News search
          const queryEncoded = encodeURIComponent(queryTerms.slice(0, 4).join(' '));
          url = feedConfig.url.replace(/&hl=en/, `+${queryEncoded}&hl=en`).replace(/&hl=fr/, `+${queryEncoded}&hl=fr`);
        }

        const feed = await parser.parseURL(url);
        const matching = feed.items
          .filter((item: any) => {
            if (!feedConfig.direct) return true; // Google News already filtered by query
            const title = String(item.title || '').toLowerCase();
            const content = (item.contentSnippet || item.content || '').toLowerCase();
            return queryTerms.some((term: string) => title.includes(term) || content.includes(term));
          })
          .slice(0, Math.ceil(limit / ALL_FEEDS.length) + 3)
          .map((item: any) => {
            // Google News titles are like "Source: Article Title" — extract the real title
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
              topics: [],
              jelCodes: [],
              citationCount: null,
              raw: { source: feedConfig.direct ? 'rss' : 'google-news', feed: feedConfig.provider },
            };
          });

        return matching;
      } catch (err: any) {
        console.warn(`[GLOBAL-INTELLIGENCE] Feed ${feedConfig.provider} failed: ${err.message?.slice(0, 60)}`);
        return [];
      }
    })
  );

  const allResults = results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .slice(0, limit);

  console.log(`[GLOBAL-INTELLIGENCE] Got ${allResults.length} matching items from ${ALL_FEEDS.length} feeds`);
  return allResults;
}

export { ALL_FEEDS as INTELLIGENCE_FEEDS };
