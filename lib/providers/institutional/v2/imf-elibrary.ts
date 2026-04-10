/**
 * IMF eLibrary - Structured scraping
 * Site académique stable, structure HTML prévisible
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const IMF_DATA_API = 'https://www.imf.org/en/Publications/Search';
const IMF_WP_RSS = 'https://www.imf.org/en/Publications/WP/RSS';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Search IMF publications via RSS feeds and data API
 * Multiple fallback sources for reliability
 */
export async function searchIMFeLibrary(query: string, limit = 20) {
  const sources: any[] = [];
  const queryLower = query.toLowerCase();
  
  try {
    console.log(`[IMF-eLibrary] Searching for: "${query}"`);
    
    // Try RSS feed first (most reliable)
    try {
      const parser = new (await import('rss-parser')).default();
      const feed = await parser.parseURL(IMF_WP_RSS);
      
      const filtered = feed.items
        .filter(item => 
          item.title?.toLowerCase().includes(queryLower) ||
          item.contentSnippet?.toLowerCase().includes(queryLower)
        )
        .slice(0, limit);
      
      for (const item of filtered) {
        const year = item.pubDate ? new Date(item.pubDate).getFullYear() : null;
        
        sources.push({
          id: `imf:${Buffer.from(item.link || item.title || '').toString('base64').slice(0, 24)}`,
          provider: 'imf',
          type: 'report',
          title: item.title || 'Untitled',
          abstract: item.contentSnippet || item.content || '',
          url: item.link || '',
          year,
          publishedDate: item.pubDate ? new Date(item.pubDate) : null,
          
          documentType: 'working-paper',
          issuer: 'IMF',
          issuerType: 'economic',
          classification: 'public',
          language: 'en',
          contentFormat: 'pdf',
          oaStatus: 'open',
          
          raw: item
        });
      }
    } catch (rssError: any) {
      console.log(`[IMF-eLibrary] RSS feed unavailable: ${rssError.message}`);
    }
    
    // Fallback: scrape search page
    if (sources.length === 0) {
      try {
        const searchUrl = `${IMF_DATA_API}?Keywords=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 15000
        });
        
        const $ = cheerio.load(data);
        
        $('.result-item, .pub-item, .search-result-item').each((i, el) => {
          if (sources.length >= limit) return;
          
          const $item = $(el);
          const title = $item.find('h3, h4, .title, a.title-link').first().text().trim();
          const abstract = $item.find('.description, .abstract, .summary, p').first().text().trim();
          const link = $item.find('a').first().attr('href');
          const dateText = $item.find('.date, .pub-date, time').text();
          const yearMatch = dateText.match(/\d{4}/);
          
          if (title && link) {
            sources.push({
              id: `imf:${Buffer.from(link).toString('base64').slice(0, 24)}`,
              provider: 'imf',
              type: 'report',
              title,
              abstract: abstract.substring(0, 500),
              url: link.startsWith('http') ? link : `https://www.imf.org${link}`,
              year: yearMatch ? parseInt(yearMatch[0]) : null,
              
              documentType: title.toLowerCase().includes('working paper') ? 'working-paper' : 'report',
              issuer: 'IMF',
              issuerType: 'economic',
              classification: 'public',
              language: 'en',
              contentFormat: 'pdf',
              oaStatus: 'open'
            });
          }
        });
      } catch (scrapeError: any) {
        console.log(`[IMF-eLibrary] Scrape failed: ${scrapeError.message}`);
      }
    }
    
    console.log(`[IMF-eLibrary] Found ${sources.length} publications`);
  } catch (error: any) {
    console.error(`[IMF-eLibrary] Search failed: ${error.message}`);
  }
  
  return sources;
}
