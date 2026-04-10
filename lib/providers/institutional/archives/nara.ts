/**
 * NARA - National Archives and Records Administration (US)
 * Legal: 17 U.S.C. §105 - US Government works in public domain
 * URL: https://catalog.archives.gov
 */

import axios from 'axios';

const BASE_URL = 'https://catalog.archives.gov';
const API_URL = `${BASE_URL}/api/v1`;
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchNARA(query: string, limit = 10) {
  const sources: any[] = [];
  
  try {
    console.log(`[NARA] Searching National Archives for: "${query}"`);
    
    // NARA has a proper API
    const searchUrl = `${API_URL}/?q=${encodeURIComponent(query)}&resultTypes=item&rows=${limit}`;
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    if (data.opaResponse?.results?.result) {
      const results = Array.isArray(data.opaResponse.results.result) 
        ? data.opaResponse.results.result 
        : [data.opaResponse.results.result];
      
      for (const item of results) {
        if (sources.length >= limit) break;
        
        const naId = item.naId;
        const title = item.description?.title || 'Untitled';
        const description = item.description?.scopeAndContentNote || '';
        const date = item.description?.coverageDates || '';
        
        const url = `${BASE_URL}/id/${naId}`;
        
        // Extract year
        const yearMatch = date.match(/\b(19\d{2}|20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;
        
        sources.push({
          id: `nara:${naId}`,
          provider: 'nara',
          type: 'archive',
          title,
          abstract: description || `National Archives record on ${query}`,
          url,
          pdfUrl: null,
          year,
          publishedDate: date ? new Date(date) : null,
          
          documentType: 'archive',
          issuer: 'NARA',
          issuerType: 'intelligence',
          classification: item.description?.accessRestriction?.status === 'u' ? 'unclassified' : 'declassified',
          language: 'en',
          contentFormat: 'api',
          oaStatus: 'public-domain',
          hasFullText: false, // Mostly metadata, full docs require request
          
          raw: { source: 'nara', naId, item }
        });
      }
    }
    
    console.log(`[NARA] Found ${sources.length} records`);
  } catch (error: any) {
    console.error(`[NARA] Search failed: ${error.message}`);
  }
  
  return sources;
}
