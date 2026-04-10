/**
 * CIA FOIA Reading Room - Declassified documents
 * Legal: Freedom of Information Act - Public domain
 * URL: https://www.cia.gov/readingroom/
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.cia.gov';
const READING_ROOM = `${BASE_URL}/readingroom`;
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchCIAFOIA(query: string, limit = 10) {
  const sources: any[] = [];
  
  try {
    console.log(`[CIA-FOIA] Searching declassified docs for: "${query}"`);
    
    // CIA Reading Room search
    const searchUrl = `${READING_ROOM}/search/site/${encodeURIComponent(query)}`;
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 20000
    });
    
    const $ = cheerio.load(data);
    
    // Parse results
    $('.views-row, .search-result, article').each((i, elem) => {
      if (sources.length >= limit) return false;
      
      const $elem = $(elem);
      const title = $elem.find('h3, h4, .title a, .views-field-title').text().trim();
      const href = $elem.find('a').first().attr('href');
      const snippet = $elem.find('.views-field-body, .description, p').first().text().trim();
      const dateText = $elem.find('.date, .views-field-created, time').text().trim();
      
      if (!title || !href) return;
      
      const url = href.startsWith('http') ? href : new URL(href, BASE_URL).href;
      const isPDF = url.toLowerCase().includes('.pdf');
      
      // Extract year (many docs are historical)
      const yearMatch = dateText.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      
      sources.push({
        id: `cia-foia:${Buffer.from(url).toString('base64').slice(0, 24)}`,
        provider: 'cia-foia',
        type: 'declassified',
        title,
        abstract: snippet || `CIA declassified document on ${query}`,
        url,
        pdfUrl: isPDF ? url : null,
        year,
        publishedDate: dateText ? new Date(dateText) : null,
        
        // Institutional metadata
        documentType: 'declassified',
        issuer: 'CIA',
        issuerType: 'intelligence',
        classification: 'declassified',
        language: 'en',
        contentFormat: isPDF ? 'pdf' : 'html',
        oaStatus: 'public-domain',
        hasFullText: isPDF,
        securityLevel: 'formerly-classified',
        
        raw: { source: 'cia-foia', searchQuery: query }
      });
    });
    
    console.log(`[CIA-FOIA] Found ${sources.length} declassified documents`);
  } catch (error: any) {
    console.error(`[CIA-FOIA] Search failed: ${error.message}`);
  }
  
  return sources;
}
