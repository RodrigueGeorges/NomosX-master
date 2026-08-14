/**
 * Global Think Tanks, NGOs & Strategic Analysis Provider (V3.1)
 *
 * Hybrid approach: Direct RSS feeds + Google News RSS fallback.
 *
 * Direct RSS (confirmed working):
 * - Amnesty International, Human Rights Watch, Foreign Affairs, Atlantic Council,
 *   Crisis Group, Heritage, GMF, Aspen, CSIS, Hoover
 *
 * Google News RSS (covers all others):
 * - Carnegie, Chatham House, CFR, RAND, Brookings, Cato, CAP, AEI,
 *   Clingendael, IFRI, IRIS, CEPS, EPC, Friends of Europe, ODI, EIU,
 *   Transparency International, Freedom House, RSF, Open Society
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
  domain: string;
  direct: boolean;
}

// ─── Direct RSS Feeds (confirmed working) ───────────────────────────────────
const DIRECT_FEEDS: FeedConfig[] = [
  // NGOs
  { url: 'https://www.amnesty.org/en/feed/', provider: 'amnesty', issuer: 'Amnesty International', type: 'report', domain: 'human-rights', direct: true },
  { url: 'https://www.hrw.org/en/rss/news', provider: 'hrw', issuer: 'Human Rights Watch', type: 'report', domain: 'human-rights', direct: true },

  // US Think Tanks
  { url: 'https://www.foreignaffairs.com/rss.xml', provider: 'foreign-affairs', issuer: 'Foreign Affairs', type: 'article', domain: 'foreign-policy', direct: true },
  { url: 'https://www.atlanticcouncil.org/feed/', provider: 'atlantic-council', issuer: 'Atlantic Council', type: 'analysis', domain: 'geopolitics', direct: true },
  { url: 'https://www.crisisgroup.org/rss.xml', provider: 'crisis-group', issuer: 'International Crisis Group', type: 'analysis', domain: 'conflict', direct: true },
  { url: 'https://www.heritage.org/rss', provider: 'heritage', issuer: 'Heritage Foundation', type: 'analysis', domain: 'policy', direct: true },
  { url: 'https://www.gmfus.org/rss.xml', provider: 'gmf', issuer: 'German Marshall Fund', type: 'analysis', domain: 'transatlantic', direct: true },
  { url: 'https://www.aspeninstitute.org/feed/', provider: 'aspen', issuer: 'Aspen Institute', type: 'analysis', domain: 'policy', direct: true },
  { url: 'https://www.csis.org/rss.xml', provider: 'csis', issuer: 'CSIS (Strategic & International Studies)', type: 'analysis', domain: 'geopolitics', direct: true },
  { url: 'https://www.hoover.org/rss.xml', provider: 'hoover', issuer: 'Hoover Institution', type: 'analysis', domain: 'policy', direct: true },
];

// ─── Google News RSS for think tanks without public RSS ─────────────────────
const GN_FEEDS: FeedConfig[] = [
  // US Think Tanks
  { url: 'https://news.google.com/rss/search?q=site:carnegieendowment.org+OR+Carnegie+Endowment&hl=en&gl=US&ceid=US:en', provider: 'carnegie', issuer: 'Carnegie Endowment', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:cfr.org+OR+Council+Foreign+Relations&hl=en&gl=US&ceid=US:en', provider: 'cfr', issuer: 'Council on Foreign Relations', type: 'analysis', domain: 'foreign-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:rand.org+OR+RAND+Corporation&hl=en&gl=US&ceid=US:en', provider: 'rand', issuer: 'RAND Corporation', type: 'analysis', domain: 'policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:brookings.edu+OR+Brookings+Institution&hl=en&gl=US&ceid=US:en', provider: 'brookings', issuer: 'Brookings Institution', type: 'analysis', domain: 'policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:cato.org+OR+Cato+Institute&hl=en&gl=US&ceid=US:en', provider: 'cato', issuer: 'Cato Institute', type: 'analysis', domain: 'policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:americanprogress.org+OR+Center+American+Progress&hl=en&gl=US&ceid=US:en', provider: 'cap', issuer: 'Center for American Progress', type: 'analysis', domain: 'policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:aei.org+OR+American+Enterprise+Institute&hl=en&gl=US&ceid=US:en', provider: 'aei', issuer: 'American Enterprise Institute', type: 'analysis', domain: 'policy', direct: false },

  // European Think Tanks
  { url: 'https://news.google.com/rss/search?q=site:chathamhouse.org+OR+Chatham+House&hl=en&gl=US&ceid=US:en', provider: 'chatham-house', issuer: 'Chatham House', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:clingendael.org+OR+Clingendael&hl=en&gl=US&ceid=US:en', provider: 'clingendael', issuer: 'Clingendael (Netherlands)', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:ifri.org+OR+IFRI+relations+internationales&hl=en&gl=US&ceid=US:en', provider: 'ifri', issuer: 'IFRI (France)', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:iris-france.org+OR+IRIS+strategiques&hl=en&gl=US&ceid=US:en', provider: 'iris', issuer: 'IRIS (France)', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:ceps.eu+OR+CEPS+European+policy&hl=en&gl=US&ceid=US:en', provider: 'ceps', issuer: 'CEPS (European Policy Studies)', type: 'analysis', domain: 'eu-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:epc.eu+OR+European+Policy+Centre&hl=en&gl=US&ceid=US:en', provider: 'epc', issuer: 'European Policy Centre', type: 'analysis', domain: 'eu-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:friendsofeurope.org+OR+Friends+Europe&hl=en&gl=US&ceid=US:en', provider: 'foe', issuer: 'Friends of Europe', type: 'analysis', domain: 'eu-policy', direct: false },

  // Development & Economics
  { url: 'https://news.google.com/rss/search?q=site:odi.org+OR+Overseas+Development+Institute&hl=en&gl=US&ceid=US:en', provider: 'odi', issuer: 'Overseas Development Institute', type: 'report', domain: 'development', direct: false },

  // NGOs (without RSS)
  { url: 'https://news.google.com/rss/search?q=site:transparency.org+OR+Transparency+International+corruption&hl=en&gl=US&ceid=US:en', provider: 'transparency', issuer: 'Transparency International', type: 'report', domain: 'corruption', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:freedomhouse.org+OR+Freedom+House+democracy&hl=en&gl=US&ceid=US:en', provider: 'freedom-house', issuer: 'Freedom House', type: 'report', domain: 'democracy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:rsf.org+OR+Reporters+Without+Borders+press+freedom&hl=en&gl=US&ceid=US:en', provider: 'rsf', issuer: 'Reporters Without Borders', type: 'report', domain: 'press-freedom', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:opensocietyfoundations.org+OR+Open+Society+Foundations&hl=en&gl=US&ceid=US:en', provider: 'osf', issuer: 'Open Society Foundations', type: 'report', domain: 'democracy', direct: false },
];

const ALL_FEEDS = [...DIRECT_FEEDS, ...GN_FEEDS];

/**
 * Search all think tank feeds for a query.
 */
export async function searchGlobalThinkTanks(query: string, limit = 25): Promise<any[]> {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 3);

  console.log(`[GLOBAL-THINKTANKS] Searching ${ALL_FEEDS.length} think tank feeds for: "${query.slice(0, 60)}..."`);

  const results = await Promise.allSettled(
    ALL_FEEDS.map(async (feedConfig) => {
      try {
        let url = feedConfig.url;
        if (!feedConfig.direct && queryTerms.length > 0) {
          const queryEncoded = encodeURIComponent(queryTerms.slice(0, 4).join(' '));
          url = feedConfig.url.replace(/&hl=en/, `+${queryEncoded}&hl=en`);
        }

        const feed = await parser.parseURL(url);
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
        console.warn(`[GLOBAL-THINKTANKS] Feed ${feedConfig.provider} failed: ${err.message?.slice(0, 60)}`);
        return [];
      }
    })
  );

  const allResults = results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .slice(0, limit);

  console.log(`[GLOBAL-THINKTANKS] Got ${allResults.length} matching items from ${ALL_FEEDS.length} feeds`);
  return allResults;
}

export { ALL_FEEDS as THINKTANK_FEEDS };
