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
  // NGOs
  { url: 'https://www.amnesty.org/en/feed/', provider: 'amnesty', issuer: 'Amnesty International', type: 'report', domain: 'human-rights', direct: true },
  { url: 'https://www.hrw.org/en/rss/news', provider: 'hrw', issuer: 'Human Rights Watch', type: 'report', domain: 'human-rights', direct: true },

  // US Think Tanks — direct RSS feeds (tested 2026-08-15)
  { url: 'https://www.foreignaffairs.com/rss.xml', provider: 'foreign-affairs', issuer: 'Foreign Affairs', type: 'article', domain: 'foreign-policy', direct: true },
  { url: 'https://www.atlanticcouncil.org/feed/', provider: 'atlantic-council', issuer: 'Atlantic Council', type: 'analysis', domain: 'geopolitics', direct: true },
  { url: 'https://www.crisisgroup.org/rss.xml', provider: 'crisis-group', issuer: 'International Crisis Group', type: 'analysis', domain: 'conflict', direct: true },
  { url: 'https://www.heritage.org/rss', provider: 'heritage', issuer: 'Heritage Foundation', type: 'analysis', domain: 'policy', direct: true },
  { url: 'https://www.gmfus.org/rss.xml', provider: 'gmf', issuer: 'German Marshall Fund', type: 'analysis', domain: 'transatlantic', direct: true },
  { url: 'https://www.aspeninstitute.org/feed/', provider: 'aspen', issuer: 'Aspen Institute', type: 'analysis', domain: 'policy', direct: true },
  { url: 'https://www.csis.org/rss.xml', provider: 'csis', issuer: 'CSIS (Strategic & International Studies)', type: 'analysis', domain: 'geopolitics', direct: true },
  { url: 'https://www.hoover.org/feed', provider: 'hoover', issuer: 'Hoover Institution', type: 'analysis', domain: 'policy', direct: true },
  // Brookings & Carnegie killed their RSS feeds (brookings.edu/feed → 302 to
  // homepage, carnegieendowment.org/feed → HTML shell). Moved to GN_FEEDS below.
  { url: 'https://www.aei.org/feed/', provider: 'aei', issuer: 'American Enterprise Institute', type: 'analysis', domain: 'policy', direct: true },

  // European Think Tanks — direct RSS feeds (tested 2026-08-15)
  { url: 'https://www.clingendael.org/rss.xml', provider: 'clingendael', issuer: 'Clingendael (Netherlands)', type: 'analysis', domain: 'geopolitics', direct: true },

  // NGOs (direct RSS — tested 2026-08-15)
  { url: 'https://freedomhouse.org/rss.xml', provider: 'freedom-house', issuer: 'Freedom House', type: 'report', domain: 'democracy', direct: true },

  // Authority expansion (feed URLs verified live 2026-11-14) — the free
  // replacement for paid search: tech policy, EU official, French sources.
  { url: 'https://www.bruegel.org/rss.xml', provider: 'bruegel', issuer: 'Bruegel', type: 'analysis', domain: 'eu-policy', direct: true },
  { url: 'https://www.aspi.org.au/feed/', provider: 'aspi', issuer: 'Australian Strategic Policy Institute', type: 'analysis', domain: 'tech-policy', direct: true },
  { url: 'https://itif.org/feed/', provider: 'itif', issuer: 'ITIF (Information Technology & Innovation Foundation)', type: 'analysis', domain: 'tech-policy', direct: true },
  { url: 'https://www.lowyinstitute.org/the-interpreter/rss.xml', provider: 'lowy', issuer: 'Lowy Institute', type: 'analysis', domain: 'geopolitics', direct: true },
  { url: 'https://www.strategie.gouv.fr/rss.xml', provider: 'france-strategie', issuer: 'France Stratégie', type: 'report', domain: 'fr-policy', direct: true },
  { url: 'https://ec.europa.eu/commission/presscorner/api/rss?language=en', provider: 'eu-commission', issuer: 'European Commission (press corner)', type: 'report', domain: 'eu-policy', direct: true },
  { url: 'https://www.stimson.org/feed/', provider: 'stimson', issuer: 'Stimson Center', type: 'analysis', domain: 'security', direct: true },
  { url: 'https://www.foreignpolicy.com/feed/', provider: 'foreign-policy', issuer: 'Foreign Policy', type: 'article', domain: 'foreign-policy', direct: true },
  { url: 'https://www.economist.com/latest/rss.xml', provider: 'economist', issuer: 'The Economist', type: 'article', domain: 'economics', direct: true },
  { url: 'https://www.ifri.org/fr/rss.xml', provider: 'ifri', issuer: 'IFRI (Institut français des relations internationales)', type: 'analysis', domain: 'geopolitics', direct: true },

  // Domain expansion (feed URLs verified live 2026-11-14) — science,
  // health, climate/energy, economics, humanitarian. Balances the
  // foreign-policy skew so non-geopolitics questions get authority too.
  // ── Science & technology ──
  { url: 'https://www.science.org/rss/news_current.xml', provider: 'science-mag', issuer: 'Science (AAAS)', type: 'article', domain: 'science', direct: true },
  { url: 'https://www.newscientist.com/feed/home/', provider: 'newscientist', issuer: 'New Scientist', type: 'article', domain: 'science', direct: true },
  { url: 'https://www.quantamagazine.org/feed/', provider: 'quanta', issuer: 'Quanta Magazine', type: 'article', domain: 'science', direct: true },
  { url: 'https://spectrum.ieee.org/feeds/feed.rss', provider: 'ieee-spectrum', issuer: 'IEEE Spectrum', type: 'article', domain: 'tech-policy', direct: true },
  { url: 'https://arstechnica.com/feed/', provider: 'arstechnica', issuer: 'Ars Technica', type: 'article', domain: 'technology', direct: true },
  { url: 'https://www.technologyreview.com/feed/', provider: 'mit-tech-review', issuer: 'MIT Technology Review', type: 'article', domain: 'technology', direct: true },
  { url: 'https://www.eetimes.com/feed/', provider: 'ee-times', issuer: 'EE Times', type: 'article', domain: 'semiconductors', direct: true },
  { url: 'https://www.eenewseurope.com/feed/', provider: 'eenews-europe', issuer: 'EENews Europe', type: 'article', domain: 'energy', direct: true },
  { url: 'https://www.tomshardware.com/feeds/all', provider: 'tomshardware', issuer: 'Tom\'s Hardware', type: 'article', domain: 'technology', direct: true },
  // ── Health ──
  { url: 'https://www.who.int/rss-feeds/news-english.xml', provider: 'who-news', issuer: 'World Health Organization', type: 'report', domain: 'health', direct: true },
  // ── Climate & energy ──
  { url: 'https://www.carbonbrief.org/feed/', provider: 'carbon-brief', issuer: 'Carbon Brief', type: 'analysis', domain: 'climate', direct: true },
  { url: 'https://www.climatechangenews.com/feed/', provider: 'climate-change-news', issuer: 'Climate Home News', type: 'article', domain: 'climate', direct: true },
  { url: 'https://energyandcleanair.org/feed/', provider: 'energy-clean-air', issuer: 'Energy & Clean Air', type: 'analysis', domain: 'climate', direct: true },
  { url: 'https://www.canarymedia.com/feed', provider: 'canary-media', issuer: 'Canary Media', type: 'article', domain: 'energy', direct: true },
  { url: 'https://www.utilitydive.com/feeds/news/', provider: 'utility-dive', issuer: 'Utility Dive', type: 'article', domain: 'energy', direct: true },
  { url: 'https://www.pv-magazine.com/feed/', provider: 'pv-magazine', issuer: 'PV Magazine', type: 'article', domain: 'energy', direct: true },
  // ── Economics ──
  { url: 'https://voxeu.org/rss.xml', provider: 'voxeu', issuer: 'VoxEU / CEPR', type: 'analysis', domain: 'economics', direct: true },
  // ── Humanitarian & development ──
  { url: 'https://reliefweb.int/updates/rss.xml', provider: 'reliefweb', issuer: 'ReliefWeb (UN OCHA)', type: 'report', domain: 'humanitarian', direct: true },
  { url: 'https://www.afdb.org/en/rss.xml', provider: 'afdb', issuer: 'African Development Bank', type: 'report', domain: 'development', direct: true },
  { url: 'https://www.socialeurope.eu/feed/', provider: 'social-europe', issuer: 'Social Europe', type: 'analysis', domain: 'social-policy', direct: true },
  { url: 'https://www.globalpolicy.org/rss.xml', provider: 'globalpolicy', issuer: 'Global Policy Forum', type: 'analysis', domain: 'multilateral', direct: true },
];

