/**
 * NSA - National Security Agency Publications
 * Legal: 17 U.S.C. §105 - US Government works in public domain
 * URL: https://www.nsa.gov
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.nsa.gov';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchNSA(query: string, limit = 10) {
  const sources: any[] = [];
  
  try {
    console.log(`[NSA] Searching for: "${query}"`);
    
    // NSA search (cyber, cryptography, infrastructure)
    const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(query)}`;
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    
    $('.search-result, .result-item, article').each((i, elem) => {
      if (sources.length >= limit) return false;
      
      const $elem = $(elem);
      const title = $elem.find('h3, h4, .title').text().trim();
      const href = $elem.find('a').first().attr('href');
      const snippet = $elem.find('p, .snippet').first().text().trim();
      const dateText = $elem.find('.date, time').text().trim();
      
      if (!title || !href) return;
      
      const url = href.startsWith('http') ? href : new URL(href, BASE_URL).href;
      const isPDF = url.toLowerCase().endsWith('.pdf');
      
      const yearMatch = dateText.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      
      sources.push({
        id: `nsa:${Buffer.from(url).toString('base64').slice(0, 24)}`,
        provider: 'nsa',
        type: 'report',
        title,
        abstract: snippet || `NSA publication on ${query}`,
        url,
        pdfUrl: isPDF ? url : null,
        year,
        publishedDate: dateText ? new Date(dateText) : null,
        
        documentType: 'report',
        issuer: 'NSA',
        issuerType: 'intelligence',
        classification: 'unclassified',
        language: 'en',
        contentFormat: isPDF ? 'pdf' : 'html',
        oaStatus: 'public-domain',
        hasFullText: true,
        
        raw: { source: 'nsa', searchQuery: query }
      });
    });
    
    console.log(`[NSA] Found ${sources.length} documents`);
  } catch (error: any) {
    console.error(`[NSA] Search failed: ${error.message}`);
  }
  
  return sources;
}
