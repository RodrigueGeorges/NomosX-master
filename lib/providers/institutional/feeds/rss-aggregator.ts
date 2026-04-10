/**
 * RSS/Atom Feed Aggregator pour providers institutionnels
 * BEAUCOUP plus fiable que le scraping HTML
 */

import Parser from 'rss-parser';

const parser = new Parser({
  headers: {
    'User-Agent': 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)'
  }
});

/**
 * Feeds RSS/Atom officiels des institutions
 * Ces URLs sont STABLES (contrairement aux pages HTML)
 */
export const INSTITUTIONAL_FEEDS = {
  // Intelligence & Défense
  'odni': 'https://www.dni.gov/index.php?format=feed&type=rss',
  'nato': 'https://www.nato.int/cps/en/natohq/news.rss',
  'cisa': 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
  
  // Économique
  'imf': 'https://www.imf.org/en/Publications/rss',
  'worldbank': 'https://www.worldbank.org/en/news/all.rss',
  'oecd': 'https://www.oecd.org/news/news.xml',
  'bis': 'https://www.bis.org/doclist/all.rss',
  
  // Multilatéral
  'un': 'https://news.un.org/feed/subscribe/en/news/all/rss.xml',
  
  // Cyber
  'enisa': 'https://www.enisa.europa.eu/rss/publications.rss',
  'nist': 'https://www.nist.gov/news-events/news.rss'
};

/**
 * Fetch et parse un feed RSS
 */
export async function fetchFeed(provider: keyof typeof INSTITUTIONAL_FEEDS, limit = 20) {
  const feedUrl = INSTITUTIONAL_FEEDS[provider];
  if (!feedUrl) {
    throw new Error(`No RSS feed configured for provider: ${provider}`);
  }
  
  console.log(`[RSS] Fetching feed for ${provider}...`);
  
  try {
    const feed = await parser.parseURL(feedUrl);
    
    const sources = feed.items.slice(0, limit).map((item, index) => {
      const year = item.pubDate ? new Date(item.pubDate).getFullYear() : new Date().getFullYear();
      
      return {
        id: `${provider}:rss:${Buffer.from(item.link || item.guid || '').toString('base64').slice(0, 24)}`,
        provider,
        type: 'report',
        title: item.title || 'Untitled',
        abstract: item.contentSnippet || item.content || '',
        url: item.link || '',
        year,
        publishedDate: item.pubDate ? new Date(item.pubDate) : null,
        
        // Metadata
        oaStatus: 'public',
        hasFullText: true,
        
        raw: item
      };
    });
    
    console.log(`[RSS] ${provider}: Found ${sources.length} items`);
    return sources;
    
  } catch (error: any) {
    console.error(`[RSS] ${provider} feed failed: ${error.message}`);
    return [];
  }
}

/**
 * Fetch tous les feeds en parallèle
 */
export async function fetchAllFeeds(providers: Array<keyof typeof INSTITUTIONAL_FEEDS>, limitPerFeed = 10) {
  const results = await Promise.allSettled(
    providers.map(p => fetchFeed(p, limitPerFeed))
  );
  
  const allSources = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<any[]>).value);
  
  console.log(`[RSS] Total: ${allSources.length} sources from ${providers.length} feeds`);
  return allSources;
}
