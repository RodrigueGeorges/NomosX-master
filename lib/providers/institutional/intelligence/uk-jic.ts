/**
 * UK Joint Intelligence Committee & National Archives
 * Legal: UK Open Government Licence
 * URL: https://www.gov.uk
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.gov.uk';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchUKJIC(query: string, limit = 10) {
  const sources: any[] = [];
  
  try {
    console.log(`[UK-JIC] Searching UK Government publications for: "${query}"`);
    
    // Search gov.uk for intelligence/defense publications
    const searchUrl = `${BASE_URL}/search/all?keywords=${encodeURIComponent(query)}&filter_organisations=joint-intelligence-committee`;
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    
    $('.gem-c-document-list__item, .search-result').each((i, elem) => {
      if (sources.length >= limit) return false;
      
      const $elem = $(elem);
      const title = $elem.find('a, .gem-c-document-list__item-title').text().trim();
      const href = $elem.find('a').first().attr('href');
      const snippet = $elem.find('p, .gem-c-document-list__item-description').text().trim();
      const dateText = $elem.find('time, .date').text().trim();
      
      if (!title || !href) return;
      
      const url = href.startsWith('http') ? href : new URL(href, BASE_URL).href;
      
      const yearMatch = dateText.match(/\b(20\d{2})\b/) || title.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      
      sources.push({
        id: `uk-jic:${Buffer.from(url).toString('base64').slice(0, 24)}`,
        provider: 'uk-jic',
        type: 'report',
        title,
        abstract: snippet || `UK Government publication on ${query}`,
        url,
        pdfUrl: url.toLowerCase().endsWith('.pdf') ? url : null,
        year,
        publishedDate: dateText ? new Date(dateText) : null,
        
        documentType: title.toLowerCase().includes('assessment') ? 'assessment' : 'report',
        issuer: 'UK Government',
        issuerType: 'intelligence',
        classification: 'unclassified',
        language: 'en',
        contentFormat: url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html',
        oaStatus: 'open-government-licence',
        hasFullText: true,
        
        raw: { source: 'uk-jic', searchQuery: query }
      });
    });
    
    console.log(`[UK-JIC] Found ${sources.length} documents`);
  } catch (error: any) {
    console.error(`[UK-JIC] Search failed: ${error.message}`);
  }
  
  return sources;
}
