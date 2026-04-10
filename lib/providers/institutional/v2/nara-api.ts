/**
 * NARA (National Archives) - OFFICIAL API ✅
 * API Docs: https://catalog.archives.gov/api/v1/
 * Cette API existe vraiment et est officielle !
 */

import axios from 'axios';

const NARA_API_BASE = 'https://catalog.archives.gov/api/v1';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

/**
 * Search NARA Catalog via official API
 * API officielle, gratuite, très complète
 */
export async function searchNARA(query: string, limit = 20) {
  const sources: any[] = [];
  
  try {
    console.log(`[NARA-API] Searching for: "${query}"`);
    
    const params = {
      q: query,
      rows: limit,
      resultFields: 'naId,title,description,publicContributions,objects,fileUnits,parentSeries,parentRecordGroup',
      sort: 'naIdSort desc'
    };
    
    const { data } = await axios.get(NARA_API_BASE, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 20000
    });
    
    if (data.opaResponse?.results?.result) {
      const results = Array.isArray(data.opaResponse.results.result) 
        ? data.opaResponse.results.result 
        : [data.opaResponse.results.result];
      
      for (const item of results) {
        const desc = item.description || {};
        
        sources.push({
          id: `nara:${item.naId}`,
          provider: 'nara',
          type: 'archival',
          title: desc.title || 'Untitled Record',
          abstract: desc.scopeAndContentNote || desc.description || '',
          url: `https://catalog.archives.gov/id/${item.naId}`,
          year: desc.productionDateArray?.[0]?.year || null,
          publishedDate: desc.productionDateArray?.[0]?.logicalDate || null,
          
          // Institutional metadata
          documentType: desc.levelOfDescription || 'record',
          issuer: 'NARA',
          issuerType: 'intelligence',
          classification: desc.accessRestriction?.status || 'unclassified',
          language: 'en',
          contentFormat: item.objects ? 'digital' : 'physical',
          oaStatus: 'public-domain',
          hasFullText: Boolean(item.objects),
          
          // NARA-specific
          recordGroup: item.parentRecordGroup?.title,
          series: item.parentSeries?.title,
          
          raw: item
        });
      }
    }
    
    console.log(`[NARA-API] Found ${sources.length} records`);
  } catch (error: any) {
    console.error(`[NARA-API] Search failed: ${error.message}`);
  }
  
  return sources;
}
