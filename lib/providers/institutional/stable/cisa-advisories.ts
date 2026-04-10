/**
 * CISA Cybersecurity Advisories - STABLE & PRODUCTION-READY
 * XML Feed: https://www.cisa.gov/cybersecurity-advisories/all.xml
 * Très stable, mis à jour quotidiennement
 */

import Parser from 'rss-parser';

const CISA_FEED = 'https://www.cisa.gov/cybersecurity-advisories/all.xml';
const parser = new Parser({
  headers: {
    'User-Agent': 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)'
  }
});

/**
 * Fetch CISA advisories via official XML feed
 * TESTÉ : Fonctionne parfaitement
 */
export async function searchCISAAdvisories(query: string, limit = 15) {
  const sources: any[] = [];
  
  try {
    console.log(`[CISA] Fetching advisories feed...`);
    
    const feed = await parser.parseURL(CISA_FEED);
    
    // Filter by query if provided
    const filtered = query 
      ? feed.items.filter(item => 
          item.title?.toLowerCase().includes(query.toLowerCase()) ||
          item.contentSnippet?.toLowerCase().includes(query.toLowerCase())
        )
      : feed.items;
    
    for (const item of filtered.slice(0, limit)) {
      const year = item.pubDate ? new Date(item.pubDate).getFullYear() : new Date().getFullYear();
      
      // Detect advisory type from title
      let docType = 'assessment';
      if (item.title?.includes('CISA Alert')) docType = 'alert';
      if (item.title?.includes('ICS Advisory')) docType = 'ics-advisory';
      
      sources.push({
        id: `cisa:${Buffer.from(item.link || item.guid || '').toString('base64').slice(0, 24)}`,
        provider: 'cisa',
        type: 'advisory',
        title: item.title || 'Untitled Advisory',
        abstract: item.contentSnippet || item.content || '',
        url: item.link || '',
        year,
        publishedDate: item.pubDate ? new Date(item.pubDate) : null,
        
        // Institutional metadata
        documentType: docType,
        issuer: 'CISA',
        issuerType: 'cyber',
        classification: 'unclassified',
        language: 'en',
        contentFormat: 'html',
        oaStatus: 'public-domain',
        hasFullText: true,
        
        raw: item
      });
    }
    
    console.log(`[CISA] Found ${sources.length} advisories (filtered from ${feed.items.length})`);
  } catch (error: any) {
    console.error(`[CISA] Feed fetch failed: ${error.message}`);
  }
  
  return sources;
}
