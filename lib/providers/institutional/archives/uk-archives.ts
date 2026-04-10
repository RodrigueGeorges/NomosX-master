/**
 * UK National Archives
 * Legal: UK Open Government Licence
 * URL: https://discovery.nationalarchives.gov.uk
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://discovery.nationalarchives.gov.uk';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchUKArchives(query: string, limit = 10) {
  const sources: any[] = [];
  
  try {
    console.log(`[UK Archives] Searching for: "${query}"`);
    
    const searchUrl = `${BASE_URL}/results/r?_q=${encodeURIComponent(query)}`;
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    
    $('.record, .result-item').each((i, elem) => {
      if (sources.length >= limit) return false;
      
      const $elem = $(elem);
      const title = $elem.find('h3, .title a').text().trim();
      const href = $elem.find('a').first().attr('href');
      const description = $elem.find('.description, p').first().text().trim();
      const dateText = $elem.find('.date, .covering-dates').text().trim();
      
      if (!title || !href) return;
      
      const url = href.startsWith('http') ? href : new URL(href, BASE_URL).href;
      
      const yearMatch = dateText.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      
      sources.push({
        id: `uk-archives:${Buffer.from(url).toString('base64').slice(0, 24)}`,
        provider: 'uk-archives',
        type: 'archive',
        title,
        abstract: description || `UK National Archives record on ${query}`,
        url,
        pdfUrl: null,
        year,
        publishedDate: dateText ? new Date(dateText) : null,
        
        documentType: 'archive',
        issuer: 'UK National Archives',
        issuerType: 'intelligence',
        classification: 'public',
        language: 'en',
        contentFormat: 'html',
        oaStatus: 'open-government-licence',
        hasFullText: false,
        
        raw: { source: 'uk-archives', searchQuery: query }
      });
    });
    
    console.log(`[UK Archives] Found ${sources.length} records`);
  } catch (error: any) {
    console.error(`[UK Archives] Search failed: ${error.message}`);
  }
  
  return sources;
}
