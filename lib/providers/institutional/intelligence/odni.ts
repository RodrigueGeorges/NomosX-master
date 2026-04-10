/**
 * ODNI - Office of the Director of National Intelligence
 * Legal: 17 U.S.C. §105 - US Government works in public domain
 * URL: https://www.dni.gov
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.dni.gov';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchODNI(query: string, limit = 10) {
  const sources: any[] = [];
  
  try {
    console.log(`[ODNI] Searching for: "${query}"`);
    
    // ODNI search endpoint
    const searchUrl = `${BASE_URL}/index.php/search?searchword=${encodeURIComponent(query)}&ordering=newest`;
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    
    // Parse search results
    $('.search-results .result-item, .search-result, article.item').each((i, elem) => {
      if (sources.length >= limit) return false;
      
      const $elem = $(elem);
      const title = $elem.find('h3, h4, .result-title, .item-title').text().trim();
      const href = $elem.find('a').first().attr('href');
      const snippet = $elem.find('p, .result-snippet, .item-description').first().text().trim();
      const dateText = $elem.find('.date, .published, time').text().trim();
      
      if (!title || !href) return;
      
      const url = href.startsWith('http') ? href : new URL(href, BASE_URL).href;
      const isPDF = url.toLowerCase().endsWith('.pdf');
      
      // Extract year from date text
      const yearMatch = dateText.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      
      sources.push({
        id: `odni:${Buffer.from(url).toString('base64').slice(0, 24)}`,
        provider: 'odni',
        type: 'report',
        title,
        abstract: snippet || `ODNI publication on ${query}`,
        url,
        pdfUrl: isPDF ? url : null,
        year,
        publishedDate: dateText ? new Date(dateText) : null,
        
        // Institutional metadata
        documentType: title.toLowerCase().includes('assessment') ? 'assessment' : 'report',
        issuer: 'ODNI',
        issuerType: 'intelligence',
        classification: 'unclassified',
        language: 'en',
        contentFormat: isPDF ? 'pdf' : 'html',
        oaStatus: 'public-domain',
        hasFullText: true,
        
        raw: { source: 'odni', searchQuery: query }
      });
    });
    
    console.log(`[ODNI] Found ${sources.length} documents`);
  } catch (error: any) {
    console.error(`[ODNI] Search failed: ${error.message}`);
  }
  
  return sources;
}