// ─── Google News RSS fallback for think tanks without public RSS ────────────
// NOTE: Google News RSS returns 503 from some IPs. These feeds are fallbacks
// and will silently fail without blocking the pipeline.
const GN_FEEDS: FeedConfig[] = [
  // US Think Tanks (no direct RSS found)
  { url: 'https://news.google.com/rss/search?q=site:cfr.org+OR+Council+Foreign+Relations&hl=en&gl=US&ceid=US:en', provider: 'cfr', issuer: 'Council on Foreign Relations', type: 'analysis', domain: 'foreign-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:rand.org+OR+RAND+Corporation&hl=en&gl=US&ceid=US:en', provider: 'rand', issuer: 'RAND Corporation', type: 'analysis', domain: 'policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:cato.org+OR+Cato+Institute&hl=en&gl=US&ceid=US:en', provider: 'cato', issuer: 'Cato Institute', type: 'analysis', domain: 'policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:brookings.edu+OR+Brookings+Institution&hl=en&gl=US&ceid=US:en', provider: 'brookings', issuer: 'Brookings Institution', type: 'analysis', domain: 'policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:carnegieendowment.org+OR+Carnegie+Endowment&hl=en&gl=US&ceid=US:en', provider: 'carnegie', issuer: 'Carnegie Endowment', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:americanprogress.org+OR+Center+American+Progress&hl=en&gl=US&ceid=US:en', provider: 'cap', issuer: 'Center for American Progress', type: 'analysis', domain: 'policy', direct: false },

  // European Think Tanks (no direct RSS found)
  { url: 'https://news.google.com/rss/search?q=site:chathamhouse.org+OR+Chatham+House&hl=en&gl=US&ceid=US:en', provider: 'chatham-house', issuer: 'Chatham House', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:ifri.org+OR+IFRI+relations+internationales&hl=en&gl=US&ceid=US:en', provider: 'ifri-gn', issuer: 'IFRI (France)', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:iris-france.org+OR+IRIS+strategiques&hl=en&gl=US&ceid=US:en', provider: 'iris', issuer: 'IRIS (France)', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:ceps.eu+OR+CEPS+European+policy&hl=en&gl=US&ceid=US:en', provider: 'ceps', issuer: 'CEPS (European Policy Studies)', type: 'analysis', domain: 'eu-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:epc.eu+OR+European+Policy+Centre&hl=en&gl=US&ceid=US:en', provider: 'epc', issuer: 'European Policy Centre', type: 'analysis', domain: 'eu-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:friendsofeurope.org+OR+Friends+Europe&hl=en&gl=US&ceid=US:en', provider: 'foe', issuer: 'Friends of Europe', type: 'analysis', domain: 'eu-policy', direct: false },

  // Development & Economics
  { url: 'https://news.google.com/rss/search?q=site:odi.org+OR+Overseas+Development+Institute&hl=en&gl=US&ceid=US:en', provider: 'odi', issuer: 'Overseas Development Institute', type: 'report', domain: 'development', direct: false },

  // NGOs (without RSS)
  { url: 'https://news.google.com/rss/search?q=site:transparency.org+OR+Transparency+International+corruption&hl=en&gl=US&ceid=US:en', provider: 'transparency', issuer: 'Transparency International', type: 'report', domain: 'corruption', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:rsf.org+OR+Reporters+Without+Borders+press+freedom&hl=en&gl=US&ceid=US:en', provider: 'rsf', issuer: 'Reporters Without Borders', type: 'report', domain: 'press-freedom', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:opensocietyfoundations.org+OR+Open+Society+Foundations&hl=en&gl=US&ceid=US:en', provider: 'osf', issuer: 'Open Society Foundations', type: 'report', domain: 'democracy', direct: false },

  // Technology & industrial policy — the gap paid search used to fill
  { url: 'https://news.google.com/rss/search?q=site:aspistrategist.org.au+OR+Australian+Strategic+Policy&hl=en&gl=US&ceid=US:en', provider: 'aspi', issuer: 'Australian Strategic Policy Institute', type: 'analysis', domain: 'tech-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:itif.org+OR+Information+Technology+Innovation+Foundation&hl=en&gl=US&ceid=US:en', provider: 'itif', issuer: 'ITIF (Information Technology & Innovation Foundation)', type: 'analysis', domain: 'tech-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:cnas.org+OR+Center+for+New+American+Security&hl=en&gl=US&ceid=US:en', provider: 'cnas', issuer: 'Center for New American Security', type: 'analysis', domain: 'security', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:iiss.org+OR+International+Institute+Strategic+Studies&hl=en&gl=US&ceid=US:en', provider: 'iiss', issuer: 'IISS (International Institute for Strategic Studies)', type: 'analysis', domain: 'security', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:lowyinstitute.org+OR+Lowy+Institute&hl=en&gl=US&ceid=US:en', provider: 'lowy', issuer: 'Lowy Institute', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:semi.org+OR+SEMI+semiconductor+industry&hl=en&gl=US&ceid=US:en', provider: 'semi', issuer: 'SEMI (semiconductor industry association)', type: 'report', domain: 'semiconductors', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:sia-online.org+OR+Semiconductor+Industry+Association&hl=en&gl=US&ceid=US:en', provider: 'sia', issuer: 'Semiconductor Industry Association', type: 'report', domain: 'semiconductors', direct: false },

  // EU policy & economics
  { url: 'https://news.google.com/rss/search?q=site:bruegel.org+OR+Bruegel+European+think+tank&hl=en&gl=US&ceid=US:en', provider: 'bruegel', issuer: 'Bruegel', type: 'analysis', domain: 'eu-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:ecfr.eu+OR+European+Council+Foreign+Relations&hl=en&gl=US&ceid=US:en', provider: 'ecfr', issuer: 'ECFR (European Council on Foreign Relations)', type: 'analysis', domain: 'eu-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:swp-berlin.org+OR+Stiftung+Wissenschaft+Politik&hl=en&gl=US&ceid=US:en', provider: 'swp', issuer: 'SWP (German Institute for International and Security Affairs)', type: 'analysis', domain: 'geopolitics', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:orfonline.org+OR+Observer+Research+Foundation&hl=en&gl=US&ceid=US:en', provider: 'orf', issuer: 'Observer Research Foundation', type: 'analysis', domain: 'geopolitics', direct: false },

  // French & EU official sources
  { url: 'https://news.google.com/rss/search?q=site:vie-publique.fr+OR+conseil+constitutionnel+france&hl=en&gl=US&ceid=US:en', provider: 'vie-publique', issuer: 'Vie Publique (French government publications)', type: 'report', domain: 'fr-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:consilium.europa.eu+OR+Council+of+the+European+Union&hl=en&gl=US&ceid=US:en', provider: 'consilium', issuer: 'Council of the EU', type: 'report', domain: 'eu-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:commission.europa.eu+OR+European+Commission&hl=en&gl=US&ceid=US:en', provider: 'eu-commission-gn', issuer: 'European Commission', type: 'report', domain: 'eu-policy', direct: false },
  { url: 'https://news.google.com/rss/search?q=site:eeas.europa.eu+OR+European+External+Action+Service&hl=en&gl=US&ceid=US:en', provider: 'eeas', issuer: 'EEAS (European External Action Service)', type: 'report', domain: 'eu-policy', direct: false },
];

const ALL_FEEDS = [...DIRECT_FEEDS, ...GN_FEEDS];

function mapFeedItem(item: any, feedConfig: FeedConfig) {
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
}

function selectMatches(items: any[], feedConfig: FeedConfig, queryTerms: string[], limit: number) {
  return items
    .filter((item: any) => {
      if (!feedConfig.direct) return true;
      const title = String(item.title || '').toLowerCase();
      const content = (item.contentSnippet || item.content || '').toLowerCase();
      return queryTerms.some((term: string) => title.includes(term) || content.includes(term));
    })
    .slice(0, Math.ceil(limit / ALL_FEEDS.length) + 2)
    .map((item: any) => mapFeedItem(item, feedConfig));
}

// Failed feeds are memoized for 10min — Google News RSS is called once per
// scout query variation, and a dead endpoint (e.g. hoover.org returning a
// parse-breaking payload) was observed burning one failure per variation.
const feedFailures = new Map<string, number>();
const FEED_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;

// Successful fetches are memoized too: the same 40+ feeds were re-fetched
// for every scout query variation (~12/run), burning the HTTP budget on
// identical payloads. Feed content is stable within a run window; the
// per-query term filter below still applies to cached items.
const FEED_CACHE_TTL_MS = 10 * 60 * 1000;
const feedCache = new Map<string, { ts: number; items: any[] }>();

/**
 * Search all think tank feeds for a query.
 */
export async function searchGlobalThinkTanks(query: string, limit = 25): Promise<any[]> {
  assertExecutionActive();
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 3);

  console.log(`[GLOBAL-THINKTANKS] Searching ${ALL_FEEDS.length} think tank feeds for: "${query.slice(0, 60)}..."`);

  const results = await Promise.allSettled(
    ALL_FEEDS.map(async (feedConfig) => {
      if ((feedFailures.get(feedConfig.provider) ?? 0) > Date.now()) return [];
      // Only direct feeds are cacheable: GN feed items are already
      // query-scoped by the URL, so sharing them across query variations
      // would cross-serve results.
      const cached = feedConfig.direct ? feedCache.get(feedConfig.provider) : undefined;
      if (cached && Date.now() - cached.ts < FEED_CACHE_TTL_MS) {
        return selectMatches(cached.items, feedConfig, queryTerms, limit);
      }
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
        const items = Array.isArray(feed.items) ? feed.items : [];
        if (feedConfig.direct) feedCache.set(feedConfig.provider, { ts: Date.now(), items });
        return selectMatches(items, feedConfig, queryTerms, limit);
      } catch (err: any) {
        assertExecutionActive();
        if (err?.code === 'HTTP_BUDGET_EXHAUSTED') return [];
        feedFailures.set(feedConfig.provider, Date.now() + FEED_FAILURE_COOLDOWN_MS);
        const msg = err.message?.slice(0, 60) || '';
        if (!msg.includes('503') && !msg.includes('403') && !msg.includes('404')) {
          console.warn(`[GLOBAL-THINKTANKS] Feed ${feedConfig.provider} failed: ${msg}`);
        }
        return [];
      }
    })
  );

  // allSettled absorbs per-feed rejections — a scope abort thrown inside a
  // callback must still cancel the search, not collapse into an empty result.
  assertExecutionActive();

  const perFeed = results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Round-robin across feeds: a plain flatMap+slice fills the limit with the
  // first feeds in ALL_FEEDS order and silently drops every later feed —
  // new authority sources added at the end would never surface.
  const allResults: any[] = [];
  const maxLen = Math.max(0, ...perFeed.map((a) => a.length));
  for (let i = 0; i < maxLen && allResults.length < limit; i++) {
    for (const arr of perFeed) {
      if (allResults.length >= limit) break;
      if (arr[i]) allResults.push(arr[i]);
    }
  }

  console.log(`[GLOBAL-THINKTANKS] Got ${allResults.length} matching items from ${ALL_FEEDS.length} feeds`);
  return allResults;
}

export { ALL_FEEDS as THINKTANK_FEEDS };
