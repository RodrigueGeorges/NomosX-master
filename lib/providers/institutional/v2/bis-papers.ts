/**
 * BIS Working Papers - Sequential crawl + RSS
 * URLs prévisibles pour papers (numéros séquentiels)
 */

import axios from 'axios';
import Parser from 'rss-parser';

const BIS_RSS = 'https://www.bis.org/doclist/all.rss';
const BIS_PAPER_BASE = 'https://www.bis.org/publ';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

const parser = new Parser({ headers: { 'User-Agent': USER_AGENT } });

/**
 * Search BIS publications via RSS + paper crawl
 */
export async function searchBIS(query: string, limit = 20) {
  const sources: any[] = [];
  
  try {
    console.log(`[BIS] Searching for: "${query}"`);
    
    // 1. Fetch RSS (récent)
    const feed = await parser.parseURL(BIS_RSS);
    
    const filtered = feed.items
      .filter(item => 
        item.title?.toLowerCase().includes(query.toLowerCase()) ||
        item.contentSnippet?.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, limit);
    
    for (const item of filtered) {
      const year = item.pubDate ? new Date(item.pubDate).getFullYear() : null;
      
      sources.push({
        id: `bis:rss:${Buffer.from(item.link || '').toString('base64').slice(0, 24)}`,
        provider: 'bis',
        type: 'report',
        title: item.title || 'Untitled',
        abstract: item.contentSnippet || '',
        url: item.link || '',
        year,
        publishedDate: item.pubDate ? new Date(item.pubDate) : null,
        
        // Metadata
        documentType: item.title?.includes('Working Papers') ? 'working-paper' : 'report',
        issuer: 'BIS',
        issuerType: 'economic',
        classification: 'public',
        language: 'en',
        contentFormat: 'pdf',
        oaStatus: 'open',
        hasFullText: true
      });
    }
    
    console.log(`[BIS] Found ${sources.length} publications`);
  } catch (error: any) {
    console.error(`[BIS] Search failed: ${error.message}`);
  }
  
  return sources;
}

/**
 * Crawl BIS Working Papers par numéro séquentiel
 * Utile si query spécifique ne matche pas RSS
 */
export async function crawlBISPapers(startNum: number, endNum: number) {
  const papers = [];
  
  for (let num = startNum; num <= endNum; num++) {
    try {
      const url = `${BIS_PAPER_BASE}/work${num}.htm`;
      const { data } = await axios.head(url, { timeout: 5000 });
      
      if (data) {
        papers.push({
          id: `bis:work${num}`,
          provider: 'bis',
          type: 'working-paper',
          title: `BIS Working Paper No ${num}`,
          url,
          pdfUrl: `${BIS_PAPER_BASE}/work${num}.pdf`,
          documentType: 'working-paper',
          issuer: 'BIS',
          issuerType: 'economic',
          oaStatus: 'open',
          hasFullText: true
        });
      }
    } catch (error) {
      // Paper doesn't exist, skip
    }
  }
  
  return papers;
}
