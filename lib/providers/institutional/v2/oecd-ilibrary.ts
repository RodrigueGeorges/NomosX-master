/**
 * OECD iLibrary - Structured scraping
 * Alternative à l'API SDMX complexe
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const OECD_ILIBRARY_BASE = 'https://www.oecd-ilibrary.org';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

/**
 * Search OECD iLibrary
 * Structure similaire à IMF eLibrary (Silverchair)
 */
export async function searchOECDiLibrary(query: string, limit = 20) {
  const sources: any[] = [];
  
  try {
    console.log(`[OECD-iLibrary] Searching for: "${query}"`);
    
    const searchUrl = `${OECD_ILIBRARY_BASE}/search`;
    const params = {
      value1: query,
      option1: 'fulltext',
      pageSize: limit
    };
    
    const { data } = await axios.get(searchUrl, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    
    $('.search-result-item').each((i, el) => {
      const $item = $(el);
      
      const title = $item.find('.title').text().trim();
      const abstract = $item.find('.abstract').text().trim();
      const url = $item.find('a.title-link').attr('href');
      const yearMatch = $item.find('.date').text().match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : null;
      
      if (title && url) {
        sources.push({
          id: `oecd:${Buffer.from(url).toString('base64').slice(0, 24)}`,
          provider: 'oecd',
          type: 'report',
          title,
          abstract,
          url: url.startsWith('http') ? url : `${OECD_ILIBRARY_BASE}${url}`,
          year,
          publishedDate: year ? new Date(year, 0, 1) : null,
          
          // Metadata
          documentType: 'report',
          issuer: 'OECD',
          issuerType: 'economic',
          classification: 'public',
          language: 'en',
          contentFormat: 'pdf',
          oaStatus: 'open',
          hasFullText: true
        });
      }
    });
    
    console.log(`[OECD-iLibrary] Found ${sources.length} publications`);
  } catch (error: any) {
    console.error(`[OECD-iLibrary] Search failed: ${error.message}`);
  }
  
  return sources;
}
