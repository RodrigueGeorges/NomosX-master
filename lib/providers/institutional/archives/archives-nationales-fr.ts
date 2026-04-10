/**
 * Archives nationales (France)
 * Legal: French Open Data
 * URL: https://www.archives-nationales.culture.gouv.fr
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.siv.archives-nationales.culture.gouv.fr';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchArchivesNationalesFR(query: string, limit = 10) {
  const sources: any[] = [];
  
  try {
    console.log(`[Archives Nationales FR] Searching for: "${query}"`);
    
    const searchUrl = `${BASE_URL}/siv/rechercheExperts/n.form?n=${encodeURIComponent(query)}`;
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    
    $('.notice, .result-item, .record').each((i, elem) => {
      if (sources.length >= limit) return false;
      
      const $elem = $(elem);
      const title = $elem.find('h3, h4, .title').text().trim();
      const href = $elem.find('a').first().attr('href');
      const description = $elem.find('.description, p').first().text().trim();
      const dateText = $elem.find('.date, .dates').text().trim();
      
      if (!title || !href) return;
      
      const url = href.startsWith('http') ? href : new URL(href, BASE_URL).href;
      
      const yearMatch = dateText.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      
      sources.push({
        id: `archives-fr:${Buffer.from(url).toString('base64').slice(0, 24)}`,
        provider: 'archives-fr',
        type: 'archive',
        title,
        abstract: description || `Archives nationales - ${query}`,
        url,
        pdfUrl: null,
        year,
        publishedDate: dateText ? new Date(dateText) : null,
        
        documentType: 'archive',
        issuer: 'Archives nationales',
        issuerType: 'defense',
        classification: 'public',
        language: 'fr',
        contentFormat: 'html',
        oaStatus: 'french-open-data',
        hasFullText: false,
        
        raw: { source: 'archives-fr', searchQuery: query }
      });
    });
    
    console.log(`[Archives Nationales FR] Found ${sources.length} records`);
  } catch (error: any) {
    console.error(`[Archives Nationales FR] Search failed: ${error.message}`);
  }
  
  return sources;
}
